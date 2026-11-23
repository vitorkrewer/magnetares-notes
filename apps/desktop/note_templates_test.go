package main

import (
	"path/filepath"
	"testing"
)

func TestNoteTemplatesCRUD(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), "templates.db")
	app, err := NewApp(databasePath)
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	// Lista inicial vazia
	initial, err := app.ListNoteTemplates()
	if err != nil {
		t.Fatal(err)
	}
	if len(initial) != 0 {
		t.Fatalf("expected 0 initial templates, got %d", len(initial))
	}

	// Validação de nome vazio
	if _, err := app.SaveNoteTemplate(NoteTemplate{Name: "   "}); err == nil {
		t.Fatalf("expected error for empty template name")
	}

	// Criação de template
	saved, err := app.SaveNoteTemplate(NoteTemplate{
		Name:         "Pauta Semanal Diretoria",
		Description:  "Modelo de alinhamento executivo com OKRs e riscos.",
		Category:     "corporate",
		Icon:         "briefcase",
		DefaultTitle: "Pauta Diretoria — {{hoje}}",
		Body:         `{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Pauta"}]}]}`,
		Tags:         []string{"#Diretoria", "reuniao", "diretoria"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if saved.ID == "" {
		t.Fatalf("expected generated template ID")
	}
	if len(saved.Tags) != 2 {
		t.Fatalf("expected 2 deduplicated tags, got %v", saved.Tags)
	}

	// Atualização do mesmo template preservando createdAt
	updated, err := app.SaveNoteTemplate(NoteTemplate{
		ID:           saved.ID,
		Name:         "Pauta Semanal Diretoria v2",
		Description:  "Versão atualizada",
		Category:     "corporate",
		DefaultTitle: saved.DefaultTitle,
		Body:         saved.Body,
		Tags:         []string{"Diretoria"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.CreatedAt != saved.CreatedAt {
		t.Fatalf("expected createdAt preserved, got %q != %q", updated.CreatedAt, saved.CreatedAt)
	}

	listed, err := app.ListNoteTemplates()
	if err != nil {
		t.Fatal(err)
	}
	if len(listed) != 1 || listed[0].Name != "Pauta Semanal Diretoria v2" {
		t.Fatalf("unexpected listed templates: %+v", listed)
	}

	// Exclusão
	if err := app.DeleteNoteTemplate(saved.ID); err != nil {
		t.Fatal(err)
	}
	afterDelete, err := app.ListNoteTemplates()
	if err != nil {
		t.Fatal(err)
	}
	if len(afterDelete) != 0 {
		t.Fatalf("expected 0 templates after delete, got %d", len(afterDelete))
	}
}
