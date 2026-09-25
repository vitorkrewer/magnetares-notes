package main

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/text/unicode/norm"
)

const defaultFolderID = "folder-default"

type Folder struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	ParentID  *string `json:"parentId"`
	NoteCount int64   `json:"noteCount"`
}

type Navigation struct {
	Folders      []Folder      `json:"folders"`
	Tags         []Tag         `json:"tags"`
	SmartFolders []SmartFolder `json:"smartFolders"`
}

type Tag struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	NoteCount int64  `json:"noteCount"`
}

type SmartFolder struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	RuleKind       string `json:"ruleKind"`
	TagID          string `json:"tagId"`
	DateField      string `json:"dateField"`
	DateRange      string `json:"dateRange"`
	ChecklistState string `json:"checklistState"`
}

type NoteQuery struct {
	Kind string `json:"kind"`
	ID   string `json:"id"`
}

func (s *noteStore) listNavigation() (Navigation, error) {
	rows, err := s.db.Query(`SELECT f.id, f.name, f.parent_id, COUNT(n.id)
		FROM folders f
		LEFT JOIN notes n ON n.folder_id = f.id AND n.deleted_at IS NULL
		GROUP BY f.id, f.name, f.parent_id
		ORDER BY f.parent_id IS NOT NULL, f.name COLLATE NOCASE`)
	if err != nil {
		return Navigation{}, fmt.Errorf("list folders: %w", err)
	}
	navigation := Navigation{Folders: make([]Folder, 0)}
	for rows.Next() {
		var folder Folder
		var parentID sql.NullString
		if err := rows.Scan(&folder.ID, &folder.Name, &parentID, &folder.NoteCount); err != nil {
			return Navigation{}, fmt.Errorf("scan folder: %w", err)
		}
		if parentID.Valid {
			folder.ParentID = &parentID.String
		}
		navigation.Folders = append(navigation.Folders, folder)
	}
	if err := rows.Err(); err != nil {
		return Navigation{}, fmt.Errorf("read folders: %w", err)
	}
	if err := rows.Close(); err != nil {
		return Navigation{}, fmt.Errorf("close folders: %w", err)
	}

	tagRows, err := s.db.Query(`SELECT t.id, t.name, COUNT(nt.note_id)
		FROM tags t LEFT JOIN note_tags nt ON nt.tag_id = t.id
		GROUP BY t.id, t.name ORDER BY t.normalized_name`)
	if err != nil {
		return Navigation{}, fmt.Errorf("list tags: %w", err)
	}
	navigation.Tags = make([]Tag, 0)
	for tagRows.Next() {
		var tag Tag
		if err := tagRows.Scan(&tag.ID, &tag.Name, &tag.NoteCount); err != nil {
			return Navigation{}, fmt.Errorf("scan tag: %w", err)
		}
		navigation.Tags = append(navigation.Tags, tag)
	}
	if err := tagRows.Err(); err != nil {
		return Navigation{}, fmt.Errorf("read tags: %w", err)
	}
	if err := tagRows.Close(); err != nil {
		return Navigation{}, fmt.Errorf("close tags: %w", err)
	}

	smartRows, err := s.db.Query(`SELECT id, name, rule_kind, tag_id, date_field, date_range, checklist_state
		FROM smart_folders ORDER BY name COLLATE NOCASE`)
	if err != nil {
		return Navigation{}, fmt.Errorf("list smart folders: %w", err)
	}
	defer smartRows.Close()
	navigation.SmartFolders = make([]SmartFolder, 0)
	for smartRows.Next() {
		var smart SmartFolder
		var tagID, dateField, dateRange, checklistState sql.NullString
		if err := smartRows.Scan(&smart.ID, &smart.Name, &smart.RuleKind, &tagID, &dateField, &dateRange, &checklistState); err != nil {
			return Navigation{}, fmt.Errorf("scan smart folder: %w", err)
		}
		smart.TagID = tagID.String
		smart.DateField = dateField.String
		smart.DateRange = dateRange.String
		smart.ChecklistState = checklistState.String
		navigation.SmartFolders = append(navigation.SmartFolders, smart)
	}
	if err := smartRows.Err(); err != nil {
		return Navigation{}, fmt.Errorf("read smart folders: %w", err)
	}
	return navigation, nil
}

func (s *noteStore) saveFolder(folder Folder) (Folder, error) {
	folder.Name = strings.TrimSpace(folder.Name)
	if folder.Name == "" {
		return Folder{}, errors.New("folder name is required")
	}
	if folder.ID == "" {
		folder.ID = uuid.NewString()
	}
	if folder.ID == defaultFolderID {
		folder.ParentID = nil
	}
	if folder.ParentID != nil {
		parentID := strings.TrimSpace(*folder.ParentID)
		if parentID == "" {
			folder.ParentID = nil
		} else {
			folder.ParentID = &parentID
		}
	}
	if folder.ParentID != nil {
		if *folder.ParentID == folder.ID {
			return Folder{}, errors.New("a folder cannot contain itself")
		}
		var createsCycle bool
		err := s.db.QueryRow(`WITH RECURSIVE descendants(id) AS (
			SELECT id FROM folders WHERE id = ?
			UNION ALL
			SELECT child.id FROM folders child JOIN descendants parent ON child.parent_id = parent.id
		)
		SELECT EXISTS(SELECT 1 FROM descendants WHERE id = ?)`, folder.ID, *folder.ParentID).Scan(&createsCycle)
		if err != nil {
			return Folder{}, fmt.Errorf("check folder hierarchy: %w", err)
		}
		if createsCycle {
			return Folder{}, errors.New("folder hierarchy cannot contain a cycle")
		}
	}

	now := time.Now().UTC().UnixMilli()
	_, err := s.db.Exec(`INSERT INTO folders(id, name, parent_id, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET name = excluded.name, parent_id = excluded.parent_id, updated_at = excluded.updated_at`,
		folder.ID, folder.Name, folder.ParentID, now, now)
	if err != nil {
		return Folder{}, fmt.Errorf("save folder: %w", err)
	}
	return folder, nil
}

func (s *noteStore) deleteFolder(id string) error {
	if id == defaultFolderID {
		return errors.New("the default folder cannot be deleted")
	}
	result, err := s.db.Exec("DELETE FROM folders WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("delete folder: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read folder deletion: %w", err)
	}
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *noteStore) moveNote(noteID, folderID string) error {
	var folderName string
	if err := s.db.QueryRow("SELECT name FROM folders WHERE id = ?", folderID).Scan(&folderName); err != nil {
		return fmt.Errorf("find destination folder: %w", err)
	}
	mutationID := uuid.NewString()
	result, err := s.db.Exec(`UPDATE notes
		SET folder_id = ?, folder = ?, revision = revision + 1, updated_at = ?,
			sync_state = 'pending', pending_mutation_id = ?
		WHERE id = ?`, folderID, folderName, time.Now().UTC().UnixMilli(), mutationID, noteID)
	if err != nil {
		return fmt.Errorf("move note: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read note movement: %w", err)
	}
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *noteStore) setNotePinned(id string, pinned bool) (Note, error) {
	var pinnedAt any
	if pinned {
		pinnedAt = time.Now().UTC().UnixMilli()
	}
	mutationID := uuid.NewString()
	result, err := s.db.Exec(`UPDATE notes SET pinned_at = ?, revision = revision + 1, updated_at = ?,
		sync_state = 'pending', pending_mutation_id = ?
		WHERE id = ?`, pinnedAt, time.Now().UTC().UnixMilli(), mutationID, id)
	if err != nil {
		return Note{}, fmt.Errorf("set note pin: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return Note{}, fmt.Errorf("read note pin: %w", err)
	}
	if affected == 0 {
		return Note{}, sql.ErrNoRows
	}
	return s.getNote(id)
}

func normalizeTagName(value string) (name string, normalized string) {
	name = strings.TrimSpace(strings.TrimLeft(value, "#"))
	name = norm.NFKC.String(name)
	return name, strings.ToLower(name)
}

func (s *noteStore) setNoteTags(noteID string, values []string) (Note, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return Note{}, fmt.Errorf("begin tag update: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM note_tags WHERE note_id = ?", noteID); err != nil {
		return Note{}, fmt.Errorf("clear note tags: %w", err)
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
			return Note{}, fmt.Errorf("save tag: %w", err)
		}
		if _, err := tx.Exec("INSERT INTO note_tags(note_id, tag_id) VALUES (?, ?)", noteID, tagID); err != nil {
			return Note{}, fmt.Errorf("link note tag: %w", err)
		}
	}
	if _, err := tx.Exec(`DELETE FROM tags
		WHERE NOT EXISTS (SELECT 1 FROM note_tags WHERE note_tags.tag_id = tags.id)
		AND NOT EXISTS (SELECT 1 FROM smart_folders WHERE smart_folders.tag_id = tags.id)`); err != nil {
		return Note{}, fmt.Errorf("remove unused tags: %w", err)
	}
	mutationID := uuid.NewString()
	now := time.Now().UTC().UnixMilli()
	if _, err := tx.Exec(`UPDATE notes SET revision = revision + 1, updated_at = ?,
		sync_state = 'pending', pending_mutation_id = ? WHERE id = ?`, now, mutationID, noteID); err != nil {
		return Note{}, fmt.Errorf("update note revision for tags: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return Note{}, fmt.Errorf("commit tag update: %w", err)
	}
	return s.getNote(noteID)
}

func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func (s *noteStore) saveSmartFolder(smart SmartFolder) (SmartFolder, error) {
	smart.Name = strings.TrimSpace(smart.Name)
	if smart.Name == "" {
		return SmartFolder{}, errors.New("smart folder name is required")
	}
	if smart.ID == "" {
		smart.ID = uuid.NewString()
	}
	switch smart.RuleKind {
	case "tag":
		if smart.TagID == "" {
			return SmartFolder{}, errors.New("tag rule requires a tag")
		}
		smart.DateField, smart.DateRange, smart.ChecklistState = "", "", ""
	case "date":
		if smart.DateField != "created_at" && smart.DateField != "updated_at" {
			return SmartFolder{}, errors.New("invalid date field")
		}
		if smart.DateRange != "today" && smart.DateRange != "last_7_days" && smart.DateRange != "last_30_days" {
			return SmartFolder{}, errors.New("invalid date range")
		}
		smart.TagID, smart.ChecklistState = "", ""
	case "checklist":
		if smart.ChecklistState != "any" && smart.ChecklistState != "open" && smart.ChecklistState != "completed" {
			return SmartFolder{}, errors.New("invalid checklist state")
		}
		smart.TagID, smart.DateField, smart.DateRange = "", "", ""
	default:
		return SmartFolder{}, errors.New("invalid smart folder rule")
	}
	now := time.Now().UTC().UnixMilli()
	_, err := s.db.Exec(`INSERT INTO smart_folders(id, name, rule_kind, tag_id, date_field, date_range, checklist_state, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET name = excluded.name, rule_kind = excluded.rule_kind,
			tag_id = excluded.tag_id, date_field = excluded.date_field, date_range = excluded.date_range,
			checklist_state = excluded.checklist_state, updated_at = excluded.updated_at`,
		smart.ID, smart.Name, smart.RuleKind, nullableString(smart.TagID), nullableString(smart.DateField), nullableString(smart.DateRange), nullableString(smart.ChecklistState), now, now)
	if err != nil {
		return SmartFolder{}, fmt.Errorf("save smart folder: %w", err)
	}
	return smart, nil
}

func (s *noteStore) deleteSmartFolder(id string) error {
	result, err := s.db.Exec("DELETE FROM smart_folders WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("delete smart folder: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read smart folder deletion: %w", err)
	}
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *noteStore) queryNotes(query NoteQuery) ([]Note, error) {
	switch query.Kind {
	case "all":
		return s.listNotes(false)
	case "deleted":
		return s.listNotes(true)
	case "pinned":
		return s.queryNotesWhere("n.deleted_at IS NULL AND n.pinned_at IS NOT NULL")
	case "tag":
		return s.queryNotesWhere(`n.deleted_at IS NULL AND EXISTS (
			SELECT 1 FROM note_tags nt WHERE nt.note_id = n.id AND nt.tag_id = ?)`, query.ID)
	case "folder":
		return s.queryNotesWhere(`n.deleted_at IS NULL AND n.folder_id IN (
			WITH RECURSIVE descendants(id) AS (
				SELECT id FROM folders WHERE id = ?
				UNION ALL SELECT f.id FROM folders f JOIN descendants d ON f.parent_id = d.id
			) SELECT id FROM descendants)`, query.ID)
	case "smart":
		return s.querySmartFolder(query.ID)
	default:
		return nil, errors.New("invalid note query")
	}
}

func (s *noteStore) querySmartFolder(id string) ([]Note, error) {
	var smart SmartFolder
	var tagID, dateField, dateRange, checklistState sql.NullString
	err := s.db.QueryRow(`SELECT id, name, rule_kind, tag_id, date_field, date_range, checklist_state
		FROM smart_folders WHERE id = ?`, id).Scan(&smart.ID, &smart.Name, &smart.RuleKind, &tagID, &dateField, &dateRange, &checklistState)
	if err != nil {
		return nil, fmt.Errorf("find smart folder: %w", err)
	}
	switch smart.RuleKind {
	case "tag":
		return s.queryNotesWhere(`n.deleted_at IS NULL AND EXISTS (
			SELECT 1 FROM note_tags nt WHERE nt.note_id = n.id AND nt.tag_id = ?)`, tagID.String)
	case "checklist":
		switch checklistState.String {
		case "any":
			return s.queryNotesWhere("n.deleted_at IS NULL AND n.checklist_total > 0")
		case "open":
			return s.queryNotesWhere("n.deleted_at IS NULL AND n.checklist_open > 0")
		case "completed":
			return s.queryNotesWhere("n.deleted_at IS NULL AND n.checklist_total > 0 AND n.checklist_open = 0")
		}
	case "date":
		now := time.Now()
		start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		switch dateRange.String {
		case "last_7_days":
			start = start.AddDate(0, 0, -6)
		case "last_30_days":
			start = start.AddDate(0, 0, -29)
		}
		if dateField.String == "created_at" {
			return s.queryNotesWhere("n.deleted_at IS NULL AND n.created_at >= ?", start.UTC().UnixMilli())
		}
		return s.queryNotesWhere("n.deleted_at IS NULL AND n.updated_at >= ?", start.UTC().UnixMilli())
	}
	return nil, errors.New("invalid smart folder configuration")
}
