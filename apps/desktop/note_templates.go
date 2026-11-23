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

// NoteTemplate representa um modelo reutilizável de nota salvo pelo usuário no SQLite local.
type NoteTemplate struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	Category     string   `json:"category"`
	Icon         string   `json:"icon"`
	DefaultTitle string   `json:"defaultTitle"`
	Body         string   `json:"body"`
	Tags         []string `json:"tags"`
	CreatedAt    string   `json:"createdAt"`
	UpdatedAt    string   `json:"updatedAt"`
}

func sanitizeTemplateTags(raw []string) []string {
	seen := make(map[string]struct{}, len(raw))
	out := make([]string, 0, len(raw))
	for _, t := range raw {
		clean := strings.TrimSpace(strings.TrimPrefix(t, "#"))
		if clean == "" {
			continue
		}
		key := strings.ToLower(clean)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, clean)
	}
	return out
}

func (s *noteStore) listNoteTemplates() ([]NoteTemplate, error) {
	rows, err := s.db.Query(`
		SELECT id, name, description, category, icon, default_title, body, tags, created_at, updated_at
		FROM note_templates
		ORDER BY updated_at DESC, name COLLATE NOCASE ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("list note templates: %w", err)
	}
	defer rows.Close()

	templates := make([]NoteTemplate, 0)
	for rows.Next() {
		var tpl NoteTemplate
		var tagsJSON string
		if err := rows.Scan(
			&tpl.ID,
			&tpl.Name,
			&tpl.Description,
			&tpl.Category,
			&tpl.Icon,
			&tpl.DefaultTitle,
			&tpl.Body,
			&tagsJSON,
			&tpl.CreatedAt,
			&tpl.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan note template: %w", err)
		}
		if tagsJSON != "" {
			_ = json.Unmarshal([]byte(tagsJSON), &tpl.Tags)
		}
		if tpl.Tags == nil {
			tpl.Tags = []string{}
		}
		templates = append(templates, tpl)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate note templates: %w", err)
	}
	return templates, nil
}

func (s *noteStore) saveNoteTemplate(tpl NoteTemplate) (NoteTemplate, error) {
	tpl.Name = strings.TrimSpace(tpl.Name)
	if tpl.Name == "" {
		return NoteTemplate{}, errors.New("o nome do template é obrigatório")
	}

	tpl.Description = strings.TrimSpace(tpl.Description)
	tpl.Category = strings.TrimSpace(tpl.Category)
	if tpl.Category == "" {
		tpl.Category = "custom"
	}
	tpl.Icon = strings.TrimSpace(tpl.Icon)
	if tpl.Icon == "" {
		tpl.Icon = "file-text"
	}
	tpl.DefaultTitle = strings.TrimSpace(tpl.DefaultTitle)
	tpl.Tags = sanitizeTemplateTags(tpl.Tags)

	now := time.Now().UTC().Format(time.RFC3339Nano)
	if strings.TrimSpace(tpl.ID) == "" {
		tpl.ID = "tpl-" + uuid.NewString()
	}

	var existingCreatedAt string
	err := s.db.QueryRow(`SELECT created_at FROM note_templates WHERE id = ?`, tpl.ID).Scan(&existingCreatedAt)
	if err == nil && existingCreatedAt != "" {
		tpl.CreatedAt = existingCreatedAt
	} else if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return NoteTemplate{}, fmt.Errorf("check existing note template: %w", err)
	} else {
		tpl.CreatedAt = now
	}
	tpl.UpdatedAt = now

	tagsBytes, err := json.Marshal(tpl.Tags)
	if err != nil {
		return NoteTemplate{}, fmt.Errorf("marshal template tags: %w", err)
	}

	_, err = s.db.Exec(`
		INSERT INTO note_templates (id, name, description, category, icon, default_title, body, tags, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			description = excluded.description,
			category = excluded.category,
			icon = excluded.icon,
			default_title = excluded.default_title,
			body = excluded.body,
			tags = excluded.tags,
			updated_at = excluded.updated_at
	`,
		tpl.ID,
		tpl.Name,
		tpl.Description,
		tpl.Category,
		tpl.Icon,
		tpl.DefaultTitle,
		tpl.Body,
		string(tagsBytes),
		tpl.CreatedAt,
		tpl.UpdatedAt,
	)
	if err != nil {
		return NoteTemplate{}, fmt.Errorf("save note template: %w", err)
	}
	return tpl, nil
}

func (s *noteStore) deleteNoteTemplate(id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return errors.New("id do template é obrigatório")
	}
	if _, err := s.db.Exec(`DELETE FROM note_templates WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete note template: %w", err)
	}
	return nil
}
