package main

import (
	"path/filepath"
	"testing"
	"time"
)

func TestDataComplianceEngineRepairsLegacyAndCorruptState(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "legacy_test.db")
	app, err := NewApp(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	// 1. Injetar dados legados/corrompidos diretamente via SQL
	now := time.Now().UTC().UnixMilli()

	if _, err := app.store.db.Exec("PRAGMA foreign_keys = OFF;"); err != nil {
		t.Fatal(err)
	}

	// Pasta legada sem cor/ícone e com parent_id apontando para si mesma (loop)
	if _, err := app.store.db.Exec(`INSERT INTO folders(id, name, parent_id, color, icon, created_at, updated_at)
		VALUES ('legacy-folder-1', 'Pasta Antiga', 'legacy-folder-1', '', '', ?, ?)`, now, now); err != nil {
		t.Fatal(err)
	}

	// Nota órfã apontando para pasta inexistente 'ghost-folder' e com timestamp zerado
	if _, err := app.store.db.Exec(`INSERT INTO notes(id, title, body, body_text, folder, folder_id, revision, checklist_total, checklist_open, sync_state, created_at, updated_at)
		VALUES ('orphan-note-1', 'Nota Órfã Legada', '{"type":"doc"}', 'Texto', 'Pasta Inexistente', 'ghost-folder', 1, 0, 0, 'clean', 0, 0)`); err != nil {
		t.Fatal(err)
	}

	// Nota com divergência entre a coluna folder e o nome real da pasta 'Pasta Antiga'
	if _, err := app.store.db.Exec(`INSERT INTO notes(id, title, body, body_text, folder, folder_id, revision, checklist_total, checklist_open, sync_state, created_at, updated_at)
		VALUES ('mismatched-note-1', 'Nota Nome Incompatível', '{"type":"doc"}', 'Texto', 'Nome Antigo Errado', 'legacy-folder-1', 1, 0, 0, 'clean', ?, ?)`, now, now); err != nil {
		t.Fatal(err)
	}

	// Nota com checklist desatualizada (o JSON tem 2 tarefas mas checklist_total armazena 0)
	bodyWithChecklist := `{"type":"doc","content":[{"type":"taskList","content":[{"type":"taskItem","attrs":{"checked":true},"content":[{"type":"paragraph"}]},{"type":"taskItem","attrs":{"checked":false},"content":[{"type":"paragraph"}]}]}]}`
	if _, err := app.store.db.Exec(`INSERT INTO notes(id, title, body, body_text, folder, folder_id, revision, checklist_total, checklist_open, sync_state, created_at, updated_at)
		VALUES ('checklist-note-1', 'Nota Tarefas', ?, 'Texto', 'Notas', 'folder-default', 1, 0, 0, 'clean', ?, ?)`, bodyWithChecklist, now, now); err != nil {
		t.Fatal(err)
	}

	if _, err := app.store.db.Exec("PRAGMA foreign_keys = ON;"); err != nil {
		t.Fatal(err)
	}

	// Executar o motor de compliance e integridade
	report, err := app.RunComplianceAudit()
	if err != nil {
		t.Fatalf("falha ao executar audit de compliance: %v", err)
	}

	if !report.Passed {
		t.Fatal("esperava que o relatório passasse com sucesso")
	}

	if report.OrphanNotesFixed < 1 {
		t.Fatalf("esperava corrigir pelo menos 1 nota órfã, corrigidas: %d", report.OrphanNotesFixed)
	}
	if report.ChecklistsCorrected < 1 {
		t.Fatalf("esperava corrigir pelo menos 1 projeção de checklist, corrigidas: %d", report.ChecklistsCorrected)
	}
	if report.RepairedFolders < 1 {
		t.Fatalf("esperava reparar pelo menos 1 pasta legada, reparadas: %d", report.RepairedFolders)
	}

	// 2. Verificar reparações no banco
	// a. Pasta legada teve o parent_id corrigido para NULL e cor/ícone preenchidos
	var parentID, color, icon string
	if err := app.store.db.QueryRow(`SELECT COALESCE(parent_id, ''), color, icon FROM folders WHERE id = 'legacy-folder-1'`).Scan(&parentID, &color, &icon); err != nil {
		t.Fatal(err)
	}
	if parentID != "" {
		t.Fatalf("esperava parent_id corrigido para vazio/NULL, obteve: %s", parentID)
	}
	if color != "#6366f1" || icon != "folder" {
		t.Fatalf("esperava cor #6366f1 e ícone folder, obteve: color=%s icon=%s", color, icon)
	}

	// b. Nota órfã movida para folder-default ('Notas') e marcada como 'pending'
	var folderID, folderName, syncState string
	var createdAt int64
	if err := app.store.db.QueryRow(`SELECT folder_id, folder, sync_state, created_at FROM notes WHERE id = 'orphan-note-1'`).Scan(&folderID, &folderName, &syncState, &createdAt); err != nil {
		t.Fatal(err)
	}
	if folderID != defaultFolderID || folderName != "Notas" {
		t.Fatalf("nota órfã não foi movida para pasta padrão, obtido: %s / %s", folderID, folderName)
	}
	if syncState != "pending" {
		t.Fatalf("esperava sync_state 'pending' após reparação, obtido: %s", syncState)
	}
	if createdAt <= 0 {
		t.Fatalf("timestamp inválido não foi corrigido: %d", createdAt)
	}

	// c. Nome da pasta na nota foi sincronizado
	if err := app.store.db.QueryRow(`SELECT folder FROM notes WHERE id = 'mismatched-note-1'`).Scan(&folderName); err != nil {
		t.Fatal(err)
	}
	if folderName != "Pasta Antiga" {
		t.Fatalf("nome de pasta não sincronizado na nota, obtido: %s", folderName)
	}

	// d. Checklist recalcula total=2, open=1
	var total, open int64
	if err := app.store.db.QueryRow(`SELECT checklist_total, checklist_open FROM notes WHERE id = 'checklist-note-1'`).Scan(&total, &open); err != nil {
		t.Fatal(err)
	}
	if total != 2 || open != 1 {
		t.Fatalf("esperava checklist total=2 open=1, obteve total=%d open=%d", total, open)
	}
}
