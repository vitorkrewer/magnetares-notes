package main

import (
	"path/filepath"
	"testing"
)

func TestNoteLinksExtractionGraphAndBacklinks(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), "connections.db")
	app, err := NewApp(databasePath)
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	_, err = app.SaveNote(Note{
		ID:       "note-b",
		Title:    "Arquitetura Local-First",
		Body:     `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Base de dados SQLite."}]}]}`,
		BodyText: "Base de dados SQLite.",
		Folder:   "Notas",
		FolderID: "folder-default",
	})
	if err != nil {
		t.Fatal(err)
	}

	_, err = app.SetNoteTags("note-b", []string{"arquitetura", "sqlite"})
	if err != nil {
		t.Fatal(err)
	}

	_, err = app.SaveNote(Note{
		ID:    "note-a",
		Title: "Resumo do Projeto",
		Body: `{
			"type":"doc",
			"content":[{
				"type":"paragraph",
				"content":[
					{"type":"text","text":"Veja detalhes em "},
					{"type":"noteLink","attrs":{"noteId":"note-b","title":"Arquitetura Local-First"}},
					{"type":"text","text":" e ignorar auto-link "},
					{"type":"noteLink","attrs":{"noteId":"note-a","title":"Resumo do Projeto"}},
					{"type":"text","text":" e link inexistente "},
					{"type":"noteLink","attrs":{"noteId":"missing-id","title":"Inexistente"}}
				]
			}]
		}`,
		BodyText: "Veja detalhes em [[Arquitetura Local-First]]",
		Folder:   "Notas",
		FolderID: "folder-default",
	})
	if err != nil {
		t.Fatal(err)
	}

	graph, err := app.GetConnectionsGraph()
	if err != nil {
		t.Fatal(err)
	}
	if len(graph.Notes) != 2 {
		t.Fatalf("expected 2 notes in graph, got %d", len(graph.Notes))
	}
	if len(graph.Links) != 1 {
		t.Fatalf("expected 1 valid link in graph, got %#v", graph.Links)
	}
	if graph.Links[0].SourceNoteID != "note-a" || graph.Links[0].TargetNoteID != "note-b" {
		t.Fatalf("unexpected link edge: %#v", graph.Links[0])
	}
	if len(graph.Tags) < 2 {
		t.Fatalf("expected tags in graph, got %#v", graph.Tags)
	}

	// Verificar backlinks na nota B e outlinks na nota A
	connsB, err := app.GetNoteConnections("note-b")
	if err != nil {
		t.Fatal(err)
	}
	if len(connsB) != 1 || connsB[0].Direction != "incoming" || connsB[0].NoteID != "note-a" {
		t.Fatalf("unexpected backlinks for note-b: %#v", connsB)
	}

	connsA, err := app.GetNoteConnections("note-a")
	if err != nil {
		t.Fatal(err)
	}
	if len(connsA) != 1 || connsA[0].Direction != "outgoing" || connsA[0].NoteID != "note-b" {
		t.Fatalf("unexpected outlinks for note-a: %#v", connsA)
	}

	// Ao enviar note-b para a lixeira, a aresta deve sumir do grafo ativo e reaparecer ao restaurar
	if err := app.DeleteNote("note-b"); err != nil {
		t.Fatal(err)
	}
	graphAfterTrash, err := app.GetConnectionsGraph()
	if err != nil {
		t.Fatal(err)
	}
	if len(graphAfterTrash.Links) != 0 || len(graphAfterTrash.Notes) != 1 {
		t.Fatalf("expected trashed note and links hidden from graph, got notes=%d links=%d", len(graphAfterTrash.Notes), len(graphAfterTrash.Links))
	}

	if err := app.RestoreNote("note-b"); err != nil {
		t.Fatal(err)
	}
	graphAfterRestore, err := app.GetConnectionsGraph()
	if err != nil {
		t.Fatal(err)
	}
	if len(graphAfterRestore.Links) != 1 || len(graphAfterRestore.Notes) != 2 {
		t.Fatalf("expected restored note and link back in graph, got notes=%d links=%d", len(graphAfterRestore.Notes), len(graphAfterRestore.Links))
	}

	// Remover o vínculo do corpo de note-a deve limpar note_links na regravação
	_, err = app.SaveNote(Note{
		ID:       "note-a",
		Title:    "Resumo do Projeto",
		Body:     `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Sem vínculos."}]}]}`,
		BodyText: "Sem vínculos.",
		Folder:   "Notas",
		FolderID: "folder-default",
	})
	if err != nil {
		t.Fatal(err)
	}
	graphCleared, err := app.GetConnectionsGraph()
	if err != nil {
		t.Fatal(err)
	}
	if len(graphCleared.Links) != 0 {
		t.Fatalf("expected links cleared after editing note-a, got %#v", graphCleared.Links)
	}
}

