package main

import (
	"path/filepath"
	"testing"
)

func TestSafeDatabaseMigrationFlow(t *testing.T) {
	tmpRoot := t.TempDir()
	t.Setenv("LOCALAPPDATA", tmpRoot)
	origPath := filepath.Join(tmpRoot, "orig", "magnetares.db")

	app, err := NewApp(origPath)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		_ = saveConfiguredDatabasePath("")
		app.Close()
	}()

	// Cria uma nota no banco original
	savedNote, err := app.SaveNote(Note{
		ID:    "note-mig-1",
		Title: "Nota antes da migração",
		Body:  `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Conteúdo preservado"}]}]}`,
	})
	if err != nil {
		t.Fatalf("SaveNote: %v", err)
	}

	// 1. Inspeciona pasta destino nova (passando apenas a pasta, sem .db)
	newDir := filepath.Join(tmpRoot, "novo-local")
	info, err := app.InspectDatabasePathTarget(newDir)
	if err != nil {
		t.Fatalf("InspectDatabasePathTarget: %v", err)
	}
	if info.TargetExists || info.SameLocation || info.CurrentNotes < 1 {
		t.Fatalf("DatabaseTargetInfo inesperado: %+v", info)
	}
	expectedNewDB := filepath.Join(newDir, "magnetares.db")
	if info.ResolvedPath != expectedNewDB {
		t.Fatalf("esperava ResolvedPath=%q, obteve %q", expectedNewDB, info.ResolvedPath)
	}

	// 2. Migra copiando os dados de forma atômica
	migratedPath, err := app.MigrateDatabasePath(newDir, "copy")
	if err != nil {
		t.Fatalf("MigrateDatabasePath(copy): %v", err)
	}
	if migratedPath != expectedNewDB {
		t.Fatalf("esperava caminho migrado %q, obteve %q", expectedNewDB, migratedPath)
	}

	// Confirma que a nota foi preservada no novo banco
	notes, err := app.ListNotes()
	if err != nil {
		t.Fatalf("ListNotes após migração: %v", err)
	}
	found := false
	for _, n := range notes {
		if n.ID == savedNote.ID && n.Title == "Nota antes da migração" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("nota criada antes da migração não encontrada no novo local")
	}

	// 3. Inspeciona um terceiro local onde já existe o banco original (use_existing)
	infoOrig, err := app.InspectDatabasePathTarget(origPath)
	if err != nil {
		t.Fatalf("InspectDatabasePathTarget(orig): %v", err)
	}
	if !infoOrig.TargetExists || infoOrig.TargetNotes < 1 {
		t.Fatalf("esperava TargetExists=true e TargetNotes>=1 no original: %+v", infoOrig)
	}

	if _, err := app.MigrateDatabasePath(origPath, "use_existing"); err != nil {
		t.Fatalf("MigrateDatabasePath(use_existing): %v", err)
	}
}
