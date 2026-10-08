package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

// fakeTurso implementa o subconjunto do pipeline HTTP do Turso usado pelo
// desktop, sobre um SQLite em memória. Permite testar várias "máquinas"
// (bancos locais independentes) compartilhando o mesmo banco remoto.
type fakeTurso struct {
	mu sync.Mutex
	db *sql.DB
}

func newFakeTurso(t *testing.T) (*fakeTurso, *httptest.Server) {
	t.Helper()
	name := strings.NewReplacer("/", "_", " ", "_").Replace(t.Name())
	db, err := sql.Open("sqlite", fmt.Sprintf("file:%s-%d?mode=memory&cache=shared", name, time.Now().UnixNano()))
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	fake := &fakeTurso{db: db}
	server := httptest.NewServer(fake)
	t.Cleanup(func() {
		server.Close()
		_ = db.Close()
	})
	return fake, server
}

func (f *fakeTurso) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()

	var body fakePipelineBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	// Como o Turso real: argumentos com tipo inválido derrubam o pipeline
	// inteiro com HTTP 400 (ex.: float enviado como string).
	for _, request := range body.Requests {
		if request.Stmt == nil {
			continue
		}
		for _, arg := range request.Stmt.Args {
			if _, err := arg.decode(); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
		}
	}
	var tx *sql.Tx
	results := make([]map[string]any, 0, len(body.Requests))
	for _, request := range body.Requests {
		if request.Type == "close" {
			results = append(results, map[string]any{"type": "ok"})
			continue
		}
		result, nextTx, err := f.execute(tx, request.Stmt)
		if err != nil {
			if tx != nil {
				_ = tx.Rollback()
				tx = nil
			}
			results = append(results, map[string]any{"type": "error", "error": map[string]string{"message": err.Error()}})
			break
		}
		tx = nextTx
		results = append(results, result)
	}
	if tx != nil {
		_ = tx.Rollback()
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"results": results})
}

func (f *fakeTurso) execute(tx *sql.Tx, statement *fakeStmt) (map[string]any, *sql.Tx, error) {
	sqlText := strings.TrimSpace(statement.SQL)
	upper := strings.ToUpper(sqlText)
	switch upper {
	case "BEGIN":
		next, err := f.db.Begin()
		return okResult(nil, nil, 0), next, err
	case "COMMIT":
		if tx == nil {
			return nil, nil, fmt.Errorf("commit sem transação")
		}
		return okResult(nil, nil, 0), nil, tx.Commit()
	}

	args := make([]any, len(statement.Args))
	for index, arg := range statement.Args {
		value, err := arg.decode()
		if err != nil {
			return nil, tx, err
		}
		args[index] = value
	}

	if strings.HasPrefix(upper, "SELECT") || strings.HasPrefix(upper, "WITH") {
		var rows *sql.Rows
		var err error
		if tx != nil {
			rows, err = tx.Query(sqlText, args...)
		} else {
			rows, err = f.db.Query(sqlText, args...)
		}
		if err != nil {
			return nil, tx, err
		}
		defer rows.Close()
		columns, _ := rows.Columns()
		cols := make([]map[string]string, len(columns))
		for i, column := range columns {
			cols[i] = map[string]string{"name": column}
		}
		encodedRows := make([][]map[string]any, 0)
		for rows.Next() {
			values := make([]any, len(columns))
			pointers := make([]any, len(columns))
			for i := range values {
				pointers[i] = &values[i]
			}
			if err := rows.Scan(pointers...); err != nil {
				return nil, tx, err
			}
			encoded := make([]map[string]any, len(values))
			for i, value := range values {
				encoded[i] = encodeFakeValue(value)
			}
			encodedRows = append(encodedRows, encoded)
		}
		return okResult(cols, encodedRows, 0), tx, rows.Err()
	}

	var result sql.Result
	var err error
	if tx != nil {
		result, err = tx.Exec(sqlText, args...)
	} else {
		result, err = f.db.Exec(sqlText, args...)
	}
	if err != nil {
		return nil, tx, err
	}
	affected, _ := result.RowsAffected()
	return okResult(nil, nil, affected), tx, nil
}

func okResult(cols []map[string]string, rows [][]map[string]any, affected int64) map[string]any {
	if cols == nil {
		cols = []map[string]string{}
	}
	if rows == nil {
		rows = [][]map[string]any{}
	}
	return map[string]any{
		"type": "ok",
		"response": map[string]any{
			"type":   "execute",
			"result": map[string]any{"cols": cols, "rows": rows, "affected_row_count": affected},
		},
	}
}

// Estruturas do pipeline Hrana com value bruto, para validar tipos como o
// servidor real (integer/text em string, float obrigatoriamente número).
type fakePipelineBody struct {
	Requests []struct {
		Type string    `json:"type"`
		Stmt *fakeStmt `json:"stmt"`
	} `json:"requests"`
}

type fakeStmt struct {
	SQL  string    `json:"sql"`
	Args []fakeArg `json:"args"`
}

type fakeArg struct {
	Type  string          `json:"type"`
	Value json.RawMessage `json:"value"`
}

func (a fakeArg) decode() (any, error) {
	isString := len(a.Value) > 0 && a.Value[0] == '"'
	switch a.Type {
	case "null":
		return nil, nil
	case "integer", "text":
		if !isString {
			return nil, fmt.Errorf("%s value must be a JSON string, got %s", a.Type, string(a.Value))
		}
		var text string
		if err := json.Unmarshal(a.Value, &text); err != nil {
			return nil, err
		}
		if a.Type == "integer" {
			return strconv.ParseInt(text, 10, 64)
		}
		return text, nil
	case "float":
		if isString {
			return nil, fmt.Errorf("invalid type: string %s, expected f64", string(a.Value))
		}
		var number float64
		if err := json.Unmarshal(a.Value, &number); err != nil {
			return nil, err
		}
		return number, nil
	default:
		return nil, fmt.Errorf("tipo hrana não suportado: %q", a.Type)
	}
}

func encodeFakeValue(value any) map[string]any {
	switch typed := value.(type) {
	case nil:
		return map[string]any{"type": "null"}
	case int64:
		return map[string]any{"type": "integer", "value": strconv.FormatInt(typed, 10)}
	case float64:
		return map[string]any{"type": "float", "value": typed}
	case []byte:
		return map[string]any{"type": "text", "value": string(typed)}
	default:
		return map[string]any{"type": "text", "value": fmt.Sprint(typed)}
	}
}

func (f *fakeTurso) count(t *testing.T, query string, args ...any) int {
	t.Helper()
	f.mu.Lock()
	defer f.mu.Unlock()
	var value int
	if err := f.db.QueryRow(query, args...).Scan(&value); err != nil {
		t.Fatalf("fake turso query %q: %v", query, err)
	}
	return value
}

func newTestMachine(t *testing.T, name string) *App {
	t.Helper()
	app, err := NewApp(filepath.Join(t.TempDir(), name+".db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = app.Close() })
	return app
}

func mustSync(t *testing.T, app *App, databaseURL string) SyncResult {
	t.Helper()
	result, err := app.store.syncNow("", databaseURL, "test-token")
	if err != nil {
		t.Fatalf("sync falhou: %v", err)
	}
	return result
}

func noteTitles(t *testing.T, app *App) map[string]string {
	t.Helper()
	notes, err := app.store.listNotes(false)
	if err != nil {
		t.Fatal(err)
	}
	titles := make(map[string]string, len(notes))
	for _, note := range notes {
		titles[note.ID] = note.Title
	}
	return titles
}

func TestCanonicalTursoURLUnifiesEquivalentForms(t *testing.T) {
	base := deriveSyncProfileID("libsql://minhas-notas-magnetares.turso.io")
	for _, variant := range []string{
		"libsql://minhas-notas-magnetares.turso.io/",
		"  LIBSQL://minhas-notas-magnetares.turso.io  ",
		"https://minhas-notas-magnetares.turso.io",
		"https://minhas-notas-magnetares.turso.io:443/v2/pipeline",
		"wss://minhas-notas-magnetares.turso.io",
	} {
		if got := deriveSyncProfileID(variant); got != base {
			t.Fatalf("variante %q gerou perfil %s, esperado %s", variant, got, base)
		}
	}
	// Compatibilidade: o formato oficial do Turso mantém o mesmo perfil da regra antiga.
	if legacy := legacySyncProfileID("libsql://minhas-notas-magnetares.turso.io"); legacy != base {
		t.Fatalf("perfil canônico mudou para URLs libsql:// já normalizadas: %s != %s", base, legacy)
	}
	if deriveSyncProfileID("libsql://outro-banco.turso.io") == base {
		t.Fatal("bancos diferentes não podem compartilhar perfil")
	}
}

func TestTwoMachinesWithDifferentURLFormsShareTheSamePartition(t *testing.T) {
	fake, server := newFakeTurso(t)
	urlA := server.URL
	urlB := server.URL + "/" // mesma base, digitada de outra forma

	machineA := newTestMachine(t, "machine-a")
	machineB := newTestMachine(t, "machine-b")

	if _, err := machineA.SaveNote(Note{ID: "note-shared", Title: "Criada no A", Body: `{"type":"doc"}`, BodyText: "A"}); err != nil {
		t.Fatal(err)
	}
	mustSync(t, machineA, urlA)
	mustSync(t, machineB, urlB)

	if got := noteTitles(t, machineB)["note-shared"]; got != "Criada no A" {
		t.Fatalf("máquina B não recebeu a nota da máquina A (título=%q)", got)
	}

	if _, err := machineB.SaveNote(Note{ID: "note-shared", Title: "Editada no B", Body: `{"type":"doc"}`, BodyText: "B"}); err != nil {
		t.Fatal(err)
	}
	mustSync(t, machineB, urlB)
	mustSync(t, machineA, urlA)

	if got := noteTitles(t, machineA)["note-shared"]; got != "Editada no B" {
		t.Fatalf("máquina A não recebeu a edição da máquina B (título=%q)", got)
	}
	if partitions := fake.count(t, "SELECT COUNT(DISTINCT user_id) FROM sync_notes"); partitions != 1 {
		t.Fatalf("esperada uma única partição remota, encontradas %d", partitions)
	}
}

// simulateOutdatedSync reproduz o comportamento da v1.6.0: grava diretamente
// na partição indicada, sem consultar o perfil principal do banco remoto.
func simulateOutdatedSync(t *testing.T, app *App, profileID, databaseURL string) {
	t.Helper()
	var cursor string
	if err := app.store.db.QueryRow("SELECT pull_cursor FROM sync_metadata WHERE singleton = 1").Scan(&cursor); err != nil {
		t.Fatal(err)
	}
	if _, err := app.store.db.Exec("UPDATE sync_metadata SET sync_profile_id = ? WHERE singleton = 1", profileID); err != nil {
		t.Fatal(err)
	}
	if _, err := app.store.syncDirectTurso(profileID, cursor, databaseURL, "test-token"); err != nil {
		t.Fatal(err)
	}
}

func remotePrimary(t *testing.T, fake *fakeTurso) string {
	t.Helper()
	fake.mu.Lock()
	defer fake.mu.Unlock()
	var value string
	if err := fake.db.QueryRow("SELECT value FROM sync_settings WHERE key = 'primary_profile_id'").Scan(&value); err != nil {
		t.Fatalf("perfil principal não registrado: %v", err)
	}
	return value
}

func TestOfflineResolutionNeverSwitchesStoredProfile(t *testing.T) {
	app := newTestMachine(t, "offline")
	stored := "6f1c2a10-0000-4000-8000-000000000009"
	if _, err := app.store.db.Exec("UPDATE sync_metadata SET sync_profile_id = ?, pull_cursor = '42' WHERE singleton = 1", stored); err != nil {
		t.Fatal(err)
	}
	resolution, err := app.store.resolveSyncProfile("libsql://outro-host.turso.io", "")
	if err != nil {
		t.Fatal(err)
	}
	if resolution.ProfileID != stored || resolution.changed() || resolution.Cursor != "42" || resolution.Source != syncProfileSourceLegacy {
		t.Fatalf("resolução offline não pode trocar o perfil: %#v", resolution)
	}
}

// com a versão nova calcula outro perfil a partir da URL. Ela deve adotar a
// partição que já tem dados, e não criar uma partição vazia.
func TestNewVersionAdoptsPartitionThatAlreadyHasData(t *testing.T) {
	fake, server := newFakeTurso(t)
	existing := "6f1c2a10-0000-4000-8000-000000000001"

	outdated := newTestMachine(t, "v160")
	if _, err := outdated.SaveNote(Note{ID: "note-existing", Title: "Nota da máquina antiga", Body: `{"type":"doc"}`, BodyText: "x"}); err != nil {
		t.Fatal(err)
	}
	simulateOutdatedSync(t, outdated, existing, server.URL)

	upgraded := newTestMachine(t, "novo")
	result := mustSync(t, upgraded, server.URL)

	if primary := remotePrimary(t, fake); primary != existing {
		t.Fatalf("perfil principal deveria ser a partição com dados %s, foi %s", existing, primary)
	}
	if got := noteTitles(t, upgraded)["note-existing"]; got != "Nota da máquina antiga" {
		t.Fatalf("máquina nova não recebeu as notas existentes (título=%q, msg=%q)", got, result.Message)
	}
	if partitions := fake.count(t, "SELECT COUNT(DISTINCT user_id) FROM sync_notes"); partitions != 1 {
		t.Fatalf("não deveria surgir uma partição nova, há %d", partitions)
	}
}

// Durante a transição, máquinas antigas continuam gravando em partições
// próprias. As máquinas novas incorporam essas gravações a cada sync, sem
// apagar a origem (a máquina antiga continua funcionando).
func TestOutdatedMachineWritesAreAbsorbedWithoutDeletingSource(t *testing.T) {
	fake, server := newFakeTurso(t)
	stray := "6f1c2a10-0000-4000-8000-000000000002"

	upgraded := newTestMachine(t, "novo")
	if _, err := upgraded.SaveNote(Note{ID: "note-new", Title: "Da versão nova", Body: `{"type":"doc"}`, BodyText: "n"}); err != nil {
		t.Fatal(err)
	}
	mustSync(t, upgraded, server.URL)
	primary := remotePrimary(t, fake)
	if primary == stray {
		t.Fatal("cenário inválido")
	}

	outdated := newTestMachine(t, "antiga")
	if _, err := outdated.SaveNote(Note{ID: "note-old", Title: "Da versão antiga", Body: `{"type":"doc"}`, BodyText: "o"}); err != nil {
		t.Fatal(err)
	}
	simulateOutdatedSync(t, outdated, stray, server.URL)

	result := mustSync(t, upgraded, server.URL)
	if got := noteTitles(t, upgraded)["note-old"]; got != "Da versão antiga" {
		t.Fatalf("gravação da máquina antiga não foi incorporada (título=%q)", got)
	}
	if !strings.Contains(result.Message, "incorporados") {
		t.Fatalf("mensagem deveria informar a incorporação: %q", result.Message)
	}
	if fake.count(t, "SELECT COUNT(*) FROM sync_notes WHERE user_id = ? AND id = 'note-old'", stray) != 1 {
		t.Fatal("a partição de origem não pode ser apagada durante a transição")
	}

	// Sem mudanças na origem: nada é reprocessado.
	if again := mustSync(t, upgraded, server.URL); strings.Contains(again.Message, "incorporados") {
		t.Fatalf("partição sem mudanças não deveria ser reincorporada: %q", again.Message)
	}

	// A máquina antiga edita de novo: a nova versão chega às máquinas novas.
	if _, err := outdated.SaveNote(Note{ID: "note-old", Title: "Editada na antiga", Body: `{"type":"doc"}`, BodyText: "o2"}); err != nil {
		t.Fatal(err)
	}
	simulateOutdatedSync(t, outdated, stray, server.URL)
	mustSync(t, upgraded, server.URL)
	if got := noteTitles(t, upgraded)["note-old"]; got != "Editada na antiga" {
		t.Fatalf("edição posterior da máquina antiga não foi incorporada (título=%q)", got)
	}
}

// Ao atualizar, uma máquina presa em outro perfil troca para o principal com
// backup local e sem conflitos para conteúdo idêntico.
func TestUpgradedMachineSwitchesToPrimaryWithBackup(t *testing.T) {
	fake, server := newFakeTurso(t)
	stray := "6f1c2a10-0000-4000-8000-000000000003"

	first := newTestMachine(t, "principal")
	if _, err := first.SaveNote(Note{ID: "note-a", Title: "Nota A", Body: `{"type":"doc"}`, BodyText: "a"}); err != nil {
		t.Fatal(err)
	}
	mustSync(t, first, server.URL)
	primary := remotePrimary(t, fake)

	second := newTestMachine(t, "isolada")
	if _, err := second.SaveNote(Note{ID: "note-b", Title: "Nota B", Body: `{"type":"doc"}`, BodyText: "b"}); err != nil {
		t.Fatal(err)
	}
	simulateOutdatedSync(t, second, stray, server.URL)

	result := mustSync(t, second, server.URL)
	profileID, _, err := second.store.syncMetadata()
	if err != nil || profileID != primary {
		t.Fatalf("máquina atualizada deveria usar o perfil principal %s, usa %s (%v)", primary, profileID, err)
	}
	backups, _ := filepath.Glob(filepath.Join(filepath.Dir(second.store.path), "recovery", "*.db"))
	if len(backups) != 1 {
		t.Fatalf("esperado um backup antes da troca de perfil, encontrados %d", len(backups))
	}
	if !strings.Contains(result.Message, "Backup local") {
		t.Fatalf("mensagem deveria informar a troca e o backup: %q", result.Message)
	}
	mustSync(t, first, server.URL)
	for name, machine := range map[string]*App{"principal": first, "isolada": second} {
		titles := noteTitles(t, machine)
		if titles["note-a"] != "Nota A" || titles["note-b"] != "Nota B" {
			t.Fatalf("máquina %s não tem as duas notas: %#v", name, titles)
		}
	}
	var conflicts int
	_ = second.store.db.QueryRow("SELECT COUNT(*) FROM note_conflicts").Scan(&conflicts)
	if conflicts != 0 {
		t.Fatalf("conteúdo idêntico não deveria abrir conflitos, abriu %d", conflicts)
	}
}

// A máquina que ficou isolada tem cópias desatualizadas de notas editadas em
// outra máquina. Sem edição local, elas devem receber a versão da nuvem; só
// edições locais reais viram conflito.
func TestSwitchAcceptsRemoteForStaleUnmodifiedNotes(t *testing.T) {
	_, server := newFakeTurso(t)
	stray := "6f1c2a10-0000-4000-8000-000000000004"
	save := func(app *App, id, title string) {
		t.Helper()
		time.Sleep(3 * time.Millisecond)
		if _, err := app.SaveNote(Note{ID: id, Title: title, Body: `{"type":"doc"}`, BodyText: title}); err != nil {
			t.Fatal(err)
		}
	}

	first := newTestMachine(t, "atualizada")
	save(first, "note-a", "Nota A")
	mustSync(t, first, server.URL)

	second := newTestMachine(t, "isolada")
	save(second, "note-stale", "Versão antiga")
	save(second, "note-both", "Original")
	simulateOutdatedSync(t, second, stray, server.URL)

	mustSync(t, first, server.URL) // incorpora a partição isolada
	save(first, "note-stale", "Versão nova")
	save(first, "note-both", "Editada na atualizada")
	mustSync(t, first, server.URL)

	save(second, "note-both", "Editada na isolada")
	result := mustSync(t, second, server.URL)

	titles := noteTitles(t, second)
	if titles["note-stale"] != "Versão nova" {
		t.Fatalf("nota sem edição local deveria receber a versão da nuvem, título=%q (msg=%q)", titles["note-stale"], result.Message)
	}
	var state string
	if err := second.store.db.QueryRow("SELECT sync_state FROM notes WHERE id = 'note-stale'").Scan(&state); err != nil || state != "clean" {
		t.Fatalf("nota desatualizada deveria ficar limpa, estado=%q err=%v", state, err)
	}
	var conflicts []string
	rows, err := second.store.db.Query("SELECT note_id FROM note_conflicts ORDER BY note_id")
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var id string
		_ = rows.Scan(&id)
		conflicts = append(conflicts, id)
	}
	rows.Close()
	if len(conflicts) != 1 || conflicts[0] != "note-both" {
		t.Fatalf("apenas a nota editada nos dois lados deveria virar conflito, conflitos=%v", conflicts)
	}
}

func TestPrimaryElectionConvergesAcrossMachines(t *testing.T) {
	_, server := newFakeTurso(t)
	turso := NewTursoClient(server.URL, "test-token")
	if err := turso.InitSchema(); err != nil {
		t.Fatal(err)
	}
	first, err := ensurePrimarySyncProfile(turso, "11111111-1111-4111-8111-111111111111", "")
	if err != nil {
		t.Fatal(err)
	}
	second, err := ensurePrimarySyncProfile(turso, "22222222-2222-4222-8222-222222222222", "")
	if err != nil {
		t.Fatal(err)
	}
	if first != second {
		t.Fatalf("eleições sucessivas divergiram: %s vs %s", first, second)
	}
}

func TestCopyAndPurgeRemoteSyncProfiles(t *testing.T) {
	fake, server := newFakeTurso(t)
	turso := NewTursoClient(server.URL, "test-token")
	if err := turso.InitSchema(); err != nil {
		t.Fatal(err)
	}
	insert := func(profile, name string, updatedAt int64) {
		if err := turso.Execute(`INSERT INTO sync_folders(user_id, id, name, parent_id, color, icon, deleted_at, created_at, updated_at)
			VALUES (?, 'folder-x', ?, NULL, '', '', NULL, 1, ?)`, profile, name, updatedAt); err != nil {
			t.Fatal(err)
		}
	}
	insert("src", "Nome novo", 200)
	insert("dst", "Nome antigo", 100)
	if err := turso.Execute(`INSERT INTO sync_tags(user_id, id, name, normalized_name, icon, managed, deleted_at, created_at, updated_at)
		VALUES ('src', 'tag-only-src', 'Só origem', 'só origem', 'tag', 1, NULL, 1, 1)`); err != nil {
		t.Fatal(err)
	}
	if err := turso.Execute(`INSERT INTO sync_folders(user_id, id, name, parent_id, color, icon, deleted_at, created_at, updated_at)
		VALUES ('dst', 'folder-y', 'Destino mais novo', NULL, '', '', NULL, 1, 500), ('src', 'folder-y', 'Origem antiga', NULL, '', '', NULL, 1, 50)`); err != nil {
		t.Fatal(err)
	}

	if err := copyRemoteSyncProfile(turso, "src", "dst"); err != nil {
		t.Fatal(err)
	}
	_, rows, err := turso.Query("SELECT name FROM sync_folders WHERE user_id = 'dst' ORDER BY id")
	if err != nil || len(rows) != 2 || rows[0][0].Value != "Nome novo" || rows[1][0].Value != "Destino mais novo" {
		t.Fatalf("a escrita mais recente deveria vencer nos dois sentidos: rows=%v err=%v", rows, err)
	}
	if fake.count(t, "SELECT COUNT(*) FROM sync_tags WHERE user_id = 'dst' AND id = 'tag-only-src'") != 1 {
		t.Fatal("etiqueta exclusiva da origem não foi copiada")
	}
	if fake.count(t, "SELECT COUNT(*) FROM sync_folders WHERE user_id = 'src'") != 2 {
		t.Fatal("a cópia não pode apagar a origem")
	}

	if err := purgeRemoteSyncProfile(turso, "src", "dst"); err != nil {
		t.Fatal(err)
	}
	if fake.count(t, "SELECT COUNT(*) FROM sync_folders WHERE user_id = 'src'")+fake.count(t, "SELECT COUNT(*) FROM sync_tags WHERE user_id = 'src'") != 0 {
		t.Fatal("perfil de origem deveria ficar vazio após a remoção")
	}

	profiles, err := listRemoteSyncProfiles(turso, "dst")
	if err != nil {
		t.Fatal(err)
	}
	if len(profiles) != 1 || profiles[0].ProfileID != "dst" || !profiles[0].Current || profiles[0].Folders != 2 || profiles[0].Tags != 1 {
		t.Fatalf("listagem de perfis inesperada: %#v", profiles)
	}
}

func TestCleanNoteAcceptsHigherRemoteRevisionDespiteClockSkew(t *testing.T) {
	app := newTestMachine(t, "clock-skew")
	if _, err := app.SaveNote(Note{ID: "note-skew", Title: "Local", Body: `{"type":"doc"}`, BodyText: "Local"}); err != nil {
		t.Fatal(err)
	}
	// Nota limpa na revisão 1, com relógio local adiantado.
	future := time.Now().Add(10 * time.Minute).UTC().UnixMilli()
	if _, err := app.store.db.Exec(`UPDATE notes SET sync_state = 'clean', pending_mutation_id = NULL,
		server_revision = 1, updated_at = ? WHERE id = 'note-skew'`, future); err != nil {
		t.Fatal(err)
	}

	remote := syncRemoteNote{
		ID: "note-skew", Title: "Editada em outra máquina", Body: `{"type":"doc"}`, BodyText: "Remota",
		NoteType: "richtext", Language: "", Folder: "Notas", FolderID: "folder-default",
		Revision: 2, CreatedAt: time.Now().Add(-time.Hour).UTC(), UpdatedAt: time.Now().UTC(),
	}
	conflict, err := app.store.applyRemoteNote(remote)
	if err != nil || conflict {
		t.Fatalf("applyRemoteNote: conflict=%v err=%v", conflict, err)
	}
	note, err := app.store.getNote("note-skew")
	if err != nil {
		t.Fatal(err)
	}
	if note.Title != "Editada em outra máquina" {
		t.Fatalf("edição remota descartada por diferença de relógio (título=%q)", note.Title)
	}
	if note.Type != "rtf" || note.Language != "plaintext" {
		t.Fatalf("tipo/idioma remotos legados não foram normalizados: %q/%q", note.Type, note.Language)
	}
}

func TestDeletingNeverSyncedNoteDoesNotBreakDirectSync(t *testing.T) {
	_, server := newFakeTurso(t)
	app := newTestMachine(t, "tombstone")
	if _, err := app.SaveNote(Note{ID: "note-local-only", Title: "Rascunho", Body: `{"type":"doc"}`, BodyText: "x"}); err != nil {
		t.Fatal(err)
	}
	if err := app.DeleteNote("note-local-only"); err != nil {
		t.Fatal(err)
	}

	mustSync(t, app, server.URL)

	var state string
	if err := app.store.db.QueryRow("SELECT sync_state FROM notes WHERE id = 'note-local-only'").Scan(&state); err != nil {
		t.Fatal(err)
	}
	if state != "clean" {
		t.Fatalf("lápide local deveria ser liquidada, estado=%s", state)
	}
}

func TestPushedFoldersAndTagsCloseOutboxAndDiagnostics(t *testing.T) {
	_, server := newFakeTurso(t)
	app := newTestMachine(t, "outbox")
	if _, err := app.SaveFolder(Folder{ID: "folder-outbox", Name: "Projetos"}); err != nil {
		t.Fatal(err)
	}
	if _, err := app.SaveTag(Tag{Name: "Urgente", Icon: "alert-circle"}); err != nil {
		t.Fatal(err)
	}

	result := mustSync(t, app, server.URL)

	var openOps int
	if err := app.store.db.QueryRow("SELECT COUNT(*) FROM sync_outbox WHERE status = 'pending' AND entity_type IN ('folder', 'tag')").Scan(&openOps); err != nil {
		t.Fatal(err)
	}
	if openOps != 0 {
		t.Fatalf("outbox de pastas/etiquetas deveria estar fechada, %d entradas pendentes", openOps)
	}
	if result.Report.PendingLocalCount != 0 {
		t.Fatalf("diagnóstico deveria indicar zero pendências, indicou %d", result.Report.PendingLocalCount)
	}
	if result.Report.RemoteCanonicalHash != "" {
		t.Fatal("hash remoto não deve ser preenchido com uma cópia do hash local")
	}
}

func TestExplicitProfileSwitchRebasesLocalState(t *testing.T) {
	fake, server := newFakeTurso(t)
	app := newTestMachine(t, "explicit")
	if _, err := app.SaveNote(Note{ID: "note-rebase", Title: "Minha nota", Body: `{"type":"doc"}`, BodyText: "x"}); err != nil {
		t.Fatal(err)
	}
	mustSync(t, app, server.URL)

	target := "11111111-2222-4333-8444-555555555555"
	if _, err := app.store.syncNowWithProfile("", server.URL, "test-token", target); err != nil {
		t.Fatal(err)
	}

	if fake.count(t, "SELECT COUNT(*) FROM sync_notes WHERE user_id = ? AND id = 'note-rebase'", target) != 1 {
		t.Fatal("nota local já sincronizada deveria ser enviada ao novo perfil após o rebase")
	}
	var state string
	var serverRevision int64
	if err := app.store.db.QueryRow("SELECT sync_state, server_revision FROM notes WHERE id = 'note-rebase'").Scan(&state, &serverRevision); err != nil {
		t.Fatal(err)
	}
	if state != "clean" || serverRevision != 1 {
		t.Fatalf("estado após rebase inesperado: state=%s revision=%d", state, serverRevision)
	}
}

func TestStickerSyncAcrossMachines(t *testing.T) {
	fake, server := newFakeTurso(t)
	machineA := newTestMachine(t, "machine-a-stickers")
	machineB := newTestMachine(t, "machine-b-stickers")

	// 1. Máquina A cria quadro e sticker.
	board, err := machineA.SaveStickerBoard(StickerBoard{Name: "Roadmap", Color: "blue"})
	if err != nil {
		t.Fatalf("criar quadro no A: %v", err)
	}
	sticker, err := machineA.SaveSticker(Sticker{
		BoardID: board.ID,
		Title:   "Deploy v1.7.0",
		Body:    "Testar float no Hrana",
		Color:   "blue",
	})
	if err != nil {
		t.Fatalf("criar sticker no A: %v", err)
	}

	// 2. Máquina A sincroniza com fakeTurso estrito.
	mustSync(t, machineA, server.URL)

	if count := fake.count(t, "SELECT COUNT(*) FROM sync_stickers WHERE id = ?", sticker.ID); count != 1 {
		t.Fatalf("esperado 1 sticker remoto no Turso, encontrado %d", count)
	}
	if count := fake.count(t, "SELECT COUNT(*) FROM sync_sticker_boards WHERE id = ?", board.ID); count != 1 {
		t.Fatalf("esperado 1 quadro remoto no Turso, encontrado %d", count)
	}

	var localBoardState, localStickerState string
	if err := machineA.store.db.QueryRow("SELECT sync_state FROM sticker_boards WHERE id = ?", board.ID).Scan(&localBoardState); err != nil {
		t.Fatal(err)
	}
	if err := machineA.store.db.QueryRow("SELECT sync_state FROM stickers WHERE id = ?", sticker.ID).Scan(&localStickerState); err != nil {
		t.Fatal(err)
	}
	if localBoardState != "clean" || localStickerState != "clean" {
		t.Fatalf("estados locais deveriam ser 'clean', obteve quadro=%s sticker=%s", localBoardState, localStickerState)
	}

	// 3. Máquina B sincroniza e recebe os stickers.
	mustSync(t, machineB, server.URL)

	pulledStickers, err := machineB.ListStickers(board.ID)
	if err != nil {
		t.Fatalf("listar stickers no B: %v", err)
	}
	if len(pulledStickers) != 1 {
		t.Fatalf("máquina B esperava 1 sticker, obteve %d", len(pulledStickers))
	}
	if pulledStickers[0].Title != "Deploy v1.7.0" || pulledStickers[0].Body != "Testar float no Hrana" {
		t.Fatalf("sticker puxado inconsistente: %#v", pulledStickers[0])
	}

	// 4. Máquina B edita o sticker e sincroniza de volta.
	pulledStickers[0].Body = "Atualizado no B com sucesso"
	if _, err := machineB.SaveSticker(pulledStickers[0]); err != nil {
		t.Fatalf("editar sticker no B: %v", err)
	}
	mustSync(t, machineB, server.URL)

	// 5. Máquina A sincroniza e recebe a edição feita no B.
	mustSync(t, machineA, server.URL)
	updatedStickersA, err := machineA.ListStickers(board.ID)
	if err != nil {
		t.Fatalf("listar stickers no A: %v", err)
	}
	if len(updatedStickersA) != 1 || updatedStickersA[0].Body != "Atualizado no B com sucesso" {
		t.Fatalf("máquina A não recebeu a edição do B: %#v", updatedStickersA)
	}

	// 6. Colisão de nomes de quadro entre máquinas independentes.
	// Máquina B cria um quadro chamado "Notas Rápidas".
	boardB, err := machineB.SaveStickerBoard(StickerBoard{Name: "Notas Rápidas", Color: "yellow"})
	if err != nil {
		t.Fatal(err)
	}
	mustSync(t, machineB, server.URL)

	// Máquina A cria outro quadro com o mesmo nome antes de puxar o do B.
	boardA, err := machineA.SaveStickerBoard(StickerBoard{Name: "Notas Rápidas", Color: "yellow"})
	if err != nil {
		t.Fatal(err)
	}
	// A sincronização no A não pode quebrar por UNIQUE constraint: o quadro do B é renomeado com sufixo.
	mustSync(t, machineA, server.URL)

	boardsA, err := machineA.store.listStickerBoards()
	if err != nil {
		t.Fatal(err)
	}
	foundOrig, foundSuffixed := false, false
	for _, b := range boardsA {
		if b.ID == boardA.ID && b.Name == "Notas Rápidas" {
			foundOrig = true
		}
		if b.ID == boardB.ID && strings.HasPrefix(b.Name, "Notas Rápidas (") {
			foundSuffixed = true
		}
	}
	if !foundOrig || !foundSuffixed {
		t.Fatalf("falha ao resolver colisão de nome de quadros: %#v", boardsA)
	}
}

