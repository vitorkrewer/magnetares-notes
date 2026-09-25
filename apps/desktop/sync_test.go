package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
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
