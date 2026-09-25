package main

import (
	"path/filepath"
	"testing"
)

func TestFolderHierarchyAndRestrictedDeletion(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "folders.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	parent, err := app.SaveFolder(Folder{Name: "Trabalho", Color: "#6366f1", Icon: "briefcase"})
	if err != nil {
		t.Fatal(err)
	}
	child, err := app.SaveFolder(Folder{Name: "Projeto A", ParentID: &parent.ID, Color: "#10b981", Icon: "code"})
	if err != nil {
		t.Fatal(err)
	}
	parent.ParentID = &child.ID
	if _, err := app.SaveFolder(parent); err == nil {
		t.Fatal("expected cycle to be rejected")
	}

	note, err := app.SaveNote(Note{ID: "organized", Title: "Plano", Folder: "Notas"})
	if err != nil {
		t.Fatal(err)
	}
	if err := app.MoveNote(note.ID, child.ID); err != nil {
		t.Fatal(err)
	}
	navigation, err := app.ListNavigation()
	if err != nil {
		t.Fatal(err)
	}
	var childCount int64 = -1
	var foundColor, foundIcon string
	for _, folder := range navigation.Folders {
		if folder.ID == child.ID {
			childCount = folder.NoteCount
			foundColor = folder.Color
			foundIcon = folder.Icon
		}
	}
	if childCount != 1 {
		t.Fatalf("expected child note count 1, got %d", childCount)
	}
	if foundColor != "#10b981" || foundIcon != "code" {
		t.Fatalf("folder color/icon not preserved: color=%s icon=%s", foundColor, foundIcon)
	}

	folderNotes, err := app.QueryNotes(NoteQuery{Kind: "folder", ID: parent.ID})
	if err != nil {
		t.Fatal(err)
	}
	if len(folderNotes) != 1 || folderNotes[0].ID != note.ID {
		t.Fatalf("recursive folder query missed child note: %#v", folderNotes)
	}

	// Deleting child folder should reassign note to defaultFolderID ("folder-default")
	if err := app.DeleteFolder(child.ID); err != nil {
		t.Fatalf("expected deleting folder with notes to succeed by reassigning notes, got: %v", err)
	}

	notes, err := app.ListNotes()
	if err != nil {
		t.Fatal(err)
	}
	var reassignedFolderID string
	for _, n := range notes {
		if n.ID == note.ID {
			reassignedFolderID = n.FolderID
		}
	}
	if reassignedFolderID != defaultFolderID {
		t.Fatalf("expected note to be moved to default folder, got: %s", reassignedFolderID)
	}

	if err := app.DeleteFolder(parent.ID); err != nil {
		t.Fatalf("expected parent folder deletion to succeed, got: %v", err)
	}
}

func TestPinTagsAndChecklistProjectionSurviveAutosave(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "metadata.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	body := `{"type":"doc","content":[{"type":"taskList","content":[{"type":"taskItem","attrs":{"checked":true},"content":[{"type":"paragraph"}]},{"type":"taskItem","attrs":{"checked":false},"content":[{"type":"paragraph"}]}]}]}`
	stale, err := app.SaveNote(Note{ID: "metadata", Title: "Com tarefas", Body: body, BodyText: "Feita\nPendente", Folder: "Notas"})
	if err != nil {
		t.Fatal(err)
	}
	if stale.ChecklistTotal != 2 || stale.ChecklistOpen != 1 {
		t.Fatalf("unexpected checklist projection: total=%d open=%d", stale.ChecklistTotal, stale.ChecklistOpen)
	}
	if _, err := app.SaveNote(Note{ID: "newer", Title: "Nota mais recente", Folder: "Notas"}); err != nil {
		t.Fatal(err)
	}

	tagged, err := app.SetNoteTags(stale.ID, []string{"#Trabalho", " trabalho ", "#Ideias"})
	if err != nil {
		t.Fatal(err)
	}
	if len(tagged.Tags) != 2 || tagged.Tags[0] != "Ideias" || tagged.Tags[1] != "Trabalho" {
		t.Fatalf("unexpected normalized tags: %#v", tagged.Tags)
	}
	if _, err := app.SetNotePinned(stale.ID, true); err != nil {
		t.Fatal(err)
	}

	stale.Title = "Autosave atrasado"
	saved, err := app.SaveNote(stale)
	if err != nil {
		t.Fatal(err)
	}
	if saved.PinnedAt == nil || len(saved.Tags) != 2 {
		t.Fatalf("autosave reverted metadata: %#v", saved)
	}
	notes, err := app.ListNotes()
	if err != nil {
		t.Fatal(err)
	}
	if len(notes) != 2 || notes[0].ID != stale.ID {
		t.Fatalf("pinned note was not ordered first: %#v", notes)
	}
	navigation, err := app.ListNavigation()
	if err != nil {
		t.Fatal(err)
	}
	if len(navigation.Tags) != 2 || navigation.Tags[0].NoteCount != 1 || navigation.Tags[1].NoteCount != 1 {
		t.Fatalf("unexpected navigation tags: %#v", navigation.Tags)
	}
}

func TestSmartFolderRules(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "smart-folders.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	openBody := `{"type":"doc","content":[{"type":"taskList","content":[{"type":"taskItem","attrs":{"checked":false},"content":[{"type":"paragraph"}]}]}]}`
	doneBody := `{"type":"doc","content":[{"type":"taskList","content":[{"type":"taskItem","attrs":{"checked":true},"content":[{"type":"paragraph"}]}]}]}`
	tagged, err := app.SaveNote(Note{ID: "tagged", Title: "Trabalho", Body: openBody, Folder: "Notas"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := app.SetNoteTags(tagged.ID, []string{"trabalho"}); err != nil {
		t.Fatal(err)
	}
	if _, err := app.SaveNote(Note{ID: "done", Title: "Concluída", Body: doneBody, Folder: "Notas"}); err != nil {
		t.Fatal(err)
	}
	if _, err := app.SaveNote(Note{ID: "plain", Title: "Sem checklist", Folder: "Notas"}); err != nil {
		t.Fatal(err)
	}

	navigation, err := app.ListNavigation()
	if err != nil {
		t.Fatal(err)
	}
	if len(navigation.Tags) != 1 {
		t.Fatalf("expected one tag, got %#v", navigation.Tags)
	}
	tagSmart, err := app.SaveSmartFolder(SmartFolder{Name: "#trabalho", RuleKind: "tag", TagID: navigation.Tags[0].ID})
	if err != nil {
		t.Fatal(err)
	}
	openSmart, err := app.SaveSmartFolder(SmartFolder{Name: "Pendentes", RuleKind: "checklist", ChecklistState: "open"})
	if err != nil {
		t.Fatal(err)
	}
	doneSmart, err := app.SaveSmartFolder(SmartFolder{Name: "Concluídas", RuleKind: "checklist", ChecklistState: "completed"})
	if err != nil {
		t.Fatal(err)
	}
	recentSmart, err := app.SaveSmartFolder(SmartFolder{Name: "Últimos 7 dias", RuleKind: "date", DateField: "updated_at", DateRange: "last_7_days"})
	if err != nil {
		t.Fatal(err)
	}

	assertSmartIDs := func(smart SmartFolder, expected ...string) {
		t.Helper()
		notes, err := app.QueryNotes(NoteQuery{Kind: "smart", ID: smart.ID})
		if err != nil {
			t.Fatal(err)
		}
		if len(notes) != len(expected) {
			t.Fatalf("smart folder %q returned %#v", smart.Name, notes)
		}
		seen := make(map[string]bool)
		for _, note := range notes {
			seen[note.ID] = true
		}
		for _, id := range expected {
			if !seen[id] {
				t.Fatalf("smart folder %q missed %s: %#v", smart.Name, id, notes)
			}
		}
	}
	assertSmartIDs(tagSmart, "tagged")
	assertSmartIDs(openSmart, "tagged")
	assertSmartIDs(doneSmart, "done")
	assertSmartIDs(recentSmart, "tagged", "done", "plain")

	if err := app.DeleteNote(tagged.ID); err != nil {
		t.Fatal(err)
	}
	assertSmartIDs(tagSmart)
	assertSmartIDs(openSmart)
	if _, err := app.SaveSmartFolder(SmartFolder{Name: "Inválida", RuleKind: "date", DateField: "bad", DateRange: "today"}); err == nil {
		t.Fatal("expected invalid smart folder rule to be rejected")
	}
	if err := app.DeleteSmartFolder(tagSmart.ID); err != nil {
		t.Fatal(err)
	}
}
