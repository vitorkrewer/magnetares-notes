package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

type SyncConflict struct {
	NoteID          string    `json:"noteId"`
	LocalTitle      string    `json:"localTitle"`
	LocalBodyText   string    `json:"localBodyText"`
	RemoteTitle     string    `json:"remoteTitle"`
	RemoteBodyText  string    `json:"remoteBodyText"`
	RemoteRevision  int64     `json:"remoteRevision"`
	RemoteUpdatedAt time.Time `json:"remoteUpdatedAt"`
	DetectedAt      time.Time `json:"detectedAt"`
}

func (s *noteStore) ListNoteConflicts() ([]SyncConflict, error) {
	rows, err := s.db.Query(`SELECT c.note_id, n.title, n.body_text, c.server_note_json,
		c.server_revision, c.detected_at
		FROM note_conflicts c JOIN notes n ON n.id = c.note_id ORDER BY c.detected_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("list note conflicts: %w", err)
	}
	defer rows.Close()

	conflicts := make([]SyncConflict, 0)
	for rows.Next() {
		var conflict SyncConflict
		var remoteJSON string
		var detectedAt int64
		if err := rows.Scan(&conflict.NoteID, &conflict.LocalTitle, &conflict.LocalBodyText, &remoteJSON, &conflict.RemoteRevision, &detectedAt); err != nil {
			return nil, err
		}
		var remote syncRemoteNote
		if err := json.Unmarshal([]byte(remoteJSON), &remote); err != nil {
			return nil, fmt.Errorf("decode conflict %s: %w", conflict.NoteID, err)
		}
		conflict.RemoteTitle = remote.Title
		conflict.RemoteBodyText = remote.BodyText
		conflict.RemoteUpdatedAt = remote.UpdatedAt
		conflict.DetectedAt = time.UnixMilli(detectedAt).UTC()
		conflicts = append(conflicts, conflict)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return conflicts, nil
}

func (s *noteStore) ResolveNoteConflict(noteID, resolution string) error {
	if resolution != "local" && resolution != "remote" && resolution != "merge" {
		return errors.New("resolução de conflito inválida")
	}

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("begin conflict resolution: %w", err)
	}
	defer tx.Rollback()

	var remoteJSON string
	if err := tx.QueryRow("SELECT server_note_json FROM note_conflicts WHERE note_id = ?", noteID).Scan(&remoteJSON); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return errors.New("conflito não encontrado")
		}
		return err
	}
	var remote syncRemoteNote
	if err := json.Unmarshal([]byte(remoteJSON), &remote); err != nil {
		return fmt.Errorf("decode conflict: %w", err)
	}

	now := time.Now().UTC().UnixMilli()
	if resolution == "local" {
		mutationID := uuid.NewString()
		result, err := tx.Exec(`UPDATE notes SET server_revision = ?, sync_state = 'pending',
			pending_mutation_id = ?, updated_at = ? WHERE id = ? AND sync_state = 'conflict'`,
			remote.Revision, mutationID, now, noteID)
		if err != nil {
			return err
		}
		affected, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if affected == 0 {
			return errors.New("nota local não está em conflito")
		}
		if _, err := tx.Exec("UPDATE sync_outbox SET status = 'pending' WHERE entity_id = ? AND status = 'conflict'", noteID); err != nil {
			return err
		}
	} else if resolution == "merge" {
		local, err := scanNote(tx.QueryRow(`SELECT `+noteSelectColumns+` FROM notes n WHERE n.id = ?`, noteID))
		if err != nil {
			return err
		}
		body, bodyText := mergeNoteBodies(local.Body, local.BodyText, remote.Body, remote.BodyText, remote.Title)
		mergedTags := mergeNoteTags(local.Tags, remote.Tags)
		checklistTotal, checklistOpen := countChecklistItems(body)
		folder := local.Folder
		if folder == "" {
			folder = remote.Folder
		}
		if folder == "" {
			folder = "Notas"
		}
		folderID := local.FolderID
		if folderID == "" {
			folderID = remote.FolderID
		}
		if folderID == "" {
			folderID = "folder-default"
		}
		var pinnedAt any
		if local.PinnedAt != nil {
			pinnedAt = local.PinnedAt.UnixMilli()
		} else if remote.PinnedAt != nil {
			pinnedAt = remote.PinnedAt.UnixMilli()
		}
		title := local.Title
		if title == "" {
			title = remote.Title
		}
		mutationID := uuid.NewString()
		result, err := tx.Exec(`UPDATE notes SET title = ?, body = ?, body_text = ?, folder = ?, folder_id = ?,
			pinned_at = ?, checklist_total = ?, checklist_open = ?, server_revision = ?, sync_state = 'pending',
			pending_mutation_id = ?, deleted_at = NULL, created_at = ?, updated_at = ?
			WHERE id = ? AND sync_state = 'conflict'`,
			title, body, bodyText, folder, folderID, pinnedAt, checklistTotal, checklistOpen, remote.Revision,
			mutationID, local.CreatedAt.UnixMilli(), now, noteID)
		if err != nil {
			return err
		}
		affected, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if affected == 0 {
			return errors.New("nota local não está em conflito")
		}
		if err := replaceNoteTagsTx(tx, noteID, mergedTags); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE sync_outbox SET status = 'pending' WHERE entity_id = ? AND status = 'conflict'", noteID); err != nil {
			return err
		}
	} else {
		folder := remote.Folder
		if folder == "" {
			folder = "Notas"
		}
		folderID := remote.FolderID
		if folderID == "" {
			folderID = "folder-default"
		}
		var pinnedAt any
		if remote.PinnedAt != nil {
			pinnedAt = remote.PinnedAt.UnixMilli()
		}
		var deletedAt any
		if remote.DeletedAt != nil {
			deletedAt = remote.DeletedAt.UnixMilli()
		}
		if _, err := tx.Exec(`UPDATE notes SET title = ?, body = ?, body_text = ?, folder = ?, folder_id = ?,
			pinned_at = ?, checklist_total = ?, checklist_open = ?, server_revision = ?, sync_state = 'clean',
			pending_mutation_id = NULL, deleted_at = ?, created_at = ?, updated_at = ? WHERE id = ?`,
			remote.Title, remote.Body, remote.BodyText, folder, folderID, pinnedAt, remote.ChecklistTotal,
			remote.ChecklistOpen, remote.Revision, deletedAt, remote.CreatedAt.UnixMilli(), remote.UpdatedAt.UnixMilli(), noteID); err != nil {
			return err
		}
		if err := replaceNoteTagsTx(tx, noteID, remote.Tags); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE sync_outbox SET status = 'applied' WHERE entity_id = ? AND status IN ('pending', 'sent', 'conflict')", noteID); err != nil {
			return err
		}
	}

	if _, err := tx.Exec("DELETE FROM note_conflicts WHERE note_id = ?", noteID); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit conflict resolution: %w", err)
	}
	return nil
}

func mergeNoteBodies(localBody, localText, remoteBody, remoteText, remoteTitle string) (string, string) {
	if localBody == "" {
		return remoteBody, remoteText
	}
	if remoteBody == "" {
		return localBody, localText
	}

	var localDocument, remoteDocument documentNode
	if json.Unmarshal([]byte(localBody), &localDocument) == nil && json.Unmarshal([]byte(remoteBody), &remoteDocument) == nil &&
		localDocument.Type == "doc" && remoteDocument.Type == "doc" {
		content := append([]documentNode{}, localDocument.Content...)
		content = append(content, documentNode{
			Type:    "paragraph",
			Content: []documentNode{{Type: "text", Text: mergeSectionLabel(remoteTitle)}},
		})
		content = append(content, remoteDocument.Content...)
		merged, err := json.Marshal(documentNode{Type: "doc", Content: content})
		if err == nil {
			return string(merged), mergeNoteText(localText, remoteText, remoteTitle)
		}
	}
	return localBody + "\n\n" + mergeSectionLabel(remoteTitle) + "\n\n" + remoteBody, mergeNoteText(localText, remoteText, remoteTitle)
}

func mergeSectionLabel(remoteTitle string) string {
	if remoteTitle == "" {
		return "--- Versão da nuvem ---"
	}
	return "--- Versão da nuvem: " + remoteTitle + " ---"
}

func mergeNoteText(localText, remoteText, remoteTitle string) string {
	if localText == "" {
		return remoteText
	}
	if remoteText == "" {
		return localText
	}
	return localText + "\n\n" + mergeSectionLabel(remoteTitle) + "\n\n" + remoteText
}

func mergeNoteTags(localTags, remoteTags []string) []string {
	merged := make([]string, 0, len(localTags)+len(remoteTags))
	seen := make(map[string]bool)
	for _, tag := range append(append([]string{}, localTags...), remoteTags...) {
		name, normalized := normalizeTagName(tag)
		if name == "" || seen[normalized] {
			continue
		}
		seen[normalized] = true
		merged = append(merged, name)
	}
	return merged
}

func replaceNoteTagsTx(tx *sql.Tx, noteID string, values []string) error {
	if _, err := tx.Exec("DELETE FROM note_tags WHERE note_id = ?", noteID); err != nil {
		return err
	}
	seen := make(map[string]bool)
	for _, value := range values {
		name, normalized := normalizeTagName(value)
		if name == "" || seen[normalized] {
			continue
		}
		seen[normalized] = true
		var tagID string
		err := tx.QueryRow("SELECT id FROM tags WHERE normalized_name = ?", normalized).Scan(&tagID)
		if errors.Is(err, sql.ErrNoRows) {
			tagID = uuid.NewString()
			_, err = tx.Exec("INSERT INTO tags(id, name, normalized_name, created_at) VALUES (?, ?, ?, ?)", tagID, name, normalized, time.Now().UTC().UnixMilli())
		}
		if err != nil {
			return err
		}
		if _, err := tx.Exec("INSERT INTO note_tags(note_id, tag_id) VALUES (?, ?)", noteID, tagID); err != nil {
			return err
		}
	}
	_, err := tx.Exec(`DELETE FROM tags
		WHERE managed = 0
		AND NOT EXISTS (SELECT 1 FROM note_tags WHERE note_tags.tag_id = tags.id)
		AND NOT EXISTS (SELECT 1 FROM smart_folders WHERE smart_folders.tag_id = tags.id)`)
	return err
}

func (a *App) ListNoteConflicts() ([]SyncConflict, error) {
	return a.store.ListNoteConflicts()
}

func (a *App) ResolveNoteConflict(noteID, resolution string) error {
	return a.store.ResolveNoteConflict(noteID, strings.TrimSpace(resolution))
}
