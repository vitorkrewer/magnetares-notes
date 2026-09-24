package main

import (
	"database/sql"
	"embed"
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

const noteSelectColumns = `n.id, n.title, n.body, n.body_text, n.folder, n.folder_id,
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
	db.SetMaxOpenConns(1)

	store := &noteStore{db: db}
	if err := store.prepare(); err != nil {
		db.Close()
		return nil, err
	}
	return store, nil
}

type appConfig struct {
	CustomDatabasePath string `json:"customDatabasePath,omitempty"`
	TursoDatabaseURL   string `json:"tursoDatabaseUrl,omitempty"`
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
	condition := "n.deleted_at IS NULL"
	if deleted {
		condition = "n.deleted_at IS NOT NULL"
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
	_, err := s.db.Exec(`INSERT INTO notes(id, title, body, body_text, folder, folder_id, revision, checklist_total, checklist_open, sync_state, pending_mutation_id, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 'pending', ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			title = excluded.title,
			body = excluded.body,
			body_text = excluded.body_text,
			checklist_total = excluded.checklist_total,
			checklist_open = excluded.checklist_open,
			sync_state = 'pending',
			pending_mutation_id = excluded.pending_mutation_id,
			revision = notes.revision + 1,
			updated_at = excluded.updated_at`, note.ID, note.Title, note.Body, note.BodyText, note.Folder, note.FolderID, note.ChecklistTotal, note.ChecklistOpen, mutationID, now, now)
	if err != nil {
		return Note{}, fmt.Errorf("save note: %w", err)
	}
	return s.getNote(note.ID)
}

func (s *noteStore) getNote(id string) (Note, error) {
	row := s.db.QueryRow(`SELECT `+noteSelectColumns+`
		FROM notes n WHERE n.id = ?`, id)
	return scanNote(row)
}

func (s *noteStore) setDeleted(id string, deleted bool) error {
	var result sql.Result
	var err error
	now := time.Now().UTC().UnixMilli()
	mutationID := uuid.NewString()
	if deleted {
		result, err = s.db.Exec(`UPDATE notes SET deleted_at = ?, updated_at = ?, revision = revision + 1,
			sync_state = 'pending', pending_mutation_id = ? WHERE id = ? AND deleted_at IS NULL`, now, now, mutationID, id)
	} else {
		result, err = s.db.Exec(`UPDATE notes SET deleted_at = NULL, updated_at = ?, revision = revision + 1,
			sync_state = 'pending', pending_mutation_id = ? WHERE id = ? AND deleted_at IS NOT NULL`, now, mutationID, id)
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
	return nil
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
	if err := scanner.Scan(&note.ID, &note.Title, &note.Body, &note.BodyText, &note.Folder, &note.FolderID, &note.Revision, &pinnedAt, &note.ChecklistTotal, &note.ChecklistOpen, &deletedAt, &createdAt, &updatedAt, &tags); err != nil {
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
