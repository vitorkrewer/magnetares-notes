package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Perfil de sincronização
//
// Todas as tabelas remotas são particionadas por user_id (= perfil). Para que
// várias máquinas apontando para o mesmo banco Turso compartilhem os mesmos
// dados, o perfil precisa ser idêntico em todas elas.
//
// O perfil é uma propriedade do BANCO REMOTO, não da URL digitada: a chave
// primary_profile_id da tabela remota sync_settings guarda o perfil principal.
// A ordem de resolução é:
//
//  1. perfil explícito salvo em config.json (escolhido pelo usuário);
//  2. perfil principal registrado no banco remoto (eleito na primeira
//     sincronização de uma versão nova, preferindo a partição que já tem dados);
//  3. sem acesso à nuvem: o perfil já gravado no banco local, ou o derivado da
//     URL canônica. O perfil local nunca é trocado sem consultar a nuvem.
//
// Partições de outros perfis no mesmo banco (máquinas ainda na versão antiga,
// URLs digitadas de outra forma) são incorporadas ao perfil principal a cada
// sincronização, sem apagar a origem.

const (
	syncProfileSourceExplicit = "explicit"
	syncProfileSourceRemote   = "remote"
	syncProfileSourceDerived  = "derived"
	syncProfileSourceLocal    = "local"
	// syncProfileSourceLegacy: perfil gravado por uma versão anterior e ainda
	// não confirmado contra o perfil principal do banco remoto.
	syncProfileSourceLegacy = "legacy"

	primaryProfileSettingKey = "primary_profile_id"
	absorbedSettingPrefix    = "absorbed:"
	// rebaseMutationPrefix marca notas que estavam limpas (sem edição local)
	// quando o perfil foi trocado; na colisão com a nuvem, a versão remota vence.
	rebaseMutationPrefix = "rebase-"
)

type syncProfileResolution struct {
	ProfileID       string
	Source          string
	StoredProfileID string
	StoredSource    string
	StoredCursor    string
	Cursor          string
}

func (r syncProfileResolution) changed() bool {
	return r.StoredProfileID != r.ProfileID
}

// withProfile troca o perfil efetivo, reiniciando o cursor se ele mudou.
func (r syncProfileResolution) withProfile(profileID, source string) syncProfileResolution {
	r.ProfileID = profileID
	r.Source = source
	r.Cursor = r.StoredCursor
	if r.changed() {
		r.Cursor = "0"
	}
	return r
}

// canonicalTursoURL reduz uma URL Turso/libSQL a uma forma única:
// libsql://<host[:porta]> em minúsculas, sem caminho, barra final ou porta 443.
func canonicalTursoURL(raw string) string {
	value := strings.ToLower(strings.TrimSpace(raw))
	if value == "" {
		return ""
	}
	for _, prefix := range []string{"libsql://", "https://", "http://", "wss://", "ws://"} {
		if strings.HasPrefix(value, prefix) {
			value = strings.TrimPrefix(value, prefix)
			break
		}
	}
	if index := strings.IndexAny(value, "/?#"); index >= 0 {
		value = value[:index]
	}
	value = strings.TrimSuffix(value, ":443")
	value = strings.TrimSuffix(value, ".")
	if value == "" {
		return ""
	}
	return "libsql://" + value
}

// deriveSyncProfileID gera o perfil determinístico a partir da URL canônica.
// Para URLs já no formato libsql://host (o formato fornecido pelo Turso),
// o resultado é idêntico ao da regra antiga, preservando dados existentes.
func deriveSyncProfileID(databaseURL string) string {
	canonical := canonicalTursoURL(databaseURL)
	if canonical == "" {
		return ""
	}
	return uuid.NewSHA1(uuid.NameSpaceURL, []byte(canonical)).String()
}

// legacySyncProfileID reproduz a regra antiga (URL apenas aparada e em minúsculas).
func legacySyncProfileID(databaseURL string) string {
	value := strings.ToLower(strings.TrimSpace(databaseURL))
	if value == "" {
		return ""
	}
	return uuid.NewSHA1(uuid.NameSpaceURL, []byte(value)).String()
}

func normalizeSyncProfileID(profileID string) (string, error) {
	profileID = strings.ToLower(strings.TrimSpace(profileID))
	if profileID == "" {
		return "", nil
	}
	if _, err := uuid.Parse(profileID); err != nil {
		return "", errors.New("perfil de sincronização inválido")
	}
	return profileID, nil
}

// resolveSyncProfile calcula o perfil efetivo sem rede e sem gravar nada.
// Com a nuvem acessível, o fluxo de sincronização substitui o resultado pelo
// perfil principal do banco remoto (veja ensurePrimarySyncProfile).
func (s *noteStore) resolveSyncProfile(tursoDatabaseURL, explicitProfileID string) (syncProfileResolution, error) {
	var resolution syncProfileResolution
	if err := s.db.QueryRow("SELECT sync_profile_id, pull_cursor, profile_source FROM sync_metadata WHERE singleton = 1").
		Scan(&resolution.StoredProfileID, &resolution.StoredCursor, &resolution.StoredSource); err != nil {
		return resolution, fmt.Errorf("read sync metadata: %w", err)
	}

	explicit, err := normalizeSyncProfileID(explicitProfileID)
	if err != nil {
		return resolution, err
	}

	switch {
	case explicit != "":
		return resolution.withProfile(explicit, syncProfileSourceExplicit), nil
	case resolution.StoredProfileID != "":
		// Sem consultar a nuvem, nunca troca o perfil já em uso.
		source := resolution.StoredSource
		if source == "" {
			source = syncProfileSourceLegacy
		}
		return resolution.withProfile(resolution.StoredProfileID, source), nil
	case deriveSyncProfileID(tursoDatabaseURL) != "":
		return resolution.withProfile(deriveSyncProfileID(tursoDatabaseURL), syncProfileSourceDerived), nil
	default:
		return resolution.withProfile(uuid.NewString(), syncProfileSourceLocal), nil
	}
}

// applySyncProfile grava o perfil resolvido. Quando o banco local já estava
// vinculado a outro perfil, faz backup do SQLite e executa um rebase: todo o
// estado local volta a ser pendente com revisão-base zero, de modo que o
// próximo push compare cada nota com a partição nova (convergindo conteúdo
// idêntico e preservando divergências como conflito, nunca sobrescrevendo
// silenciosamente). Retorna o caminho do backup, se houver.
func (s *noteStore) applySyncProfile(resolution syncProfileResolution) (string, error) {
	if !resolution.changed() {
		if resolution.Source != resolution.StoredSource {
			_, err := s.db.Exec("UPDATE sync_metadata SET profile_source = ? WHERE singleton = 1", resolution.Source)
			return "", err
		}
		return "", nil
	}

	backupPath := ""
	if resolution.StoredProfileID != "" {
		path, err := s.backupBeforeProfileSwitch(resolution.StoredProfileID, resolution.ProfileID)
		if err != nil {
			return "", fmt.Errorf("backup antes de trocar o perfil de sincronização: %w", err)
		}
		backupPath = path
	}

	tx, err := s.db.Begin()
	if err != nil {
		return "", fmt.Errorf("begin sync profile switch: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec("UPDATE sync_metadata SET sync_profile_id = ?, profile_source = ?, pull_cursor = '0' WHERE singleton = 1",
		resolution.ProfileID, resolution.Source); err != nil {
		return "", fmt.Errorf("update sync profile: %w", err)
	}

	if resolution.StoredProfileID != "" {
		statements := []string{
			// Conflitos registrados contra a partição antiga perdem o sentido; a versão
			// local é preservada e será comparada novamente com a partição nova.
			`DELETE FROM note_conflicts`,
			// Novos mutation ids: os antigos pertencem à partição anterior e não podem
			// ser confundidos com mutações já aplicadas na partição nova. Notas limpas
			// (sem edição local) recebem o prefixo de rebase: se a nuvem tiver outra
			// versão, ela vence sem conflito; só edições locais reais viram conflito.
			`UPDATE notes SET server_revision = 0, sync_state = 'pending',
				pending_mutation_id = CASE WHEN sync_state = 'clean'
					THEN '` + rebaseMutationPrefix + `' || lower(hex(randomblob(16)))
					ELSE lower(hex(randomblob(16))) END`,
			`UPDATE folders SET sync_state = 'pending' WHERE id != 'folder-default'`,
			`UPDATE tags SET sync_state = 'pending'`,
			`UPDATE sticker_boards SET sync_state = 'pending'`,
			`UPDATE stickers SET sync_state = 'pending'`,
		}
		for _, statement := range statements {
			if _, err := tx.Exec(statement); err != nil {
				return "", fmt.Errorf("rebase local sync state: %w", err)
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return backupPath, nil
}

// backupBeforeProfileSwitch grava uma cópia consistente do banco local em
// <pasta do banco>/recovery antes de qualquer rebase.
func (s *noteStore) backupBeforeProfileSwitch(fromProfileID, toProfileID string) (string, error) {
	if s.path == "" {
		return "", nil
	}
	dir := filepath.Join(filepath.Dir(s.path), "recovery")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	name := fmt.Sprintf("magnetares-%s-perfil-%s-para-%s.db",
		time.Now().Format("20060102-150405"), shortProfileID(fromProfileID), shortProfileID(toProfileID))
	target := filepath.Join(dir, name)
	if _, err := s.db.Exec("VACUUM INTO ?", target); err != nil {
		return "", err
	}
	return target, nil
}

// readPrimarySyncProfile lê o perfil principal registrado no banco remoto.
func readPrimarySyncProfile(turso *TursoClient) (string, error) {
	_, rows, err := turso.Query(`SELECT value FROM sync_settings WHERE key = ?`, primaryProfileSettingKey)
	if err != nil {
		return "", fmt.Errorf("ler perfil principal: %w", err)
	}
	if len(rows) == 0 || len(rows[0]) == 0 {
		return "", nil
	}
	profileID, err := normalizeSyncProfileID(rows[0][0].Value)
	if err != nil {
		return "", nil
	}
	return profileID, nil
}

// ensurePrimarySyncProfile devolve o perfil principal do banco remoto,
// elegendo-o na primeira vez. A eleição prefere, nesta ordem: o perfil
// canônico derivado da URL (se tiver dados), o perfil atual desta máquina (se
// tiver dados), a partição com mais notas, e por fim o canônico. A gravação usa
// INSERT OR IGNORE seguido de releitura, de modo que duas máquinas elegendo ao
// mesmo tempo convergem para o mesmo valor.
func ensurePrimarySyncProfile(turso *TursoClient, derivedProfileID, storedProfileID string) (string, error) {
	if turso == nil {
		return "", errors.New("configuração inválida do Turso")
	}
	if primary, err := readPrimarySyncProfile(turso); err != nil || primary != "" {
		return primary, err
	}

	profiles, err := listRemoteSyncProfiles(turso, "")
	if err != nil {
		return "", err
	}
	chosen := electPrimarySyncProfile(profiles, derivedProfileID, storedProfileID)
	if chosen == "" {
		return "", errors.New("não foi possível determinar o perfil de sincronização")
	}
	if err := turso.Execute(`INSERT OR IGNORE INTO sync_settings(key, value, updated_at) VALUES (?, ?, ?)`,
		primaryProfileSettingKey, chosen, time.Now().UTC().UnixMilli()); err != nil {
		return "", fmt.Errorf("registrar perfil principal: %w", err)
	}
	primary, err := readPrimarySyncProfile(turso)
	if err != nil {
		return "", err
	}
	if primary == "" {
		return chosen, nil
	}
	return primary, nil
}

func electPrimarySyncProfile(profiles []RemoteSyncProfile, derivedProfileID, storedProfileID string) string {
	byID := make(map[string]RemoteSyncProfile, len(profiles))
	for _, profile := range profiles {
		byID[profile.ProfileID] = profile
	}
	for _, candidate := range []string{derivedProfileID, storedProfileID} {
		if profile, ok := byID[candidate]; ok && candidate != "" && profile.totalRows > 0 {
			return candidate
		}
	}
	var best *RemoteSyncProfile
	for index := range profiles {
		profile := &profiles[index]
		if _, err := uuid.Parse(profile.ProfileID); err != nil || profile.totalRows == 0 {
			continue
		}
		if best == nil || profile.Notes > best.Notes ||
			(profile.Notes == best.Notes && profile.totalRows > best.totalRows) {
			best = profile
		}
	}
	if best != nil {
		return best.ProfileID
	}
	if derivedProfileID != "" {
		return derivedProfileID
	}
	return storedProfileID
}

// setPrimarySyncProfile troca o perfil principal do banco remoto. Todas as
// máquinas em versão nova passam a usá-lo na próxima sincronização.
func setPrimarySyncProfile(turso *TursoClient, profileID string) error {
	return turso.Execute(`INSERT INTO sync_settings(key, value, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		primaryProfileSettingKey, profileID, time.Now().UTC().UnixMilli())
}

// RemoteSyncProfile descreve uma partição (perfil) encontrada no banco remoto.
type RemoteSyncProfile struct {
	ProfileID     string     `json:"profileId"`
	Notes         int64      `json:"notes"`
	Folders       int64      `json:"folders"`
	Tags          int64      `json:"tags"`
	StickerBoards int64      `json:"stickerBoards"`
	Stickers      int64      `json:"stickers"`
	TaskLists     int64      `json:"taskLists"`
	Tasks         int64      `json:"tasks"`
	LastUpdatedAt *time.Time `json:"lastUpdatedAt"`
	Current       bool       `json:"current"`
	Primary       bool       `json:"primary"`

	totalRows int64
	// signature muda sempre que alguma linha da partição é inserida, alterada
	// ou removida; evita reprocessar partições já incorporadas.
	signature string
}

var remoteProfileTables = []struct{ table, kind string }{
	{"sync_notes", "notes"},
	{"sync_folders", "folders"},
	{"sync_tags", "tags"},
	{"sync_sticker_boards", "boards"},
	{"sync_stickers", "stickers"},
	{"sync_task_lists", "task_lists"},
	{"sync_tasks", "tasks"},
	{"sync_subtasks", "subtasks"},
}

func listRemoteSyncProfiles(turso *TursoClient, currentProfileID string) ([]RemoteSyncProfile, error) {
	if turso == nil {
		return nil, errors.New("configuração inválida do Turso")
	}
	parts := make([]string, 0, len(remoteProfileTables))
	for _, item := range remoteProfileTables {
		parts = append(parts, fmt.Sprintf(`SELECT user_id, '%s', SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END),
			COUNT(*), SUM(updated_at), MAX(updated_at) FROM %s GROUP BY user_id`, item.kind, item.table))
	}
	_, rows, err := turso.Query(strings.Join(parts, " UNION ALL "))
	if err != nil {
		return nil, fmt.Errorf("listar perfis remotos: %w", err)
	}

	type accumulator struct {
		profile    RemoteSyncProfile
		signatures map[string]string
		lastMillis int64
	}
	byID := map[string]*accumulator{}
	order := []string{}
	for _, row := range rows {
		if len(row) < 6 {
			continue
		}
		id := row[0].Value
		acc, ok := byID[id]
		if !ok {
			acc = &accumulator{profile: RemoteSyncProfile{ProfileID: id}, signatures: map[string]string{}}
			byID[id] = acc
			order = append(order, id)
		}
		active, _ := tursoInt(row[2])
		total, _ := tursoInt(row[3])
		last, _ := tursoInt(row[5])
		switch row[1].Value {
		case "notes":
			acc.profile.Notes = active
		case "folders":
			acc.profile.Folders = active
		case "tags":
			acc.profile.Tags = active
		case "boards":
			acc.profile.StickerBoards = active
		case "stickers":
			acc.profile.Stickers = active
		case "task_lists":
			acc.profile.TaskLists = active
		case "tasks":
			acc.profile.Tasks = active
		}
		acc.profile.totalRows += total
		acc.signatures[row[1].Value] = fmt.Sprintf("%s=%d/%s", row[1].Value, total, row[4].Value)
		if last > acc.lastMillis {
			acc.lastMillis = last
		}
	}

	profiles := make([]RemoteSyncProfile, 0, len(order))
	for _, id := range order {
		acc := byID[id]
		keys := make([]string, 0, len(acc.signatures))
		for key := range acc.signatures {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		parts := make([]string, 0, len(keys))
		for _, key := range keys {
			parts = append(parts, acc.signatures[key])
		}
		acc.profile.signature = strings.Join(parts, ";")
		if acc.lastMillis > 0 {
			updated := time.UnixMilli(acc.lastMillis).UTC()
			acc.profile.LastUpdatedAt = &updated
		}
		acc.profile.Current = id == currentProfileID
		profiles = append(profiles, acc.profile)
	}
	sort.SliceStable(profiles, func(i, j int) bool {
		left, right := profiles[i].LastUpdatedAt, profiles[j].LastUpdatedAt
		if left == nil || right == nil {
			return left != nil
		}
		return left.After(*right)
	})
	return profiles, nil
}

type lwwTable struct {
	name    string
	columns []string
}

var lwwSyncTables = []lwwTable{
	{"sync_folders", []string{"name", "parent_id", "color", "icon", "deleted_at", "created_at", "updated_at"}},
	{"sync_tags", []string{"name", "normalized_name", "icon", "managed", "deleted_at", "created_at", "updated_at"}},
	{"sync_sticker_boards", []string{"name", "color", "position", "deleted_at", "created_at", "updated_at"}},
	{"sync_stickers", []string{"board_id", "title", "body", "color", "position", "pinned_at", "deleted_at", "created_at", "updated_at"}},
	{"sync_task_lists", []string{"name", "color", "icon", "position", "deleted_at", "created_at", "updated_at"}},
	{"sync_tasks", []string{"list_id", "title", "notes", "completed", "completed_at", "due_date", "priority", "position", "deleted_at", "created_at", "updated_at"}},
	{"sync_subtasks", []string{"task_id", "title", "completed", "completed_at", "position", "deleted_at", "created_at", "updated_at"}},
}

var syncNoteColumns = []string{"title", "body", "body_text", "note_type", "language", "folder_id", "folder", "pinned_at",
	"checklist_total", "checklist_open", "tags", "revision", "deleted_at", "created_at", "updated_at"}

// lwwUpsertSQL copia as linhas de um perfil para outro; em caso de colisão de
// id, só grava quando a linha de origem tem updated_at mais recente (sem
// escritas desnecessárias quando nada mudou).
func lwwUpsertSQL(table string, columns []string, revisionColumn bool) string {
	sets := make([]string, 0, len(columns))
	for _, column := range columns {
		switch {
		case column == "created_at":
			sets = append(sets, fmt.Sprintf("created_at = MIN(%s.created_at, excluded.created_at)", table))
		case column == "revision" && revisionColumn:
			// Revisões de partições diferentes são contadores independentes; quando
			// a versão de origem vence, a revisão sobe acima das duas para que todos
			// os clientes a apliquem.
			sets = append(sets, fmt.Sprintf("revision = MAX(%s.revision, excluded.revision) + 1", table))
		default:
			sets = append(sets, fmt.Sprintf("%[1]s = excluded.%[1]s", column))
		}
	}
	list := strings.Join(columns, ", ")
	return fmt.Sprintf(`INSERT INTO %[1]s(user_id, id, %[2]s) SELECT ?, id, %[2]s FROM %[1]s WHERE user_id = ?
		ON CONFLICT(user_id, id) DO UPDATE SET %[3]s WHERE excluded.updated_at > %[1]s.updated_at`,
		table, list, strings.Join(sets, ", "))
}

// copyRemoteSyncProfile incorpora a partição sourceProfileID em
// targetProfileID sem apagar a origem. Itens com o mesmo id ficam com a versão
// de updated_at mais recente. Notas que mudaram no destino recebem um evento
// novo em sync_note_changes para que todos os clientes as baixem. É idempotente:
// repetir a cópia sem mudanças na origem não grava nada.
func copyRemoteSyncProfile(turso *TursoClient, sourceProfileID, targetProfileID string) error {
	if turso == nil {
		return errors.New("configuração inválida do Turso")
	}
	sourceProfileID = strings.TrimSpace(sourceProfileID)
	targetProfileID = strings.TrimSpace(targetProfileID)
	if sourceProfileID == "" || targetProfileID == "" {
		return errors.New("perfis de origem e destino são obrigatórios")
	}
	if sourceProfileID == targetProfileID {
		return errors.New("o perfil de origem já é o perfil principal")
	}

	statements := []TursoStatement{
		{
			// Eventos primeiro (o estado do destino ainda é o anterior): só para notas
			// novas no destino ou cuja versão de origem é mais recente. Snapshot vazio
			// faz o pull usar o estado atual da nota.
			SQL: `INSERT INTO sync_note_changes(user_id, note_id, revision, changed_at, snapshot_json)
				SELECT ?, s.id, CASE WHEN d.id IS NULL THEN s.revision ELSE MAX(s.revision, d.revision) + 1 END, s.updated_at, ''
				FROM sync_notes s LEFT JOIN sync_notes d ON d.user_id = ? AND d.id = s.id
				WHERE s.user_id = ? AND (d.id IS NULL OR s.updated_at > d.updated_at)`,
			Args: []any{targetProfileID, targetProfileID, sourceProfileID},
		},
		{SQL: lwwUpsertSQL("sync_notes", syncNoteColumns, true), Args: []any{targetProfileID, sourceProfileID}},
	}
	for _, table := range lwwSyncTables {
		statements = append(statements, TursoStatement{SQL: lwwUpsertSQL(table.name, table.columns, false), Args: []any{targetProfileID, sourceProfileID}})
	}
	if _, err := turso.RunTransaction(statements); err != nil {
		return fmt.Errorf("copiar perfil %s: %w", shortProfileID(sourceProfileID), err)
	}
	return nil
}

// safeDeleteSQL remove do perfil de origem apenas linhas que já estão
// representadas no destino com versão igual ou mais recente.
func safeDeleteSQL(table string) string {
	return fmt.Sprintf(`DELETE FROM %[1]s WHERE user_id = ? AND EXISTS (
		SELECT 1 FROM %[1]s d WHERE d.user_id = ? AND d.id = %[1]s.id AND d.updated_at >= %[1]s.updated_at)`, table)
}

// purgeRemoteSyncProfile copia a partição de origem para o destino e depois
// remove da origem apenas o que está garantido no destino. Ação manual: só deve
// ser usada quando nenhuma máquina em versão antiga ainda grava na origem.
func purgeRemoteSyncProfile(turso *TursoClient, sourceProfileID, targetProfileID string) error {
	if err := copyRemoteSyncProfile(turso, sourceProfileID, targetProfileID); err != nil {
		return err
	}
	deletePhase := []TursoStatement{
		{SQL: safeDeleteSQL("sync_notes"), Args: []any{sourceProfileID, targetProfileID}},
		{
			SQL:  `DELETE FROM sync_note_changes WHERE user_id = ? AND note_id NOT IN (SELECT id FROM sync_notes WHERE user_id = ?)`,
			Args: []any{sourceProfileID, sourceProfileID},
		},
		{
			SQL:  `DELETE FROM sync_mutations WHERE user_id = ? AND note_id NOT IN (SELECT id FROM sync_notes WHERE user_id = ?)`,
			Args: []any{sourceProfileID, sourceProfileID},
		},
		{SQL: `DELETE FROM sync_settings WHERE key = ?`, Args: []any{absorbedSettingPrefix + sourceProfileID}},
	}
	for _, table := range lwwSyncTables {
		deletePhase = append(deletePhase, TursoStatement{SQL: safeDeleteSQL(table.name), Args: []any{sourceProfileID, targetProfileID}})
	}
	if _, err := turso.RunTransaction(deletePhase); err != nil {
		return fmt.Errorf("limpar perfil %s após cópia: %w", shortProfileID(sourceProfileID), err)
	}
	return nil
}

// absorbStrayProfiles incorpora ao perfil principal as partições de outros
// perfis que mudaram desde a última incorporação. Cobre o período de transição
// em que máquinas com versões antigas ainda gravam em partições próprias.
// Devolve quantas partições foram incorporadas nesta rodada.
func absorbStrayProfiles(turso *TursoClient, primaryProfileID string) (int, error) {
	profiles, err := listRemoteSyncProfiles(turso, primaryProfileID)
	if err != nil {
		return 0, err
	}
	_, rows, err := turso.Query(`SELECT key, value FROM sync_settings WHERE key LIKE ?`, absorbedSettingPrefix+"%")
	if err != nil {
		return 0, fmt.Errorf("ler estado de incorporação: %w", err)
	}
	seen := make(map[string]string, len(rows))
	for _, row := range rows {
		if len(row) >= 2 {
			seen[strings.TrimPrefix(row[0].Value, absorbedSettingPrefix)] = row[1].Value
		}
	}

	absorbed := 0
	var errs []error
	for _, profile := range profiles {
		if profile.ProfileID == primaryProfileID || profile.totalRows == 0 || seen[profile.ProfileID] == profile.signature {
			continue
		}
		if err := copyRemoteSyncProfile(turso, profile.ProfileID, primaryProfileID); err != nil {
			errs = append(errs, err)
			continue
		}
		if err := turso.Execute(`INSERT INTO sync_settings(key, value, updated_at) VALUES (?, ?, ?)
			ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
			absorbedSettingPrefix+profile.ProfileID, profile.signature, time.Now().UTC().UnixMilli()); err != nil {
			errs = append(errs, err)
		}
		absorbed++
	}
	return absorbed, errors.Join(errs...)
}

func shortProfileID(profileID string) string {
	if len(profileID) > 8 {
		return profileID[:8]
	}
	return profileID
}

// formatProfileCount é usado em mensagens ao usuário.
func formatProfileCount(count int) string {
	if count == 1 {
		return "1 perfil antigo"
	}
	return strconv.Itoa(count) + " perfis antigos"
}
