package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

type SyncResult struct {
	Uploaded   int `json:"uploaded"`
	Downloaded int `json:"downloaded"`
	Conflicts  int `json:"conflicts"`
}

type syncRemoteNote struct {
	ID        string     `json:"id"`
	Title     string     `json:"title"`
	Body      string     `json:"body"`
	BodyText  string     `json:"bodyText"`
	Revision  int64      `json:"revision"`
	DeletedAt *time.Time `json:"deletedAt"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

type syncMutationResult struct {
	Note   syncRemoteNote `json:"note"`
	Cursor string         `json:"cursor"`
}

type syncConflict struct {
	Code   string         `json:"code"`
	Note   syncRemoteNote `json:"note"`
	Cursor string         `json:"cursor"`
}

type syncChange struct {
	Cursor string         `json:"cursor"`
	Note   syncRemoteNote `json:"note"`
}

type syncChangesPage struct {
	Changes    []syncChange `json:"changes"`
	NextCursor string       `json:"nextCursor"`
	HasMore    bool         `json:"hasMore"`
}

type pendingSyncNote struct {
	ID         string
	Title      string
	Body       string
	BodyText   string
	ServerRev  int64
	DeletedAt  *time.Time
	CreatedAt  time.Time
	UpdatedAt  time.Time
	MutationID string
}

func (s *noteStore) syncNow(apiURL, tursoDatabaseURL, tursoAuthToken string) (SyncResult, error) {
	apiURL = strings.TrimRight(strings.TrimSpace(apiURL), "/")
	if apiURL == "" {
		return SyncResult{}, errors.New("endereço da API de sincronização não configurado")
	}

	profileID, cursor, err := s.syncMetadataForTurso(tursoDatabaseURL)
	if err != nil {
		return SyncResult{}, err
	}
	result := SyncResult{}
	pending, err := s.pendingSyncNotes()
	if err != nil {
		return result, err
	}

	for _, note := range pending {
		if err := s.pushPendingNote(apiURL, profileID, tursoDatabaseURL, tursoAuthToken, note, &result); err != nil {
			return result, err
		}
	}

	for {
		page, err := requestSyncJSON[syncChangesPage](http.MethodGet, fmt.Sprintf("%s/v1/changes?cursor=%s&limit=200", apiURL, cursor), profileID, tursoDatabaseURL, tursoAuthToken, nil)
		if err != nil {
			return result, err
		}
		for _, change := range page.Changes {
			conflict, err := s.applyRemoteNote(change.Note)
			if err != nil {
				return result, err
			}
			if conflict {
				result.Conflicts++
			} else {
				result.Downloaded++
			}
		}
		cursor = page.NextCursor
		if err := s.setPullCursor(cursor); err != nil {
			return result, err
		}
		if !page.HasMore {
			break
		}
	}
	return result, nil
}

func (s *noteStore) syncMetadata() (string, string, error) {
	return s.syncMetadataForTurso("")
}

func (s *noteStore) syncMetadataForTurso(tursoDatabaseURL string) (string, string, error) {
	var profileID, cursor string
	if err := s.db.QueryRow("SELECT sync_profile_id, pull_cursor FROM sync_metadata WHERE singleton = 1").Scan(&profileID, &cursor); err != nil {
		return "", "", fmt.Errorf("read sync metadata: %w", err)
	}
	derivedProfileID := profileID
	if tursoDatabaseURL != "" {
		derivedProfileID = uuid.NewSHA1(uuid.NameSpaceURL, []byte(strings.ToLower(strings.TrimSpace(tursoDatabaseURL)))).String()
	}
	if derivedProfileID == "" {
		derivedProfileID = uuid.NewString()
	}
	if profileID != derivedProfileID {
		profileID = derivedProfileID
		cursor = "0"
		if _, err := s.db.Exec("UPDATE sync_metadata SET sync_profile_id = ?, pull_cursor = ? WHERE singleton = 1", profileID, cursor); err != nil {
			return "", "", fmt.Errorf("create sync profile: %w", err)
		}
	}
	return profileID, cursor, nil
}

func (s *noteStore) setPullCursor(cursor string) error {
	_, err := s.db.Exec("UPDATE sync_metadata SET pull_cursor = ? WHERE singleton = 1", cursor)
	return err
}

func (s *noteStore) pendingSyncNotes() ([]pendingSyncNote, error) {
	rows, err := s.db.Query(`SELECT id, title, body, body_text, server_revision, deleted_at, created_at, updated_at,
		COALESCE(pending_mutation_id, '') FROM notes WHERE sync_state = 'pending' ORDER BY updated_at ASC`)
	if err != nil {
		return nil, fmt.Errorf("list pending sync notes: %w", err)
	}
	defer rows.Close()

	pending := make([]pendingSyncNote, 0)
	for rows.Next() {
		var item pendingSyncNote
		var deletedAt sql.NullInt64
		var createdAt, updatedAt int64
		if err := rows.Scan(&item.ID, &item.Title, &item.Body, &item.BodyText, &item.ServerRev, &deletedAt, &createdAt, &updatedAt, &item.MutationID); err != nil {
			return nil, err
		}
		item.CreatedAt = time.UnixMilli(createdAt).UTC()
		item.UpdatedAt = time.UnixMilli(updatedAt).UTC()
		if deletedAt.Valid {
			value := time.UnixMilli(deletedAt.Int64).UTC()
			item.DeletedAt = &value
		}
		if item.MutationID == "" {
			item.MutationID = uuid.NewString()
			if _, err := s.db.Exec("UPDATE notes SET pending_mutation_id = ? WHERE id = ?", item.MutationID, item.ID); err != nil {
				return nil, err
			}
		}
		pending = append(pending, item)
	}
	return pending, rows.Err()
}

func (s *noteStore) pushPendingNote(apiURL, profileID, tursoDatabaseURL, tursoAuthToken string, note pendingSyncNote, result *SyncResult) error {
	var method, url string
	var payload any
	if note.DeletedAt != nil {
		method = http.MethodDelete
		url = fmt.Sprintf("%s/v1/notes/%s", apiURL, note.ID)
		payload = map[string]any{"baseRevision": note.ServerRev, "mutationId": note.MutationID}
	} else {
		method = http.MethodPut
		url = fmt.Sprintf("%s/v1/notes/%s", apiURL, note.ID)
		payload = map[string]any{
			"baseRevision": note.ServerRev,
			"mutationId":   note.MutationID,
			"note": map[string]string{
				"title": note.Title, "body": note.Body, "bodyText": note.BodyText,
			},
		}
	}

	status, body, err := requestSyncRaw(method, url, profileID, tursoDatabaseURL, tursoAuthToken, payload)
	if err != nil {
		return err
	}
	if status == http.StatusConflict {
		var conflict syncConflict
		if err := json.Unmarshal(body, &conflict); err != nil {
			return err
		}
		return s.recordConflict(note.ID, note.MutationID, conflict.Note)
	}
	if status < 200 || status >= 300 {
		return fmt.Errorf("sync push failed with status %d: %s", status, string(body))
	}
	var mutation syncMutationResult
	if err := json.Unmarshal(body, &mutation); err != nil {
		return err
	}
	if err := s.markMutationClean(note.ID, note.MutationID, mutation.Note); err != nil {
		return err
	}
	result.Uploaded++
	return nil
}

func (s *noteStore) markMutationClean(noteID, mutationID string, remote syncRemoteNote) error {
	var deletedAt any
	if remote.DeletedAt != nil {
		deletedAt = remote.DeletedAt.UnixMilli()
	}
	_, err := s.db.Exec(`UPDATE notes SET server_revision = ?, sync_state = 'clean', pending_mutation_id = NULL,
		deleted_at = ?, created_at = ?, updated_at = ?
		WHERE id = ? AND pending_mutation_id = ?`, remote.Revision, deletedAt, remote.CreatedAt.UnixMilli(), remote.UpdatedAt.UnixMilli(), noteID, mutationID)
	return err
}

func (s *noteStore) recordConflict(noteID, mutationID string, remote syncRemoteNote) error {
	remoteJSON, err := json.Marshal(remote)
	if err != nil {
		return err
	}
	if _, err := s.db.Exec(`INSERT INTO note_conflicts(note_id, server_note_json, server_revision, detected_at)
		VALUES (?, ?, ?, ?) ON CONFLICT(note_id) DO UPDATE SET server_note_json = excluded.server_note_json,
		server_revision = excluded.server_revision, detected_at = excluded.detected_at`, noteID, string(remoteJSON), remote.Revision, time.Now().UTC().UnixMilli()); err != nil {
		return err
	}
	_, err = s.db.Exec("UPDATE notes SET sync_state = 'conflict' WHERE id = ? AND pending_mutation_id = ?", noteID, mutationID)
	return err
}

func (s *noteStore) applyRemoteNote(remote syncRemoteNote) (bool, error) {
	var state, pendingID string
	var localServerRevision int64
	err := s.db.QueryRow("SELECT sync_state, COALESCE(pending_mutation_id, ''), server_revision FROM notes WHERE id = ?", remote.ID).Scan(&state, &pendingID, &localServerRevision)
	if err == nil && state == "pending" && localServerRevision < remote.Revision {
		return true, s.recordConflict(remote.ID, pendingID, remote)
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return false, err
	}

	var deletedAt any
	if remote.DeletedAt != nil {
		deletedAt = remote.DeletedAt.UnixMilli()
	}
	_, err = s.db.Exec(`INSERT INTO notes(id, title, body, body_text, folder, folder_id, revision, server_revision,
		checklist_total, checklist_open, sync_state, pending_mutation_id, deleted_at, created_at, updated_at)
		VALUES (?, ?, ?, ?, 'Notas', 'folder-default', 1, ?, 0, 0, 'clean', NULL, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET title = excluded.title, body = excluded.body, body_text = excluded.body_text,
		server_revision = excluded.server_revision, sync_state = 'clean', pending_mutation_id = NULL,
		deleted_at = excluded.deleted_at, created_at = excluded.created_at, updated_at = excluded.updated_at`,
		remote.ID, remote.Title, remote.Body, remote.BodyText, remote.Revision, deletedAt, remote.CreatedAt.UnixMilli(), remote.UpdatedAt.UnixMilli())
	return false, err
}

func requestSyncJSON[T any](method, url, profileID, tursoDatabaseURL, tursoAuthToken string, body any) (T, error) {
	var result T
	status, response, err := requestSyncRaw(method, url, profileID, tursoDatabaseURL, tursoAuthToken, body)
	if err != nil {
		return result, err
	}
	if status < 200 || status >= 300 {
		return result, fmt.Errorf("sync request failed with status %d: %s", status, string(response))
	}
	if err := json.Unmarshal(response, &result); err != nil {
		return result, err
	}
	return result, nil
}

func requestSyncRaw(method, url, profileID, tursoDatabaseURL, tursoAuthToken string, body any) (int, []byte, error) {
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return 0, nil, err
		}
		reader = bytes.NewReader(payload)
	}
	req, err := http.NewRequest(method, url, reader)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("X-Magnetares-Profile", profileID)
	req.Header.Set("X-Magnetares-Turso-URL", tursoDatabaseURL)
	req.Header.Set("X-Magnetares-Turso-Token", tursoAuthToken)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	client := &http.Client{Timeout: 15 * time.Second}
	response, err := client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(response.Body)
	return response.StatusCode, responseBody, err
}
