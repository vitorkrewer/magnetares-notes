package main

import (
	"crypto/sha256"
	"database/sql"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

//go:embed localmigrations/*.sql
var localMigrations embed.FS

type noteStore struct {
	db *sql.DB
}

const noteSelectColumns = `n.id, n.title, n.body, n.body_text, n.note_type, n.language, n.folder, n.folder_id,
	n.revision, n.pinned_at, n.checklist_total, n.checklist_open, n.deleted_at, n.created_at, n.updated_at,
	COALESCE((SELECT group_concat(name, char(31)) FROM (
		SELECT t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
		WHERE nt.note_id = n.id ORDER BY t.normalized_name
	)), '')`

func openNoteStore(databasePath string) (*noteStore, error) {
	if databasePath == "" {
		var err error
		databasePath, err = defaultDatabasePath()
		if err != nil {
			return nil, err
		}
	}

	if err := os.MkdirAll(filepath.Dir(databasePath), 0o700); err != nil {
		return nil, fmt.Errorf("create data directory: %w", err)
	}

	db, err := sql.Open("sqlite", databasePath)
	if err != nil {
		return nil, fmt.Errorf("open local database: %w", err)
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)

	store := &noteStore{db: db}
	if err := store.prepare(); err != nil {
		db.Close()
		return nil, err
	}
	_, _ = store.EnsureDataCompliance()
	return store, nil
}

type appConfig struct {
	CustomDatabasePath      string `json:"customDatabasePath,omitempty"`
	TursoDatabaseURL        string `json:"tursoDatabaseUrl,omitempty"`
	AutoSyncIntervalMinutes int    `json:"autoSyncIntervalMinutes,omitempty"`
}

func configFilePath() (string, error) {
	baseDir := os.Getenv("LOCALAPPDATA")
	if baseDir == "" {
		var err error
		baseDir, err = os.UserConfigDir()
		if err != nil {
			return "", err
		}
	}
	return filepath.Join(baseDir, "Magnetares Notes", "config.json"), nil
}

func loadAppConfig() appConfig {
	path, err := configFilePath()
	if err != nil {
		return appConfig{}
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return appConfig{}
	}
	var cfg appConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return appConfig{}
	}
	return cfg
}

func saveAppConfig(cfg appConfig) error {
	path, err := configFilePath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

func loadConfiguredDatabasePath() string {
	return strings.TrimSpace(loadAppConfig().CustomDatabasePath)
}

func saveConfiguredDatabasePath(dbPath string) error {
	cfg := loadAppConfig()
	cfg.CustomDatabasePath = dbPath
	return saveAppConfig(cfg)
}

func defaultDatabasePath() (string, error) {
	if customPath := loadConfiguredDatabasePath(); customPath != "" {
		return customPath, nil
	}

	baseDirectory := os.Getenv("LOCALAPPDATA")
	if baseDirectory == "" {
		var err error
		baseDirectory, err = os.UserConfigDir()
		if err != nil {
			return "", fmt.Errorf("locate application data: %w", err)
		}
	}
	newPath := filepath.Join(baseDirectory, "Magnetares Notes", "magnetares.db")
	oldPath := filepath.Join(baseDirectory, "Aster Notes", "aster.db")

	if _, err := os.Stat(newPath); errors.Is(err, os.ErrNotExist) {
		if _, oldErr := os.Stat(oldPath); oldErr == nil {
			_ = os.MkdirAll(filepath.Dir(newPath), 0o700)
			_ = copyFile(oldPath, newPath)
		}
	}
	return newPath, nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

func (s *noteStore) prepare() error {
	for _, statement := range []string{
		"PRAGMA journal_mode = WAL",
		"PRAGMA foreign_keys = ON",
		"PRAGMA busy_timeout = 5000",
	} {
		if _, err := s.db.Exec(statement); err != nil {
			return fmt.Errorf("configure local database: %w", err)
		}
	}

	if _, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		version TEXT PRIMARY KEY,
		applied_at INTEGER NOT NULL
	)`); err != nil {
		return fmt.Errorf("create migration table: %w", err)
	}
	return s.migrate()
}

func (s *noteStore) migrate() error {
	entries, err := fs.ReadDir(localMigrations, "localmigrations")
	if err != nil {
		return fmt.Errorf("read local migrations: %w", err)
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}

		var applied bool
		if err := s.db.QueryRow("SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = ?)", entry.Name()).Scan(&applied); err != nil {
			return fmt.Errorf("check migration %s: %w", entry.Name(), err)
		}
		if applied {
			continue
		}

		script, err := localMigrations.ReadFile(filepath.ToSlash(filepath.Join("localmigrations", entry.Name())))
		if err != nil {
			return fmt.Errorf("read migration %s: %w", entry.Name(), err)
		}
		tx, err := s.db.Begin()
		if err != nil {
			return fmt.Errorf("begin migration %s: %w", entry.Name(), err)
		}
		if _, err = tx.Exec(string(script)); err == nil {
			_, err = tx.Exec("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)", entry.Name(), time.Now().UTC().UnixMilli())
		}
		if err != nil {
			tx.Rollback()
			return fmt.Errorf("apply migration %s: %w", entry.Name(), err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %s: %w", entry.Name(), err)
		}
	}
	return nil
}

func (s *noteStore) close() error {
	return s.db.Close()
}

func (s *noteStore) listNotes(deleted bool) ([]Note, error) {
	condition := "n.deleted_at IS NULL AND n.folder_id != 'tombstone'"
	if deleted {
		condition = "n.deleted_at IS NOT NULL AND n.folder_id != 'tombstone'"
	}
	return s.queryNotesWhere(condition)
}

func (s *noteStore) queryNotesWhere(condition string, args ...any) ([]Note, error) {
	rows, err := s.db.Query(`SELECT `+noteSelectColumns+`
		FROM notes n WHERE `+condition+`
		ORDER BY n.pinned_at IS NULL, n.pinned_at DESC, n.updated_at DESC`, args...)
	if err != nil {
		return nil, fmt.Errorf("list notes: %w", err)
	}
	defer rows.Close()

	notes := make([]Note, 0)
	for rows.Next() {
		note, err := scanNote(rows)
		if err != nil {
			return nil, err
		}
		notes = append(notes, note)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read notes: %w", err)
	}
	return notes, nil
}

type SyncOp struct {
	OpID          string `json:"opId"`
	DeviceID      string `json:"deviceId"`
	DeviceSeq     int64  `json:"deviceSeq"`
	EntityType    string `json:"entityType"`
	EntityID      string `json:"entityId"`
	OpType        string `json:"opType"`
	Payload       string `json:"payload"`
	CausalVersion int64  `json:"causalVersion"`
	Status        string `json:"status"`
	CreatedAt     int64  `json:"createdAt"`
}

func getOrCreateDeviceInfo(tx *sql.Tx) (string, int64, error) {
	var deviceID string
	var currentSeq int64
	err := tx.QueryRow("SELECT COALESCE(device_id, ''), COALESCE(device_seq, 0) FROM sync_metadata WHERE singleton = 1").Scan(&deviceID, &currentSeq)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return "", 0, err
	}
	if deviceID == "" {
		deviceID = uuid.NewString()
		if _, err := tx.Exec("UPDATE sync_metadata SET device_id = ? WHERE singleton = 1", deviceID); err != nil {
			return "", 0, err
		}
	}
	nextSeq := currentSeq + 1
	if _, err := tx.Exec("UPDATE sync_metadata SET device_seq = ? WHERE singleton = 1", nextSeq); err != nil {
		return "", 0, err
	}
	return deviceID, nextSeq, nil
}

func commitLocalOp(tx *sql.Tx, entityType, entityID, opType string, payload any, causalVer int64) (string, error) {
	deviceID, deviceSeq, err := getOrCreateDeviceInfo(tx)
	if err != nil {
		return "", fmt.Errorf("get device info: %w", err)
	}
	opID := uuid.NewString()
	now := time.Now().UTC().UnixMilli()

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal op payload: %w", err)
	}

	_, err = tx.Exec(`INSERT INTO sync_outbox(op_id, device_id, device_seq, entity_type, entity_id, op_type, payload, causal_version, status, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
		opID, deviceID, deviceSeq, entityType, entityID, opType, string(payloadBytes), causalVer, now)
	if err != nil {
		return "", fmt.Errorf("insert outbox op: %w", err)
	}
	return opID, nil
}

type canonicalEntity struct {
	Type      string   `json:"type"`
	ID        string   `json:"id"`
	Title     string   `json:"title,omitempty"`
	Body      string   `json:"body,omitempty"`
	FolderID  string   `json:"folderId,omitempty"`
	Name      string   `json:"name,omitempty"`
	ParentID  *string  `json:"parentId,omitempty"`
	Color     string   `json:"color,omitempty"`
	Icon      string   `json:"icon,omitempty"`
	Revision  int64    `json:"revision,omitempty"`
	DeletedAt *int64   `json:"deletedAt,omitempty"`
	PinnedAt  *int64   `json:"pinnedAt,omitempty"`
	Tags      []string `json:"tags,omitempty"`
}

func (s *noteStore) ComputeCanonicalStateHash() (string, error) {
	var entities []canonicalEntity

	// 1. Folders
	fRows, err := s.db.Query(`SELECT id, name, parent_id, COALESCE(color, ''), COALESCE(icon, ''), deleted_at FROM folders ORDER BY id ASC`)
	if err != nil {
		return "", fmt.Errorf("query folders: %w", err)
	}
	defer fRows.Close()
	for fRows.Next() {
		var id, name, color, icon string
		var parentID sql.NullString
		var deletedAt sql.NullInt64
		if err := fRows.Scan(&id, &name, &parentID, &color, &icon, &deletedAt); err != nil {
			return "", fmt.Errorf("scan folder: %w", err)
		}
		var pID *string
		if parentID.Valid && parentID.String != "" {
			pID = &parentID.String
		}
		var dAt *int64
		if deletedAt.Valid {
			dAt = &deletedAt.Int64
		}
		entities = append(entities, canonicalEntity{
			Type:      "folder",
			ID:        id,
			Name:      name,
			ParentID:  pID,
			Color:     color,
			Icon:      icon,
			DeletedAt: dAt,
		})
	}
	if err := fRows.Err(); err != nil {
		return "", fmt.Errorf("iterate folders: %w", err)
	}

	// 2. Notes
	nRows, err := s.db.Query(`SELECT n.id, n.title, n.body, n.folder_id, n.revision, n.deleted_at, n.pinned_at,
		COALESCE((SELECT group_concat(t.name, char(31)) FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = n.id ORDER BY t.normalized_name), '')
		FROM notes n ORDER BY n.id ASC`)
	if err != nil {
		return "", fmt.Errorf("query notes: %w", err)
	}
	defer nRows.Close()
	for nRows.Next() {
		var id, title, body, folderID, tagsStr string
		var revision int64
		var deletedAt, pinnedAt sql.NullInt64
		if err := nRows.Scan(&id, &title, &body, &folderID, &revision, &deletedAt, &pinnedAt, &tagsStr); err != nil {
			return "", fmt.Errorf("scan note: %w", err)
		}
		var dAt, pAt *int64
		if deletedAt.Valid {
			dAt = &deletedAt.Int64
		}
		if pinnedAt.Valid {
			pAt = &pinnedAt.Int64
		}
		var tags []string
		if tagsStr != "" {
			tags = strings.Split(tagsStr, string(rune(31)))
		} else {
			tags = make([]string, 0)
		}
		entities = append(entities, canonicalEntity{
			Type:      "note",
			ID:        id,
			Title:     title,
			Body:      body,
			FolderID:  folderID,
			Revision:  revision,
			DeletedAt: dAt,
			PinnedAt:  pAt,
			Tags:      tags,
		})
	}
	if err := nRows.Err(); err != nil {
		return "", fmt.Errorf("iterate notes: %w", err)
	}

	// 3. Tags
	tRows, err := s.db.Query(`SELECT id, name, COALESCE(icon, 'tag'), deleted_at FROM tags ORDER BY id ASC`)
	if err != nil {
		return "", fmt.Errorf("query tags: %w", err)
	}
	defer tRows.Close()
	for tRows.Next() {
		var id, name, icon string
		var deletedAt sql.NullInt64
		if err := tRows.Scan(&id, &name, &icon, &deletedAt); err != nil {
			return "", fmt.Errorf("scan tag: %w", err)
		}
		var dAt *int64
		if deletedAt.Valid {
			dAt = &deletedAt.Int64
		}
		entities = append(entities, canonicalEntity{
			Type:      "tag",
			ID:        id,
			Name:      name,
			Icon:      icon,
			DeletedAt: dAt,
		})
	}
	if err := tRows.Err(); err != nil {
		return "", fmt.Errorf("iterate tags: %w", err)
	}

	data, err := json.Marshal(entities)
	if err != nil {
		return "", err
	}
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:]), nil
}

func (s *noteStore) saveNote(note Note) (Note, error) {
	if strings.TrimSpace(note.ID) == "" {
		return Note{}, errors.New("note id is required")
	}
	if strings.TrimSpace(note.Folder) == "" {
		note.Folder = "Notas"
	}
	if strings.TrimSpace(note.FolderID) == "" {
		note.FolderID = "folder-default"
	}
	note.ChecklistTotal, note.ChecklistOpen = countChecklistItems(note.Body)
	now := time.Now().UTC().UnixMilli()
	mutationID := uuid.NewString()

	tx, err := s.db.Begin()
	if err != nil {
		return Note{}, fmt.Errorf("begin save note tx: %w", err)
	}
	defer tx.Rollback()

	var currentRev int64 = 0
	_ = tx.QueryRow("SELECT revision FROM notes WHERE id = ?", note.ID).Scan(&currentRev)
	nextRev := currentRev + 1

	if note.Type == "" {
		note.Type = "rtf"
	}
	if note.Language == "" {
		note.Language = "plaintext"
	}

	_, err = tx.Exec(`INSERT INTO notes(id, title, body, body_text, note_type, language, folder, folder_id, revision, checklist_total, checklist_open, sync_state, pending_mutation_id, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			title = excluded.title,
			body = excluded.body,
			body_text = excluded.body_text,
			note_type = excluded.note_type,
			language = excluded.language,
			folder = excluded.folder,
			folder_id = excluded.folder_id,
			checklist_total = excluded.checklist_total,
			checklist_open = excluded.checklist_open,
			sync_state = 'pending',
			pending_mutation_id = excluded.pending_mutation_id,
			revision = notes.revision + 1,
			updated_at = excluded.updated_at`, note.ID, note.Title, note.Body, note.BodyText, note.Type, note.Language, note.Folder, note.FolderID, nextRev, note.ChecklistTotal, note.ChecklistOpen, mutationID, now, now)
	if err != nil {
		return Note{}, fmt.Errorf("save note: %w", err)
	}

	if _, err := commitLocalOp(tx, "note", note.ID, "update", note, nextRev); err != nil {
		return Note{}, fmt.Errorf("commit outbox op: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return Note{}, fmt.Errorf("commit save note tx: %w", err)
	}

	return s.getNote(note.ID)
}

func (s *noteStore) getNote(id string) (Note, error) {
	row := s.db.QueryRow(`SELECT `+noteSelectColumns+`
		FROM notes n WHERE n.id = ?`, id)
	return scanNote(row)
}

func (s *noteStore) setDeleted(id string, deleted bool) error {
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("begin deletion tx: %w", err)
	}
	defer tx.Rollback()

	now := time.Now().UTC().UnixMilli()
	mutationID := uuid.NewString()

	var currentRev int64 = 0
	_ = tx.QueryRow("SELECT revision FROM notes WHERE id = ?", id).Scan(&currentRev)
	nextRev := currentRev + 1

	var result sql.Result
	if deleted {
		result, err = tx.Exec(`UPDATE notes SET deleted_at = ?, updated_at = ?, revision = ?,
			sync_state = 'pending', pending_mutation_id = ? WHERE id = ? AND deleted_at IS NULL`, now, now, nextRev, mutationID, id)
	} else {
		result, err = tx.Exec(`UPDATE notes SET deleted_at = NULL, updated_at = ?, revision = ?,
			sync_state = 'pending', pending_mutation_id = ? WHERE id = ? AND deleted_at IS NOT NULL`, now, nextRev, mutationID, id)
	}
	if err != nil {
		return fmt.Errorf("update note deletion: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read deletion result: %w", err)
	}
	if affected == 0 {
		return sql.ErrNoRows
	}

	opType := "delete"
	if !deleted {
		opType = "update"
	}
	if _, err := commitLocalOp(tx, "note", id, opType, map[string]any{"id": id, "deleted": deleted}, nextRev); err != nil {
		return fmt.Errorf("commit outbox delete op: %w", err)
	}

	return tx.Commit()
}

func (s *noteStore) permanentlyDeleteNote(id string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("begin perm delete tx: %w", err)
	}
	defer tx.Rollback()

	var syncState string
	var deletedAt sql.NullInt64
	err = tx.QueryRow("SELECT sync_state, deleted_at FROM notes WHERE id = ?", id).Scan(&syncState, &deletedAt)
	if err == nil && syncState == "clean" && deletedAt.Valid {
		if _, err := tx.Exec("DELETE FROM note_conflicts WHERE note_id = ?", id); err != nil { return err }
		if _, err := tx.Exec("DELETE FROM sync_outbox WHERE entity_id = ?", id); err != nil { return err }
		if _, err := tx.Exec("DELETE FROM note_tags WHERE note_id = ?", id); err != nil { return err }
		if _, err := tx.Exec("DELETE FROM notes WHERE id = ?", id); err != nil { return err }
	} else if err == nil {
		if _, err := tx.Exec(`UPDATE notes SET folder_id = 'tombstone', deleted_at = COALESCE(deleted_at, ?), updated_at = ? WHERE id = ?`, time.Now().UTC().UnixMilli(), time.Now().UTC().UnixMilli(), id); err != nil { return err }
	}
	return tx.Commit()
}

func (s *noteStore) emptyDeletedNotes() error {
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("begin empty trash tx: %w", err)
	}
	defer tx.Rollback()

	// Only permanently delete notes that have already synced their soft-delete to the cloud
	if _, err := tx.Exec("DELETE FROM notes WHERE deleted_at IS NOT NULL AND sync_state = 'clean'"); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM note_tags WHERE note_id NOT IN (SELECT id FROM notes)"); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM note_conflicts WHERE note_id NOT IN (SELECT id FROM notes)"); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM sync_outbox WHERE entity_id NOT IN (SELECT id FROM notes)"); err != nil {
		return err
	}

	// For notes that are pending sync, mark them as tombstones so they vanish from the UI
	if _, err := tx.Exec("UPDATE notes SET folder_id = 'tombstone' WHERE deleted_at IS NOT NULL AND sync_state != 'clean'"); err != nil {
		return err
	}
	return tx.Commit()
}

type noteScanner interface {
	Scan(dest ...any) error
}

func scanNote(scanner noteScanner) (Note, error) {
	var note Note
	var pinnedAt sql.NullInt64
	var deletedAt sql.NullInt64
	var createdAt int64
	var updatedAt int64
	var tags string
	if err := scanner.Scan(&note.ID, &note.Title, &note.Body, &note.BodyText, &note.Type, &note.Language, &note.Folder, &note.FolderID, &note.Revision, &pinnedAt, &note.ChecklistTotal, &note.ChecklistOpen, &deletedAt, &createdAt, &updatedAt, &tags); err != nil {
		return Note{}, fmt.Errorf("scan note: %w", err)
	}
	if tags == "" {
		note.Tags = make([]string, 0)
	} else {
		note.Tags = strings.Split(tags, string(rune(31)))
	}
	note.CreatedAt = time.UnixMilli(createdAt).UTC()
	note.UpdatedAt = time.UnixMilli(updatedAt).UTC()
	if pinnedAt.Valid {
		value := time.UnixMilli(pinnedAt.Int64).UTC()
		note.PinnedAt = &value
	}
	if deletedAt.Valid {
		value := time.UnixMilli(deletedAt.Int64).UTC()
		note.DeletedAt = &value
	}
	return note, nil
}

type documentNode struct {
	Type    string         `json:"type"`
	Attrs   map[string]any `json:"attrs"`
	Text    string         `json:"text,omitempty"`
	Content []documentNode `json:"content"`
}

func countChecklistItems(body string) (total int64, open int64) {
	var document documentNode
	if err := json.Unmarshal([]byte(body), &document); err != nil {
		return 0, 0
	}
	var walk func(documentNode)
	walk = func(node documentNode) {
		if node.Type == "taskItem" {
			total++
			checked, _ := node.Attrs["checked"].(bool)
			if !checked {
				open++
			}
		}
		for _, child := range node.Content {
			walk(child)
		}
	}
	walk(document)
	return total, open
}
