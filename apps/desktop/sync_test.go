package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestSyncNowPushesPendingNoteAndMarksItClean(t *testing.T) {
	var receivedProfile string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedProfile = r.Header.Get("X-Magnetares-Profile")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/healthz":
			w.WriteHeader(http.StatusNoContent)
		case r.Method == http.MethodPut && r.URL.Path == "/v1/folders/folder-work":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(syncRemoteFolder{ID: "folder-work", Name: "Work"})
		case r.Method == http.MethodGet && r.URL.Path == "/v1/folders":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode([]syncRemoteFolder{})
		case r.Method == http.MethodGet && r.URL.Path == "/v1/tags":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode([]syncRemoteTag{})
		case r.Method == http.MethodPut && strings.HasPrefix(r.URL.Path, "/v1/tags/"):
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(syncRemoteTag{})
		case r.Method == http.MethodPut:
			var mutation struct {
				Note struct {
					Title    string   `json:"title"`
					Body     string   `json:"body"`
					BodyText string   `json:"bodyText"`
					Folder   string   `json:"folder"`
					FolderID string   `json:"folderId"`
					Tags     []string `json:"tags"`
				} `json:"note"`
			}
			if err := json.NewDecoder(r.Body).Decode(&mutation); err != nil {
				t.Fatal(err)
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(syncMutationResult{
				Note: syncRemoteNote{
					ID:        "00000000-0000-4000-8000-000000000001",
					Title:     mutation.Note.Title,
					Body:      mutation.Note.Body,
					BodyText:  mutation.Note.BodyText,
					Folder:    mutation.Note.Folder,
					FolderID:  mutation.Note.FolderID,
					Tags:      mutation.Note.Tags,
					Revision:  1,
					CreatedAt: time.Now().UTC(),
					UpdatedAt: time.Now().UTC(),
				},
				Cursor: "1",
			})
		case r.Method == http.MethodGet && r.URL.Path == "/v1/changes":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(syncChangesPage{Changes: []syncChange{}, NextCursor: "1", HasMore: false})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	app, err := NewApp(filepath.Join(t.TempDir(), "sync.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	folder, err := app.SaveFolder(Folder{ID: "folder-work", Name: "Work"})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := app.SaveNote(Note{ID: "00000000-0000-4000-8000-000000000001", Title: "Offline", Body: `{"type":"doc","content":[{"type":"paragraph"}]}`, BodyText: "Offline", Folder: folder.Name, FolderID: folder.ID}); err != nil {
		t.Fatal(err)
	}

	result, err := app.store.syncNow(server.URL, "libsql://sync-test.turso.io", "test-token")
	if err != nil {
		t.Fatal(err)
	}
	if result.Uploaded != 1 || result.Downloaded != 0 || result.Conflicts != 0 {
		t.Fatalf("unexpected sync result: %#v", result)
	}
	if receivedProfile == "" {
		t.Fatal("sync profile header was not sent")
	}

	var syncState string
	var serverRevision int64
	if err := app.store.db.QueryRow("SELECT sync_state, server_revision FROM notes WHERE id = ?", "00000000-0000-4000-8000-000000000001").Scan(&syncState, &serverRevision); err != nil {
		t.Fatal(err)
	}
	if syncState != "clean" || serverRevision != 1 {
		t.Fatalf("pending note was not acknowledged: state=%s revision=%d", syncState, serverRevision)
	}
}

func TestApplyRemoteNoteCreatesFolderAndPreservesMetadata(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "remote.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	pinnedTime := time.Now().UTC()
	remote := syncRemoteNote{
		ID:             "remote-note-100",
		Title:          "Remote Note",
		Body:           `{"type":"doc"}`,
		BodyText:       "Remote Note",
		Folder:         "Projetos",
		FolderID:       "folder-proj-999",
		PinnedAt:       &pinnedTime,
		Tags:           []string{"urgente", "reuniao"},
		ChecklistTotal: 3,
		ChecklistOpen:  1,
		Revision:       2,
		CreatedAt:      time.Now().UTC(),
		UpdatedAt:      time.Now().UTC(),
	}

	conflict, err := app.store.applyRemoteNote(remote)
	if err != nil {
		t.Fatalf("applyRemoteNote error: %v", err)
	}
	if conflict {
		t.Fatal("expected no conflict")
	}

	note, err := app.store.getNote("remote-note-100")
	if err != nil {
		t.Fatalf("getNote error: %v", err)
	}
	if note.Folder != "Projetos" || note.FolderID != "folder-proj-999" {
		t.Fatalf("folder mismatch: got %s (%s)", note.Folder, note.FolderID)
	}
	if note.PinnedAt == nil {
		t.Fatal("pinnedAt was not saved")
	}
	if len(note.Tags) != 2 || note.Tags[0] != "reuniao" || note.Tags[1] != "urgente" {
		t.Fatalf("tags mismatch: %#v", note.Tags)
	}

	// Verify folder was automatically registered in folders table
	var folderName string
	if err := app.store.db.QueryRow("SELECT name FROM folders WHERE id = ?", "folder-proj-999").Scan(&folderName); err != nil {
		t.Fatalf("folder table registration failed: %v", err)
	}
	if folderName != "Projetos" {
		t.Fatalf("expected folder name Projetos, got %s", folderName)
	}
}

func TestTursoValueMarshaling(t *testing.T) {
	tests := []struct {
		val      TursoValue
		expected string
	}{
		{val: TursoValue{Type: "null"}, expected: `{"type":"null"}`},
		{val: TursoValue{Type: "text", Value: ""}, expected: `{"type":"text","value":""}`},
		{val: TursoValue{Type: "text", Value: "Hello"}, expected: `{"type":"text","value":"Hello"}`},
		{val: TursoValue{Type: "integer", Value: "42"}, expected: `{"type":"integer","value":"42"}`},
	}

	for _, tt := range tests {
		bytes, err := json.Marshal(tt.val)
		if err != nil {
			t.Fatalf("marshal error: %v", err)
		}
		if string(bytes) != tt.expected {
			t.Errorf("expected %s, got %s", tt.expected, string(bytes))
		}
	}
}

func TestTursoRunTransactionSendsSinglePipeline(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body TursoPipelineBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if len(body.Requests) != 4 || body.Requests[0].Stmt.SQL != "BEGIN" || body.Requests[2].Stmt.SQL != "COMMIT" {
			t.Fatalf("unexpected transaction pipeline: %#v", body.Requests)
		}
		results := make([]TursoPipelineResult, len(body.Requests))
		for index := range results {
			results[index].Type = "ok"
		}
		results[1].Response.Result.AffectedRowCount = 1
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(TursoPipelineResponse{Results: results})
	}))
	defer server.Close()

	client := NewTursoClient(server.URL, "test-token")
	results, err := client.RunTransaction([]TursoStatement{{SQL: "UPDATE notes SET title = ?", Args: []any{"updated"}}})
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 4 || results[1].Response.Result.AffectedRowCount != 1 {
		t.Fatalf("unexpected transaction result: %#v", results)
	}
}

func TestSyncRemoteNoteFromChangeRowUsesHistoricalSnapshot(t *testing.T) {
	updatedAt := time.Now().UTC().Truncate(time.Millisecond)
	want := syncRemoteNote{
		ID:        "note-history",
		Title:     "Snapshot da revisão antiga",
		Body:      `{"type":"doc"}`,
		BodyText:  "Conteúdo antigo",
		Folder:    "Notas",
		FolderID:  "folder-default",
		Revision:  1,
		CreatedAt: updatedAt,
		UpdatedAt: updatedAt,
		Tags:      []string{"histórico"},
	}
	snapshot, err := json.Marshal(want)
	if err != nil {
		t.Fatal(err)
	}

	row := make([]TursoValue, 16)
	row[0] = TursoValue{Type: "integer", Value: "10"}
	row[1] = TursoValue{Type: "text", Value: string(snapshot)}

	got, err := syncRemoteNoteFromChangeRow(row)
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != want.ID || got.Title != want.Title || got.BodyText != want.BodyText || got.Revision != want.Revision {
		t.Fatalf("historical snapshot was not used: got %#v", got)
	}
}

func TestLocalOutboxAndCanonicalStateHash(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "outbox_test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	// 1. Save note & verify outbox entry
	note, err := app.SaveNote(Note{ID: "note-outbox-1", Title: "Outbox Test", Body: "Hello Outbox"})
	if err != nil {
		t.Fatalf("SaveNote error: %v", err)
	}

	var opCount int
	if err := app.store.db.QueryRow("SELECT COUNT(*) FROM sync_outbox WHERE entity_id = ? AND entity_type = 'note'", note.ID).Scan(&opCount); err != nil {
		t.Fatalf("query outbox error: %v", err)
	}
	if opCount == 0 {
		t.Fatal("expected outbox operation for saved note, got 0")
	}

	// 2. Compute canonical hash
	hash, err := app.store.ComputeCanonicalStateHash()
	if err != nil {
		t.Fatalf("ComputeCanonicalStateHash error: %v", err)
	}
	if hash == "" {
		t.Fatal("expected non-empty canonical hash")
	}

	// 3. Delete note & verify outbox op and soft delete
	if err := app.DeleteNote(note.ID); err != nil {
		t.Fatalf("DeleteNote error: %v", err)
	}

	var delOpCount int
	if err := app.store.db.QueryRow("SELECT COUNT(*) FROM sync_outbox WHERE entity_id = ? AND op_type = 'delete'", note.ID).Scan(&delOpCount); err != nil {
		t.Fatalf("query outbox delete op error: %v", err)
	}
	if delOpCount == 0 {
		t.Fatal("expected outbox delete op, got 0")
	}

	// Hash should change deterministically
	newHash, err := app.store.ComputeCanonicalStateHash()
	if err != nil {
		t.Fatalf("ComputeCanonicalStateHash after delete error: %v", err)
	}
	if newHash == hash {
		t.Fatal("expected canonical hash to change after deletion")
	}
}

func TestFolderTombstonePropagation(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "tombstone_test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	folder, err := app.SaveFolder(Folder{ID: "folder-tombstone-1", Name: "Projetos"})
	if err != nil {
		t.Fatalf("SaveFolder error: %v", err)
	}

	// Verify folder is listed in navigation
	nav, err := app.ListNavigation()
	if err != nil {
		t.Fatalf("ListNavigation error: %v", err)
	}
	found := false
	for _, f := range nav.Folders {
		if f.ID == folder.ID {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("folder not found in navigation before deletion")
	}

	// Delete folder (soft-delete / tombstone)
	if err := app.DeleteFolder(folder.ID); err != nil {
		t.Fatalf("DeleteFolder error: %v", err)
	}

	// Verify folder is no longer listed in navigation
	navAfter, err := app.ListNavigation()
	if err != nil {
		t.Fatalf("ListNavigation after delete error: %v", err)
	}
	for _, f := range navAfter.Folders {
		if f.ID == folder.ID {
			t.Fatal("deleted folder still appeared in navigation!")
		}
	}

	// Verify tombstone deleted_at exists in DB table
	var deletedAt sql.NullInt64
	if err := app.store.db.QueryRow("SELECT deleted_at FROM folders WHERE id = ?", folder.ID).Scan(&deletedAt); err != nil {
		t.Fatalf("query folder tombstone error: %v", err)
	}
	if !deletedAt.Valid {
		t.Fatal("expected deleted_at tombstone on folder row, got NULL")
	}
}

// TestDualTombstoneConverges verifies that when both local and remote have deleted
// the same note, applyRemoteNote converges cleanly without creating a conflict.
func TestDualTombstoneConverges(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "dual_tombstone.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	// Create and save a note
	note, err := app.SaveNote(Note{
		ID:       "note-tombstone-dual",
		Title:    "Delete Me",
		Body:     `{"type":"doc","content":[{"type":"paragraph"}]}`,
		BodyText: "Delete Me",
	})
	if err != nil {
		t.Fatalf("SaveNote error: %v", err)
	}

	// Locally delete the note
	if err := app.DeleteNote(note.ID); err != nil {
		t.Fatalf("DeleteNote error: %v", err)
	}

	// Simulate server sending back a tombstone for the same note (different revision)
	localDeletedTime := time.Now().UTC().Add(-1 * time.Second)
	remoteDeletedTime := time.Now().UTC()
	remote := syncRemoteNote{
		ID:        "note-tombstone-dual",
		Title:     "Delete Me",
		Body:      `{"type":"doc","content":[{"type":"paragraph"}]}`,
		BodyText:  "Delete Me",
		FolderID:  "folder-default",
		Folder:    "Notas",
		Revision:  2,
		DeletedAt: &remoteDeletedTime,
		CreatedAt: localDeletedTime,
		UpdatedAt: remoteDeletedTime,
		Tags:      []string{},
	}

	conflict, err := app.store.applyRemoteNote(remote)
	if err != nil {
		t.Fatalf("applyRemoteNote (dual tombstone) error: %v", err)
	}
	if conflict {
		t.Fatal("dual tombstone should NOT generate a conflict")
	}

	// Note should remain deleted (clean)
	var syncState string
	var deletedAt sql.NullInt64
	if err := app.store.db.QueryRow("SELECT sync_state, deleted_at FROM notes WHERE id = ?", note.ID).Scan(&syncState, &deletedAt); err != nil {
		t.Fatalf("query note state error: %v", err)
	}
	if syncState != "clean" {
		t.Fatalf("expected sync_state=clean after dual tombstone, got %s", syncState)
	}
	if !deletedAt.Valid {
		t.Fatal("expected note to remain deleted after dual tombstone convergence")
	}
}

// TestRemoteResurrectsLocallyDeletedNote verifies that when a remote note is
// updated AFTER the local deletion, the remote version wins (last-write-wins).
func TestRemoteResurrectsLocallyDeletedNote(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "resurrect.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	note, err := app.SaveNote(Note{
		ID:       "note-resurrect-1",
		Title:    "Will be deleted locally",
		Body:     `{"type":"doc","content":[{"type":"paragraph"}]}`,
		BodyText: "Will be deleted locally",
	})
	if err != nil {
		t.Fatalf("SaveNote error: %v", err)
	}

	// Locally delete — updated_at will be set to now
	if err := app.DeleteNote(note.ID); err != nil {
		t.Fatalf("DeleteNote error: %v", err)
	}

	// Remote has a newer edit (timestamp after local deletion)
	remoteTime := time.Now().UTC().Add(5 * time.Second)
	remote := syncRemoteNote{
		ID:        "note-resurrect-1",
		Title:     "Resurrected by remote",
		Body:      `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Resurrected"}]}]}`,
		BodyText:  "Resurrected",
		FolderID:  "folder-default",
		Folder:    "Notas",
		Revision:  3,
		DeletedAt: nil,
		CreatedAt: time.Now().UTC(),
		UpdatedAt: remoteTime,
		Tags:      []string{},
	}

	conflict, err := app.store.applyRemoteNote(remote)
	if err != nil {
		t.Fatalf("applyRemoteNote (resurrect) error: %v", err)
	}
	if conflict {
		t.Fatal("remote resurrection with newer timestamp should NOT conflict — remote should win")
	}

	// Note should now be alive with remote content
	fetched, err := app.store.getNote(note.ID)
	if err != nil {
		t.Fatalf("getNote after resurrection error: %v", err)
	}
	if fetched.DeletedAt != nil {
		t.Fatal("note should NOT be deleted after remote resurrection")
	}
	if fetched.Title != "Resurrected by remote" {
		t.Fatalf("expected resurrected title, got: %s", fetched.Title)
	}
}

// TestLWWNotesWithSameBaseRevision verifies that when local and remote edits
// have the same server_revision, the newer updated_at wins (Last-Write-Wins).
func TestLWWNotesWithSameBaseRevision(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "lww_notes.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	// Create a clean baseline note
	note, err := app.SaveNote(Note{
		ID:       "note-lww-1",
		Title:    "Baseline",
		Body:     `{"type":"doc","content":[{"type":"paragraph"}]}`,
		BodyText: "Baseline",
	})
	if err != nil {
		t.Fatalf("SaveNote error: %v", err)
	}

	// Simulate it being synced (clean at revision 1)
	_, _ = app.store.db.Exec("UPDATE notes SET sync_state = 'clean', server_revision = 1 WHERE id = ?", note.ID)

	// Local edit — makes it pending again
	_, err = app.SaveNote(Note{
		ID:       note.ID,
		Title:    "Local Edit",
		Body:     note.Body,
		BodyText: "Local Edit",
	})
	if err != nil {
		t.Fatalf("local SaveNote error: %v", err)
	}

	// Remote edit came in with the same server_revision but an OLDER updated_at
	olderTime := time.Now().UTC().Add(-10 * time.Second)
	remote := syncRemoteNote{
		ID:        note.ID,
		Title:     "Remote Old Edit",
		Body:      note.Body,
		BodyText:  "Remote Old Edit",
		FolderID:  "folder-default",
		Folder:    "Notas",
		Revision:  1,
		CreatedAt: olderTime,
		UpdatedAt: olderTime, // older than local
		Tags:      []string{},
	}

	conflict, err := app.store.applyRemoteNote(remote)
	if err != nil {
		t.Fatalf("applyRemoteNote (LWW same rev) error: %v", err)
	}
	if conflict {
		t.Fatal("same-revision LWW should NOT conflict — local (newer) should win silently")
	}

	// Local edit should still be pending and preserved
	var syncState, title string
	if err := app.store.db.QueryRow("SELECT sync_state, title FROM notes WHERE id = ?", note.ID).Scan(&syncState, &title); err != nil {
		t.Fatalf("query note LWW state error: %v", err)
	}
	if syncState != "pending" {
		t.Fatalf("local edit should remain pending after remote LWW loss, got: %s", syncState)
	}
	if title != "Local Edit" {
		t.Fatalf("local title should be preserved after LWW, got: %s", title)
	}
}

func TestApplyRemoteNotePreservesLocalContentAfterConflict(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "conflict_preservation.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	note, err := app.SaveNote(Note{
		ID:       "note-conflict-preserve",
		Title:    "Minha versão",
		Body:     `{"type":"doc"}`,
		BodyText: "Minha versão",
	})
	if err != nil {
		t.Fatal(err)
	}
	_, err = app.store.db.Exec(`UPDATE notes SET sync_state = 'conflict', server_revision = 1 WHERE id = ?`, note.ID)
	if err != nil {
		t.Fatal(err)
	}

	remote := syncRemoteNote{
		ID:        note.ID,
		Title:     "Versão remota que não deve apagar a local",
		Body:      `{"type":"doc","content":[{"type":"paragraph"}]}`,
		BodyText:  "Remota",
		Folder:    "Notas",
		FolderID:  "folder-default",
		Revision:  2,
		CreatedAt: time.Now().UTC().Add(-time.Minute),
		UpdatedAt: time.Now().UTC(),
	}

	conflict, err := app.store.applyRemoteNote(remote)
	if err != nil {
		t.Fatal(err)
	}
	if !conflict {
		t.Fatal("expected remote change to remain a conflict")
	}

	var state, title, bodyText string
	if err := app.store.db.QueryRow("SELECT sync_state, title, body_text FROM notes WHERE id = ?", note.ID).Scan(&state, &title, &bodyText); err != nil {
		t.Fatal(err)
	}
	if state != "conflict" {
		t.Fatalf("expected conflict state to be preserved, got %s", state)
	}
	if title != "Minha versão" || bodyText != "Minha versão" {
		t.Fatalf("local content was overwritten: title=%q bodyText=%q", title, bodyText)
	}
}

func TestApplyRemoteNoteIgnoresOlderRevision(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "stale_remote.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	note, err := app.SaveNote(Note{
		ID:       "note-stale-remote",
		Title:    "Versão atual",
		Body:     `{"type":"doc"}`,
		BodyText: "Atual",
	})
	if err != nil {
		t.Fatal(err)
	}
	_, err = app.store.db.Exec(`UPDATE notes SET sync_state = 'clean', server_revision = 3 WHERE id = ?`, note.ID)
	if err != nil {
		t.Fatal(err)
	}

	remote := syncRemoteNote{
		ID:        note.ID,
		Title:     "Versão antiga",
		Body:      `{"type":"doc"}`,
		BodyText:  "Antiga",
		Folder:    "Notas",
		FolderID:  "folder-default",
		Revision:  2,
		CreatedAt: time.Now().UTC().Add(-time.Minute),
		UpdatedAt: time.Now().UTC().Add(-time.Minute),
	}

	conflict, err := app.store.applyRemoteNote(remote)
	if err != nil {
		t.Fatal(err)
	}
	if conflict {
		t.Fatal("stale remote change should be ignored, not reported as a conflict")
	}

	var title, bodyText string
	var revision int64
	if err := app.store.db.QueryRow("SELECT title, body_text, server_revision FROM notes WHERE id = ?", note.ID).Scan(&title, &bodyText, &revision); err != nil {
		t.Fatal(err)
	}
	if title != "Versão atual" || bodyText != "Atual" || revision != 3 {
		t.Fatalf("stale remote change altered local state: title=%q bodyText=%q revision=%d", title, bodyText, revision)
	}
}

func TestEquivalentRemoteContentConvergesWithoutConflict(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "equivalent_remote.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	body := `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Mesmo conteúdo"}]}]}`
	note, err := app.SaveNote(Note{
		ID:       "note-equivalent",
		Title:    "Bem-vindo ao Magnetares",
		Body:     body,
		BodyText: "Um lugar tranquilo para pensar, planejar e guardar o que importa.",
		Folder:   "Notas",
		FolderID: "folder-default",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := app.store.db.Exec("UPDATE notes SET sync_state = 'clean', server_revision = 1 WHERE id = ?", note.ID); err != nil {
		t.Fatal(err)
	}

	remote := syncRemoteNote{
		ID:        note.ID,
		Title:     note.Title,
		Body:      ` { "type": "doc", "content": [ { "type": "paragraph", "content": [ { "type": "text", "text": "Mesmo conteúdo" } ] } ] } `,
		BodyText:  note.BodyText,
		Folder:    note.Folder,
		FolderID:  note.FolderID,
		Revision:  2,
		CreatedAt: note.CreatedAt,
		UpdatedAt: time.Now().UTC(),
	}

	conflict, err := app.store.applyRemoteNote(remote)
	if err != nil {
		t.Fatal(err)
	}
	if conflict {
		t.Fatal("equivalent content should converge without a conflict")
	}

	var state string
	var revision int64
	var conflictCount int
	if err := app.store.db.QueryRow("SELECT sync_state, server_revision FROM notes WHERE id = ?", note.ID).Scan(&state, &revision); err != nil {
		t.Fatal(err)
	}
	if err := app.store.db.QueryRow("SELECT COUNT(*) FROM note_conflicts WHERE note_id = ?", note.ID).Scan(&conflictCount); err != nil {
		t.Fatal(err)
	}
	if state != "clean" || revision != 2 || conflictCount != 0 {
		t.Fatalf("equivalent remote did not converge: state=%s revision=%d conflicts=%d", state, revision, conflictCount)
	}
}

func TestResolveNoteConflictKeepsChosenVersion(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "resolve_conflict.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	note, err := app.SaveNote(Note{ID: "note-resolve", Title: "Local", Body: `{"type":"doc"}`, BodyText: "Local"})
	if err != nil {
		t.Fatal(err)
	}
	remoteTime := time.Now().UTC()
	remote := syncRemoteNote{
		ID:        note.ID,
		Title:     "Remote",
		Body:      `{"type":"doc","content":[{"type":"paragraph"}]}`,
		BodyText:  "Remote",
		Folder:    "Notas",
		FolderID:  "folder-default",
		Revision:  4,
		Tags:      []string{"cloud"},
		CreatedAt: remoteTime.Add(-time.Hour),
		UpdatedAt: remoteTime,
	}
	if err := app.store.recordConflict(note.ID, note.ID, remote); err != nil {
		t.Fatal(err)
	}

	conflicts, err := app.store.ListNoteConflicts()
	if err != nil || len(conflicts) != 1 || conflicts[0].RemoteTitle != "Remote" {
		t.Fatalf("unexpected conflict list: %#v, err=%v", conflicts, err)
	}
	if err := app.store.ResolveNoteConflict(note.ID, "remote"); err != nil {
		t.Fatal(err)
	}

	resolved, err := app.store.getNote(note.ID)
	if err != nil {
		t.Fatal(err)
	}
	if resolved.Title != "Remote" || resolved.UpdatedAt.UnixMilli() != remote.UpdatedAt.UnixMilli() {
		t.Fatalf("remote resolution did not replace note: %#v", resolved)
	}
	var state string
	var conflictCount int
	if err := app.store.db.QueryRow("SELECT sync_state FROM notes WHERE id = ?", note.ID).Scan(&state); err != nil {
		t.Fatal(err)
	}
	if err := app.store.db.QueryRow("SELECT COUNT(*) FROM note_conflicts WHERE note_id = ?", note.ID).Scan(&conflictCount); err != nil {
		t.Fatal(err)
	}
	if state != "clean" || conflictCount != 0 {
		t.Fatalf("remote resolution left invalid state: state=%s conflicts=%d", state, conflictCount)
	}
}

func TestResolveNoteConflictRebasesLocalVersion(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "resolve_local_conflict.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	note, err := app.SaveNote(Note{ID: "note-resolve-local", Title: "Keep local", Body: `{"type":"doc"}`, BodyText: "Local"})
	if err != nil {
		t.Fatal(err)
	}
	var originalMutationID string
	if err := app.store.db.QueryRow("SELECT pending_mutation_id FROM notes WHERE id = ?", note.ID).Scan(&originalMutationID); err != nil {
		t.Fatal(err)
	}
	remote := syncRemoteNote{
		ID:        note.ID,
		Title:     "Remote base",
		Body:      `{"type":"doc"}`,
		BodyText:  "Remote",
		Folder:    "Notas",
		FolderID:  "folder-default",
		Revision:  5,
		CreatedAt: time.Now().UTC().Add(-time.Hour),
		UpdatedAt: time.Now().UTC(),
	}
	if err := app.store.recordConflict(note.ID, originalMutationID, remote); err != nil {
		t.Fatal(err)
	}
	if err := app.store.ResolveNoteConflict(note.ID, "local"); err != nil {
		t.Fatal(err)
	}

	var state, mutationID string
	var serverRevision int64
	if err := app.store.db.QueryRow("SELECT sync_state, pending_mutation_id, server_revision FROM notes WHERE id = ?", note.ID).Scan(&state, &mutationID, &serverRevision); err != nil {
		t.Fatal(err)
	}
	if state != "pending" || mutationID == "" || serverRevision != remote.Revision {
		t.Fatalf("local resolution was not rebased: state=%s mutation=%q serverRevision=%d", state, mutationID, serverRevision)
	}
}

func TestResolveNoteConflictMergesLocalAndRemote(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "merge_conflict.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	localBody := `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Local"}]}]}`
	note, err := app.SaveNote(Note{ID: "note-merge", Title: "Local title", Body: localBody, BodyText: "Local text"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := app.store.setNoteTags(note.ID, []string{"local"}); err != nil {
		t.Fatal(err)
	}
	var mutationID string
	if err := app.store.db.QueryRow("SELECT pending_mutation_id FROM notes WHERE id = ?", note.ID).Scan(&mutationID); err != nil {
		t.Fatal(err)
	}
	remote := syncRemoteNote{
		ID:        note.ID,
		Title:     "Remote title",
		Body:      `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Cloud"}]}]}`,
		BodyText:  "Cloud text",
		Folder:    "Notas",
		FolderID:  "folder-default",
		Revision:  7,
		Tags:      []string{"cloud", "LOCAL"},
		CreatedAt: time.Now().UTC().Add(-time.Hour),
		UpdatedAt: time.Now().UTC(),
	}
	if err := app.store.recordConflict(note.ID, mutationID, remote); err != nil {
		t.Fatal(err)
	}

	if err := app.store.ResolveNoteConflict(note.ID, "merge"); err != nil {
		t.Fatal(err)
	}
	merged, err := app.store.getNote(note.ID)
	if err != nil {
		t.Fatal(err)
	}
	if merged.BodyText != "Local text\n\n--- Versão da nuvem: Remote title ---\n\nCloud text" {
		t.Fatalf("merged text lost a side: %q", merged.BodyText)
	}
	if len(merged.Tags) != 2 || merged.Tags[0] != "cloud" || merged.Tags[1] != "local" {
		t.Fatalf("merged tags were not deduplicated: %#v", merged.Tags)
	}
	var document documentNode
	if err := json.Unmarshal([]byte(merged.Body), &document); err != nil {
		t.Fatal(err)
	}
	if len(document.Content) != 3 || document.Content[1].Content[0].Text != "--- Versão da nuvem: Remote title ---" {
		t.Fatalf("structured merge separator missing: %#v", document.Content)
	}
	var state string
	var serverRevision int64
	if err := app.store.db.QueryRow("SELECT sync_state, server_revision FROM notes WHERE id = ?", note.ID).Scan(&state, &serverRevision); err != nil {
		t.Fatal(err)
	}
	if state != "pending" || serverRevision != remote.Revision {
		t.Fatalf("merged note is not ready for sync: state=%s revision=%d", state, serverRevision)
	}
}

// TestFolderSyncStateTracking verifies that folders are marked pending when
// created/deleted, and that the sync layer can distinguish what needs to be pushed.
func TestFolderSyncStateTracking(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "folder_sync_state.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	// Save a folder — must be marked pending
	folder, err := app.SaveFolder(Folder{ID: "folder-sync-track", Name: "Track Me"})
	if err != nil {
		t.Fatalf("SaveFolder error: %v", err)
	}

	var syncState string
	if err := app.store.db.QueryRow("SELECT sync_state FROM folders WHERE id = ?", folder.ID).Scan(&syncState); err != nil {
		t.Fatalf("query folder sync_state error: %v", err)
	}
	if syncState != "pending" {
		t.Fatalf("new folder should be pending, got: %s", syncState)
	}

	// Simulate successful push — mark as clean
	_, _ = app.store.db.Exec("UPDATE folders SET sync_state = 'clean' WHERE id = ?", folder.ID)

	// Delete the folder — should be marked pending again
	if err := app.DeleteFolder(folder.ID); err != nil {
		t.Fatalf("DeleteFolder error: %v", err)
	}

	if err := app.store.db.QueryRow("SELECT sync_state FROM folders WHERE id = ?", folder.ID).Scan(&syncState); err != nil {
		t.Fatalf("query folder sync_state after delete error: %v", err)
	}
	if syncState != "pending" {
		t.Fatalf("deleted folder should be pending for sync, got: %s", syncState)
	}
}

func TestTagSyncAndCustomIconIntegrity(t *testing.T) {
	var pushedTag syncRemoteTag
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/healthz":
			w.WriteHeader(http.StatusNoContent)
		case r.Method == http.MethodGet && r.URL.Path == "/v1/folders":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode([]syncRemoteFolder{})
		case r.Method == http.MethodGet && r.URL.Path == "/v1/changes":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(syncChangesPage{Changes: []syncChange{}, NextCursor: "1", HasMore: false})
		case r.Method == http.MethodPut && strings.HasPrefix(r.URL.Path, "/v1/tags/"):
			if err := json.NewDecoder(r.Body).Decode(&pushedTag); err != nil {
				t.Fatalf("decode tag error: %v", err)
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(pushedTag)
		case r.Method == http.MethodGet && r.URL.Path == "/v1/tags":
			now := time.Now().UTC()
			remoteTags := []syncRemoteTag{
				{
					ID:        "tag-remoto-1",
					Name:      "Projetos",
					Icon:      "briefcase",
					CreatedAt: now,
					UpdatedAt: now,
				},
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(remoteTags)
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	app, err := NewApp(filepath.Join(t.TempDir(), "tagsync.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	// 1. Create a tag with custom icon
	tag, err := app.SaveTag(Tag{
		Name: "Urgente",
		Icon: "alert-circle",
	})
	if err != nil {
		t.Fatalf("SaveTag error: %v", err)
	}
	if tag.Icon != "alert-circle" {
		t.Fatalf("expected icon alert-circle, got: %s", tag.Icon)
	}

	// Verify pending state
	var syncState string
	if err := app.store.db.QueryRow("SELECT sync_state FROM tags WHERE id = ?", tag.ID).Scan(&syncState); err != nil {
		t.Fatalf("query tag sync_state error: %v", err)
	}
	if syncState != "pending" {
		t.Fatalf("expected tag sync_state pending, got: %s", syncState)
	}

	hashBefore, err := app.store.ComputeCanonicalStateHash()
	if err != nil || hashBefore == "" {
		t.Fatalf("ComputeCanonicalStateHash error: %v", err)
	}

	// 2. Perform sync
	result, err := app.store.syncNow(server.URL, "libsql://sync-test.turso.io", "test-token")
	if err != nil {
		t.Fatalf("syncNow error: %v", err)
	}
	_ = result

	// Verify local tag was pushed to API with custom icon
	if pushedTag.ID != tag.ID || pushedTag.Icon != "alert-circle" || pushedTag.Name != "Urgente" {
		t.Fatalf("pushed tag mismatch: %#v", pushedTag)
	}

	// Verify local tag transitioned to clean
	if err := app.store.db.QueryRow("SELECT sync_state FROM tags WHERE id = ?", tag.ID).Scan(&syncState); err != nil {
		t.Fatalf("query tag sync_state after sync error: %v", err)
	}
	if syncState != "clean" {
		t.Fatalf("expected tag sync_state clean after sync, got: %s", syncState)
	}

	// Verify remote tag with custom icon was pulled
	nav, err := app.ListNavigation()
	if err != nil {
		t.Fatalf("ListNavigation error: %v", err)
	}
	var foundRemote, foundLocal bool
	for _, navTag := range nav.Tags {
		if navTag.ID == "tag-remoto-1" {
			foundRemote = true
			if navTag.Icon != "briefcase" {
				t.Fatalf("expected remote tag icon briefcase, got: %s", navTag.Icon)
			}
		}
		if navTag.ID == tag.ID {
			foundLocal = true
			if navTag.Icon != "alert-circle" {
				t.Fatalf("expected local tag icon alert-circle, got: %s", navTag.Icon)
			}
		}
	}
	if !foundRemote || !foundLocal {
		t.Fatalf("expected both tags in navigation: foundRemote=%v, foundLocal=%v", foundRemote, foundLocal)
	}

	// 3. Delete tag and verify pending soft delete
	if err := app.DeleteTag(tag.ID); err != nil {
		t.Fatalf("DeleteTag error: %v", err)
	}
	var deletedAt sql.NullInt64
	if err := app.store.db.QueryRow("SELECT sync_state, deleted_at FROM tags WHERE id = ?", tag.ID).Scan(&syncState, &deletedAt); err != nil {
		t.Fatalf("query tag after delete error: %v", err)
	}
	if syncState != "pending" || !deletedAt.Valid {
		t.Fatalf("expected tag pending and deleted_at set after delete: state=%s, deletedAt=%v", syncState, deletedAt)
	}

	hashAfter, err := app.store.ComputeCanonicalStateHash()
	if err != nil {
		t.Fatalf("ComputeCanonicalStateHash error: %v", err)
	}
	if hashBefore == hashAfter {
		t.Fatal("canonical state hash did not change after tag deletion")
	}
}

