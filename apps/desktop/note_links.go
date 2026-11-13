package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// ExtractedNoteLink representa uma referência interna extraída do conteúdo estruturado de uma nota.
type ExtractedNoteLink struct {
	TargetNoteID string `json:"targetNoteId"`
	Label        string `json:"label"`
}

// ConnectionNoteItem representa um nó de nota leve para o grafo global de Conexões.
type ConnectionNoteItem struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	NoteType  string   `json:"noteType"`
	Language  string   `json:"language"`
	FolderID  string   `json:"folderId"`
	Folder    string   `json:"folder"`
	Pinned    bool     `json:"pinned"`
	Tags      []string `json:"tags"`
	UpdatedAt string   `json:"updatedAt"`
}

// ConnectionNoteLink representa um vínculo direcionado entre duas notas no grafo.
type ConnectionNoteLink struct {
	SourceNoteID string `json:"sourceNoteId"`
	TargetNoteID string `json:"targetNoteId"`
	Label        string `json:"label"`
}

// ConnectionTagItem representa um hub de etiqueta no grafo de Conexões.
type ConnectionTagItem struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	NormalizedName string `json:"normalizedName"`
	Icon           string `json:"icon"`
	NoteCount      int    `json:"noteCount"`
}

// ConnectionsGraphPayload reúne notas ativas, vínculos entre notas, etiquetas e pastas para o grafo.
type ConnectionsGraphPayload struct {
	Notes   []ConnectionNoteItem `json:"notes"`
	Links   []ConnectionNoteLink `json:"links"`
	Tags    []ConnectionTagItem  `json:"tags"`
	Folders []Folder             `json:"folders"`
}

// NoteConnectionSummary resume uma conexão direta de entrada ou saída de uma nota.
type NoteConnectionSummary struct {
	NoteID    string `json:"noteId"`
	Title     string `json:"title"`
	Folder    string `json:"folder"`
	NoteType  string `json:"noteType"`
	Direction string `json:"direction"`
}

// extractNoteLinks percorre a árvore JSON do editor estruturado em busca de nós "noteLink".
func extractNoteLinks(body string) []ExtractedNoteLink {
	if strings.TrimSpace(body) == "" || !strings.Contains(body, `"noteLink"`) {
		return nil
	}

	var document documentNode
	if err := json.Unmarshal([]byte(body), &document); err != nil {
		return nil
	}

	seen := make(map[string]struct{})
	links := make([]ExtractedNoteLink, 0)

	var walk func(documentNode)
	walk = func(node documentNode) {
		if node.Type == "noteLink" && node.Attrs != nil {
			targetID, _ := node.Attrs["noteId"].(string)
			targetID = strings.TrimSpace(targetID)
			if targetID != "" {
				if _, exists := seen[targetID]; !exists {
					seen[targetID] = struct{}{}
					label, _ := node.Attrs["title"].(string)
					links = append(links, ExtractedNoteLink{
						TargetNoteID: targetID,
						Label:        strings.TrimSpace(label),
					})
				}
			}
		}
		for _, child := range node.Content {
			walk(child)
		}
	}
	walk(document)
	return links
}

func replaceNoteLinksTx(tx *sql.Tx, sourceNoteID string, links []ExtractedNoteLink) error {
	if _, err := tx.Exec(`DELETE FROM note_links WHERE source_note_id = ?`, sourceNoteID); err != nil {
		return fmt.Errorf("clear note links: %w", err)
	}
	if len(links) == 0 {
		return nil
	}

	now := time.Now().UTC().UnixMilli()
	for _, link := range links {
		targetID := strings.TrimSpace(link.TargetNoteID)
		if targetID == "" || targetID == sourceNoteID {
			continue
		}
		var exists int
		if err := tx.QueryRow(`SELECT 1 FROM notes WHERE id = ?`, targetID).Scan(&exists); err != nil {
			continue
		}
		if _, err := tx.Exec(
			`INSERT INTO note_links(source_note_id, target_note_id, label, created_at)
			 VALUES (?, ?, ?, ?)
			 ON CONFLICT(source_note_id, target_note_id) DO UPDATE SET label = excluded.label`,
			sourceNoteID, targetID, link.Label, now,
		); err != nil {
			return fmt.Errorf("insert note link: %w", err)
		}
	}
	return nil
}

func (s *noteStore) syncNoteLinksFromBody(sourceNoteID, body string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if err := replaceNoteLinksTx(tx, sourceNoteID, extractNoteLinks(body)); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *noteStore) getConnectionsGraph() (ConnectionsGraphPayload, error) {
	payload := ConnectionsGraphPayload{
		Notes:   make([]ConnectionNoteItem, 0),
		Links:   make([]ConnectionNoteLink, 0),
		Tags:    make([]ConnectionTagItem, 0),
		Folders: make([]Folder, 0),
	}

	noteRows, err := s.db.Query(`SELECT n.id, n.title, n.note_type, n.language, n.folder_id, n.folder,
		n.pinned_at IS NOT NULL, n.updated_at,
		COALESCE((SELECT group_concat(name, char(31)) FROM (
			SELECT t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
			WHERE nt.note_id = n.id AND t.deleted_at IS NULL ORDER BY t.normalized_name
		)), '')
		FROM notes n
		WHERE n.deleted_at IS NULL
		ORDER BY n.updated_at DESC`)
	if err != nil {
		return payload, fmt.Errorf("list graph notes: %w", err)
	}
	for noteRows.Next() {
		var item ConnectionNoteItem
		var updatedMilli int64
		var tagsRaw string
		if err := noteRows.Scan(
			&item.ID, &item.Title, &item.NoteType, &item.Language,
			&item.FolderID, &item.Folder, &item.Pinned, &updatedMilli, &tagsRaw,
		); err != nil {
			_ = noteRows.Close()
			return payload, fmt.Errorf("scan graph note: %w", err)
		}
		if tagsRaw == "" {
			item.Tags = make([]string, 0)
		} else {
			item.Tags = strings.Split(tagsRaw, string(rune(31)))
		}
		item.UpdatedAt = time.UnixMilli(updatedMilli).UTC().Format(time.RFC3339)
		payload.Notes = append(payload.Notes, item)
	}
	if err := noteRows.Err(); err != nil {
		_ = noteRows.Close()
		return payload, fmt.Errorf("read graph notes: %w", err)
	}
	_ = noteRows.Close()

	linkRows, err := s.db.Query(`SELECT l.source_note_id, l.target_note_id, l.label
		FROM note_links l
		JOIN notes src ON src.id = l.source_note_id AND src.deleted_at IS NULL
		JOIN notes dst ON dst.id = l.target_note_id AND dst.deleted_at IS NULL
		ORDER BY l.created_at ASC`)
	if err != nil {
		return payload, fmt.Errorf("list graph links: %w", err)
	}
	for linkRows.Next() {
		var link ConnectionNoteLink
		if err := linkRows.Scan(&link.SourceNoteID, &link.TargetNoteID, &link.Label); err != nil {
			_ = linkRows.Close()
			return payload, fmt.Errorf("scan graph link: %w", err)
		}
		payload.Links = append(payload.Links, link)
	}
	if err := linkRows.Err(); err != nil {
		_ = linkRows.Close()
		return payload, fmt.Errorf("read graph links: %w", err)
	}
	_ = linkRows.Close()

	tagRows, err := s.db.Query(`SELECT t.id, t.name, t.normalized_name, COALESCE(t.icon, 'tag'), COUNT(n.id)
		FROM tags t
		LEFT JOIN note_tags nt ON nt.tag_id = t.id
		LEFT JOIN notes n ON n.id = nt.note_id AND n.deleted_at IS NULL
		WHERE t.deleted_at IS NULL
		GROUP BY t.id, t.name, t.normalized_name, t.icon
		ORDER BY t.normalized_name`)
	if err != nil {
		return payload, fmt.Errorf("list graph tags: %w", err)
	}
	for tagRows.Next() {
		var tag ConnectionTagItem
		if err := tagRows.Scan(&tag.ID, &tag.Name, &tag.NormalizedName, &tag.Icon, &tag.NoteCount); err != nil {
			_ = tagRows.Close()
			return payload, fmt.Errorf("scan graph tag: %w", err)
		}
		payload.Tags = append(payload.Tags, tag)
	}
	if err := tagRows.Err(); err != nil {
		_ = tagRows.Close()
		return payload, fmt.Errorf("read graph tags: %w", err)
	}
	_ = tagRows.Close()

	folderRows, err := s.db.Query(`SELECT f.id, f.name, f.parent_id, COALESCE(f.color, ''), COALESCE(f.icon, ''), COUNT(n.id)
		FROM folders f
		LEFT JOIN notes n ON n.folder_id = f.id AND n.deleted_at IS NULL
		WHERE f.deleted_at IS NULL
		GROUP BY f.id, f.name, f.parent_id, f.color, f.icon
		ORDER BY f.parent_id IS NOT NULL, f.name COLLATE NOCASE`)
	if err != nil {
		return payload, fmt.Errorf("list graph folders: %w", err)
	}
	for folderRows.Next() {
		var folder Folder
		var parentID sql.NullString
		if err := folderRows.Scan(&folder.ID, &folder.Name, &parentID, &folder.Color, &folder.Icon, &folder.NoteCount); err != nil {
			_ = folderRows.Close()
			return payload, fmt.Errorf("scan graph folder: %w", err)
		}
		if parentID.Valid {
			folder.ParentID = &parentID.String
		}
		payload.Folders = append(payload.Folders, folder)
	}
	if err := folderRows.Err(); err != nil {
		_ = folderRows.Close()
		return payload, fmt.Errorf("read graph folders: %w", err)
	}
	_ = folderRows.Close()

	return payload, nil
}

func (s *noteStore) getNoteConnections(noteID string) ([]NoteConnectionSummary, error) {
	noteID = strings.TrimSpace(noteID)
	if noteID == "" {
		return make([]NoteConnectionSummary, 0), nil
	}

	items := make([]NoteConnectionSummary, 0)

	rows, err := s.db.Query(`
		SELECT n.id, n.title, n.folder, n.note_type, 'outgoing' AS direction
		FROM note_links l
		JOIN notes n ON n.id = l.target_note_id AND n.deleted_at IS NULL
		WHERE l.source_note_id = ?
		UNION ALL
		SELECT n.id, n.title, n.folder, n.note_type, 'incoming' AS direction
		FROM note_links l
		JOIN notes n ON n.id = l.source_note_id AND n.deleted_at IS NULL
		WHERE l.target_note_id = ?
		ORDER BY direction DESC, title COLLATE NOCASE ASC`, noteID, noteID)
	if err != nil {
		return nil, fmt.Errorf("query note connections: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var summary NoteConnectionSummary
		if err := rows.Scan(&summary.NoteID, &summary.Title, &summary.Folder, &summary.NoteType, &summary.Direction); err != nil {
			return nil, fmt.Errorf("scan note connection: %w", err)
		}
		items = append(items, summary)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read note connections: %w", err)
	}

	return items, nil
}

