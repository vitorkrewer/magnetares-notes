package main

import (
	"database/sql"
	"path/filepath"
	"testing"
	"time"
)

func TestNotesPersistAcrossReopen(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), "aster.db")

	first, err := NewApp(databasePath)
	if err != nil {
		t.Fatal(err)
	}
	note, err := first.SaveNote(Note{ID: "persistent", Title: "Rascunho", Body: `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Primeira versão"}]}]}`, BodyText: "Primeira versão", Folder: "Notas"})
	if err != nil {
		t.Fatal(err)
	}
	note.Title = "Plano final"
	note.Body = `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Conteúdo preservado"}]}]}`
	note.BodyText = "Conteúdo preservado"
	if _, err := first.SaveNote(note); err != nil {
		t.Fatal(err)
	}
	if err := first.Close(); err != nil {
		t.Fatal(err)
	}

	second, err := NewApp(databasePath)
	if err != nil {
		t.Fatal(err)
	}
	notes, err := second.ListNotes()
	if err != nil {
		t.Fatal(err)
	}
	if len(notes) != 1 || notes[0].Title != "Plano final" || notes[0].BodyText != "Conteúdo preservado" {
		t.Fatalf("unexpected notes after reopen: %#v", notes)
	}
	if notes[0].Revision != 2 {
		t.Fatalf("expected revision 2, got %d", notes[0].Revision)
	}
	if err := second.DeleteNote(notes[0].ID); err != nil {
		t.Fatal(err)
	}
	if err := second.Close(); err != nil {
		t.Fatal(err)
	}

	third, err := NewApp(databasePath)
	if err != nil {
		t.Fatal(err)
	}
	defer third.Close()
	activeNotes, err := third.ListNotes()
	if err != nil {
		t.Fatal(err)
	}
	deletedNotes, err := third.ListDeletedNotes()
	if err != nil {
		t.Fatal(err)
	}
	if len(activeNotes) != 0 || len(deletedNotes) != 1 {
		t.Fatalf("unexpected deletion state: active=%d deleted=%d", len(activeNotes), len(deletedNotes))
	}
	if err := third.RestoreNote(deletedNotes[0].ID); err != nil {
		t.Fatal(err)
	}
	restoredNotes, err := third.ListNotes()
	if err != nil {
		t.Fatal(err)
	}
	if len(restoredNotes) != 1 || restoredNotes[0].DeletedAt != nil {
		t.Fatalf("note was not restored: %#v", restoredNotes)
	}
}

func TestStructuredBodyMigrationPreservesPlainText(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), "legacy.db")
	db, err := sql.Open("sqlite", databasePath)
	if err != nil {
		t.Fatal(err)
	}
	initialMigration, err := localMigrations.ReadFile("localmigrations/0001_initial.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(string(initialMigration)); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO schema_migrations(version, applied_at) VALUES ('0001_initial.sql', ?)`, time.Now().UTC().UnixMilli()); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().UnixMilli()
	if _, err := db.Exec(`INSERT INTO notes(id, title, body, folder, revision, created_at, updated_at)
		VALUES ('legacy', 'Nota antiga', 'Texto simples preservado', 'Notas', 1, ?, ?)`, now, now); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	app, err := NewApp(databasePath)
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()
	notes, err := app.ListNotes()
	if err != nil {
		t.Fatal(err)
	}
	if len(notes) != 1 || notes[0].Body != "Texto simples preservado" || notes[0].BodyText != "Texto simples preservado" {
		t.Fatalf("legacy body was not preserved: %#v", notes)
	}
}
