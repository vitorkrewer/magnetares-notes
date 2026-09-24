package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

type SyncResult struct {
	Uploaded   int    `json:"uploaded"`
	Downloaded int    `json:"downloaded"`
	Conflicts  int    `json:"conflicts"`
	Message    string `json:"message"`
	SyncedAt   string `json:"syncedAt"`
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

func isAPIReachable(apiURL string) bool {
	apiURL = strings.TrimRight(strings.TrimSpace(apiURL), "/")
	if apiURL == "" {
		return false
	}
	client := &http.Client{Timeout: 1500 * time.Millisecond}
	resp, err := client.Get(apiURL + "/healthz")
	if err != nil {
		return false
	}
	_ = resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 400
}

func (s *noteStore) syncNow(apiURL, tursoDatabaseURL, tursoAuthToken string) (SyncResult, error) {
	tursoDatabaseURL = strings.TrimSpace(tursoDatabaseURL)
	tursoAuthToken = strings.TrimSpace(tursoAuthToken)
	apiURL = strings.TrimRight(strings.TrimSpace(apiURL), "/")

	profileID, cursor, err := s.syncMetadataForTurso(tursoDatabaseURL)
	if err != nil {
		return SyncResult{}, fmt.Errorf("metadados locais: %w", err)
	}

	result := SyncResult{
		SyncedAt: time.Now().UTC().Format(time.RFC3339),
	}

	// 1. Se houver uma API em execução acessível, utiliza via API
	if apiURL != "" && isAPIReachable(apiURL) {
		return s.syncViaAPI(apiURL, profileID, cursor, tursoDatabaseURL, tursoAuthToken)
	}

	// 2. Caso contrário, se as credenciais do Turso estiverem configuradas, sincroniza diretamente com Turso HTTP pipeline
	if tursoDatabaseURL != "" && tursoAuthToken != "" {
		return s.syncDirectTurso(profileID, cursor, tursoDatabaseURL, tursoAuthToken)
	}

	if apiURL != "" {
		return s.syncViaAPI(apiURL, profileID, cursor, tursoDatabaseURL, tursoAuthToken)
	}

	return result, errors.New("nenhum método de sincronização configurado (informe a URL e token do Turso em Preferências)")
}

func (s *noteStore) syncViaAPI(apiURL, profileID, cursor, tursoDatabaseURL, tursoAuthToken string) (SyncResult, error) {
	result := SyncResult{
		SyncedAt: time.Now().UTC().Format(time.RFC3339),
	}
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
	result.Message = fmt.Sprintf("Sincronização concluída via API: %d enviadas, %d recebidas, %d conflitos.", result.Uploaded, result.Downloaded, result.Conflicts)
	return result, nil
}

func (s *noteStore) syncDirectTurso(profileID, cursor, tursoDatabaseURL, tursoAuthToken string) (SyncResult, error) {
	turso := NewTursoClient(tursoDatabaseURL, tursoAuthToken)
	if turso == nil {
		return SyncResult{}, errors.New("configuração inválida do Turso")
	}

	if err := turso.InitSchema(); err != nil {
		return SyncResult{}, fmt.Errorf("falha ao conectar ao Turso: %w", err)
	}

	result := SyncResult{
		SyncedAt: time.Now().UTC().Format(time.RFC3339),
	}

	pending, err := s.pendingSyncNotes()
	if err != nil {
		return result, err
	}

	for _, note := range pending {
		if err := s.pushPendingNoteDirect(turso, profileID, note, &result); err != nil {
			return result, err
		}
	}

	// Pull remote changes
	intCursor, _ := strconv.ParseInt(cursor, 10, 64)
	for {
		_, rows, err := turso.Query(`SELECT c.cursor, n.id, n.title, n.body, n.body_text, n.revision, n.deleted_at, n.created_at, n.updated_at
			FROM sync_note_changes c JOIN sync_notes n ON n.user_id = c.user_id AND n.id = c.note_id
			WHERE c.user_id = ? AND c.cursor > ? ORDER BY c.cursor ASC LIMIT 201`, profileID, intCursor)
		if err != nil {
			return result, fmt.Errorf("buscar alterações no Turso: %w", err)
		}

		hasMore := false
		if len(rows) > 200 {
			hasMore = true
			rows = rows[:200]
		}

		for _, row := range rows {
			changeCursor, err := tursoInt(row[0])
			if err != nil {
				return result, err
			}
			remote, err := syncRemoteNoteFromRow(row[1:])
			if err != nil {
				return result, err
			}
			conflict, err := s.applyRemoteNote(remote)
			if err != nil {
				return result, err
			}
			if conflict {
				result.Conflicts++
			} else {
				result.Downloaded++
			}
			intCursor = changeCursor
		}

		cursor = strconv.FormatInt(intCursor, 10)
		if err := s.setPullCursor(cursor); err != nil {
			return result, err
		}

		if !hasMore {
			break
		}
	}

	result.Message = fmt.Sprintf("Sincronização concluída com Turso: %d enviadas, %d recebidas, %d conflitos.", result.Uploaded, result.Downloaded, result.Conflicts)
	return result, nil
}

func (s *noteStore) pushPendingNoteDirect(turso *TursoClient, profileID string, note pendingSyncNote, result *SyncResult) error {
	_, mRows, err := turso.Query(`SELECT cursor, revision FROM sync_mutations WHERE user_id = ? AND mutation_id = ?`, profileID, note.MutationID)
	if err == nil && len(mRows) > 0 {
		remote, found, _ := s.remoteNoteFromTurso(turso, profileID, note.ID)
		if found {
			_ = s.markMutationClean(note.ID, note.MutationID, remote)
			result.Uploaded++
			return nil
		}
	}

	existing, found, err := s.remoteNoteFromTurso(turso, profileID, note.ID)
	if err != nil {
		return err
	}

	if (found && existing.Revision != note.ServerRev) || (!found && note.ServerRev != 0) {
		return s.recordConflict(note.ID, note.MutationID, existing)
	}

	now := time.Now().UTC()
	nextRevision := int64(1)
	createdAt := now
	if found {
		nextRevision = existing.Revision + 1
		createdAt = existing.CreatedAt
	}

	var deletedAtMilli any = nil
	if note.DeletedAt != nil {
		deletedAtMilli = note.DeletedAt.UnixMilli()
	}

	remoteNote := syncRemoteNote{
		ID:        note.ID,
		Title:     note.Title,
		Body:      note.Body,
		BodyText:  note.BodyText,
		Revision:  nextRevision,
		DeletedAt: note.DeletedAt,
		CreatedAt: createdAt,
		UpdatedAt: now,
	}

	if note.DeletedAt != nil {
		if err := turso.Execute(`UPDATE sync_notes SET revision = ?, deleted_at = ?, updated_at = ?
			WHERE user_id = ? AND id = ?`, nextRevision, deletedAtMilli, now.UnixMilli(), profileID, note.ID); err != nil {
			return err
		}
	} else {
		if err := turso.Execute(`INSERT INTO sync_notes(user_id, id, title, body, body_text, revision, deleted_at, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
			ON CONFLICT(user_id, id) DO UPDATE SET title = excluded.title, body = excluded.body, body_text = excluded.body_text,
			revision = excluded.revision, deleted_at = NULL, updated_at = excluded.updated_at`,
			profileID, note.ID, note.Title, note.Body, note.BodyText, nextRevision, createdAt.UnixMilli(), now.UnixMilli()); err != nil {
			return err
		}
	}

	if err := turso.Execute(`INSERT INTO sync_note_changes(user_id, note_id, revision, changed_at) VALUES (?, ?, ?, ?)`, profileID, note.ID, nextRevision, now.UnixMilli()); err != nil {
		return err
	}

	_, cRows, err := turso.Query(`SELECT cursor FROM sync_note_changes WHERE user_id = ? AND note_id = ? AND revision = ? ORDER BY cursor DESC LIMIT 1`, profileID, note.ID, nextRevision)
	if err != nil || len(cRows) == 0 {
		return fmt.Errorf("ler cursor de sync: %w", err)
	}
	cursor, err := tursoInt(cRows[0][0])
	if err != nil {
		return err
	}

	if err := turso.Execute(`INSERT INTO sync_mutations(user_id, mutation_id, note_id, revision, cursor) VALUES (?, ?, ?, ?, ?)`, profileID, note.MutationID, note.ID, nextRevision, cursor); err != nil {
		return err
	}

	if err := s.markMutationClean(note.ID, note.MutationID, remoteNote); err != nil {
		return err
	}
	result.Uploaded++
	return nil
}

func (s *noteStore) remoteNoteFromTurso(turso *TursoClient, profileID, id string) (syncRemoteNote, bool, error) {
	_, rows, err := turso.Query(`SELECT id, title, body, body_text, revision, deleted_at, created_at, updated_at
		FROM sync_notes WHERE user_id = ? AND id = ?`, profileID, id)
	if err != nil {
		return syncRemoteNote{}, false, err
	}
	if len(rows) == 0 {
		return syncRemoteNote{}, false, nil
	}
	note, err := syncRemoteNoteFromRow(rows[0])
	return note, true, err
}

func syncRemoteNoteFromRow(row []TursoValue) (syncRemoteNote, error) {
	if len(row) < 8 {
		return syncRemoteNote{}, errors.New("linha remota inválida")
	}
	revision, err := tursoInt(row[4])
	if err != nil {
		return syncRemoteNote{}, err
	}
	createdAt, err := tursoTime(row[6])
	if err != nil {
		return syncRemoteNote{}, err
	}
	updatedAt, err := tursoTime(row[7])
	if err != nil {
		return syncRemoteNote{}, err
	}

	var deletedAt *time.Time
	if row[5].Type != "null" && row[5].Value != "" {
		dTime, err := tursoTime(row[5])
		if err == nil {
			deletedAt = &dTime
		}
	}

	return syncRemoteNote{
		ID:        row[0].Value,
		Title:     row[1].Value,
		Body:      row[2].Value,
		BodyText:  row[3].Value,
		Revision:  revision,
		DeletedAt: deletedAt,
		CreatedAt: createdAt,
		UpdatedAt: updatedAt,
	}, nil
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

	type rawItem struct {
		item            pendingSyncNote
		needsMutationID bool
	}
	var rawList []rawItem

	for rows.Next() {
		var item pendingSyncNote
		var deletedAt sql.NullInt64
		var createdAt, updatedAt int64
		if err := rows.Scan(&item.ID, &item.Title, &item.Body, &item.BodyText, &item.ServerRev, &deletedAt, &createdAt, &updatedAt, &item.MutationID); err != nil {
			_ = rows.Close()
			return nil, err
		}
		item.CreatedAt = time.UnixMilli(createdAt).UTC()
		item.UpdatedAt = time.UnixMilli(updatedAt).UTC()
		if deletedAt.Valid {
			value := time.UnixMilli(deletedAt.Int64).UTC()
			item.DeletedAt = &value
		}
		needs := false
		if item.MutationID == "" {
			item.MutationID = uuid.NewString()
			needs = true
		}
		rawList = append(rawList, rawItem{item: item, needsMutationID: needs})
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return nil, err
	}
	_ = rows.Close()

	pending := make([]pendingSyncNote, 0, len(rawList))
	for _, raw := range rawList {
		if raw.needsMutationID {
			if _, err := s.db.Exec("UPDATE notes SET pending_mutation_id = ? WHERE id = ?", raw.item.MutationID, raw.item.ID); err != nil {
				return nil, err
			}
		}
		pending = append(pending, raw.item)
	}
	return pending, nil
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
		return fmt.Errorf("sync push falhou com status %d: %s", status, string(body))
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
	client := &http.Client{Timeout: 8 * time.Second}
	response, err := client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(response.Body)
	return response.StatusCode, responseBody, err
}
