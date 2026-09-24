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
		case r.Method == http.MethodPut:
			var mutation struct {
				Note struct {
					Title    string `json:"title"`
					Body     string `json:"body"`
					BodyText string `json:"bodyText"`
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
					Revision:  1,
					CreatedAt: time.Now().UTC(),
					UpdatedAt: time.Now().UTC(),
				},
				Cursor: "1",
			})
		case r.Method == http.MethodGet:
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(syncChangesPage{Changes: []syncChange{}, NextCursor: "1", HasMore: false})
		default:
			t.Fatal("unexpected request")
		}
	}))
	defer server.Close()

	app, err := NewApp(filepath.Join(t.TempDir(), "sync.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	if _, err := app.SaveNote(Note{ID: "00000000-0000-4000-8000-000000000001", Title: "Offline", Body: `{"type":"doc","content":[{"type":"paragraph"}]}`, BodyText: "Offline", Folder: "Notas"}); err != nil {
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
