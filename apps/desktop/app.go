package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type Note struct {
	ID             string     `json:"id"`
	Title          string     `json:"title"`
	Body           string     `json:"body"`
	BodyText       string     `json:"bodyText"`
	Type           string     `json:"type"`
	Language       string     `json:"language"`
	Folder         string     `json:"folder"`
	FolderID       string     `json:"folderId"`
	Revision       int64      `json:"revision"`
	PinnedAt       *time.Time `json:"pinnedAt"`
	Tags           []string   `json:"tags"`
	ChecklistTotal int64      `json:"checklistTotal"`
	ChecklistOpen  int64      `json:"checklistOpen"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
	DeletedAt      *time.Time `json:"deletedAt"`
}

type App struct {
	ctx   context.Context
	store *noteStore
}

func NewApp(databasePath string) (*App, error) {
	store, err := openNoteStore(databasePath)
	if err != nil {
		return nil, err
	}
	return &App{store: store}, nil
}

func (a *App) startup(ctx context.Context) { a.ctx = ctx }

func (a *App) Close() error {
	return a.store.close()
}

func (a *App) ListNotes() ([]Note, error) {
	return a.store.listNotes(false)
}

func (a *App) ListDeletedNotes() ([]Note, error) {
	return a.store.listNotes(true)
}

func (a *App) SaveNote(note Note) (Note, error) {
	return a.store.saveNote(note)
}

func (a *App) DeleteNote(id string) error {
	return a.store.setDeleted(id, true)
}

func (a *App) RestoreNote(id string) error {
	return a.store.setDeleted(id, false)
}

func (a *App) ListNavigation() (Navigation, error) {
	return a.store.listNavigation()
}

func (a *App) SaveFolder(folder Folder) (Folder, error) {
	return a.store.saveFolder(folder)
}

func (a *App) DeleteFolder(id string) error {
	return a.store.deleteFolder(id)
}

func (a *App) MoveNote(noteID, folderID string) error {
	return a.store.moveNote(noteID, folderID)
}

func (a *App) SetNotePinned(id string, pinned bool) (Note, error) {
	return a.store.setNotePinned(id, pinned)
}

func (a *App) SetNoteTags(id string, tags []string) (Note, error) {
	return a.store.setNoteTags(id, tags)
}

func (a *App) SaveTag(tag Tag) (Tag, error) {
	return a.store.saveTag(tag)
}

func (a *App) DeleteTag(id string) error {
	return a.store.deleteTag(id)
}

func (a *App) QueryNotes(query NoteQuery) ([]Note, error) {
	return a.store.queryNotes(query)
}

func (a *App) SaveSmartFolder(smart SmartFolder) (SmartFolder, error) {
	return a.store.saveSmartFolder(smart)
}

func (a *App) DeleteSmartFolder(id string) error {
	return a.store.deleteSmartFolder(id)
}

func (a *App) SaveStickerBoard(board StickerBoard) (StickerBoard, error) {
	return a.store.saveStickerBoard(board)
}

func (a *App) DeleteStickerBoard(id string) error {
	return a.store.deleteStickerBoard(id)
}

func (a *App) ListStickers(boardID string) ([]Sticker, error) {
	return a.store.listStickers(boardID)
}

func (a *App) SaveSticker(sticker Sticker) (Sticker, error) {
	return a.store.saveSticker(sticker)
}

func (a *App) DeleteSticker(id string) error {
	return a.store.deleteSticker(id)
}

func (a *App) RestoreSticker(id string) (Sticker, error) {
	return a.store.restoreSticker(id)
}

func (a *App) SetStickerPinned(id string, pinned bool) (Sticker, error) {
	return a.store.setStickerPinned(id, pinned)
}

func (a *App) MoveSticker(id, boardID, beforeID string) (Sticker, error) {
	return a.store.moveSticker(id, boardID, beforeID)
}

func (a *App) GetDatabasePath() (string, error) {
	return defaultDatabasePath()
}

func (a *App) SetCustomDatabasePath(newPath string) (string, error) {
	newPath = strings.TrimSpace(newPath)
	if newPath == "" {
		return "", errors.New("caminho do banco de dados inválido")
	}

	_ = a.store.close()

	newStore, err := openNoteStore(newPath)
	if err != nil {
		oldPath, _ := defaultDatabasePath()
		a.store, _ = openNoteStore(oldPath)
		return "", fmt.Errorf("não foi possível abrir o banco no novo local: %w", err)
	}

	a.store = newStore
	_ = saveConfiguredDatabasePath(newPath)
	return newPath, nil
}

func (a *App) SyncNow(apiURL string) (SyncResult, error) {
	databaseURL, authToken, err := a.syncCredentials()
	if err != nil {
		return SyncResult{}, err
	}
	return a.store.syncNow(apiURL, databaseURL, authToken)
}

func (a *App) RunComplianceAudit() (ComplianceReport, error) {
	return a.store.EnsureDataCompliance()
}

func (a *App) GetSyncDiagnosticReport() (SyncDiagnosticReport, error) {
	return a.store.GetSyncDiagnosticReport()
}

func (a *App) GetSyncProfileID() (string, error) {
	profileID, _, err := a.store.syncMetadata()
	return profileID, err
}

func (a *App) SetSyncProfileID(profileID string) error {
	profileID = strings.TrimSpace(profileID)
	if _, err := uuid.Parse(profileID); err != nil {
		return errors.New("perfil de sincronização inválido")
	}
	_, err := a.store.db.Exec("UPDATE sync_metadata SET sync_profile_id = ?, pull_cursor = '0' WHERE singleton = 1", profileID)
	return err
}

func (a *App) MinimizeWindow() {
	if a.ctx != nil {
		runtime.WindowMinimise(a.ctx)
	}
}

func (a *App) ToggleMaximizeWindow() bool {
	if a.ctx == nil {
		return false
	}
	maximized := runtime.WindowIsMaximised(a.ctx)
	runtime.WindowToggleMaximise(a.ctx)
	return !maximized
}

func (a *App) IsWindowMaximized() bool {
	return a.ctx != nil && runtime.WindowIsMaximised(a.ctx)
}

func (a *App) CloseWindow() {
	if a.ctx != nil {
		runtime.Quit(a.ctx)
	}
}

func (a *App) ExportNoteFile(defaultFilename, content string) (string, error) {
	if a.ctx == nil {
		return "", errors.New("janela da aplicação não inicializada")
	}

	defaultFilename = sanitizeFilename(defaultFilename)
	ext := strings.ToLower(filepath.Ext(defaultFilename))
	var filters []runtime.FileFilter
	switch ext {
	case ".md":
		filters = []runtime.FileFilter{
			{DisplayName: "Arquivo Markdown (*.md)", Pattern: "*.md"},
			{DisplayName: "Todos os Arquivos (*.*)", Pattern: "*.*"},
		}
	case ".html":
		filters = []runtime.FileFilter{
			{DisplayName: "Arquivo HTML (*.html)", Pattern: "*.html"},
			{DisplayName: "Todos os Arquivos (*.*)", Pattern: "*.*"},
		}
	case ".txt":
		filters = []runtime.FileFilter{
			{DisplayName: "Arquivo de Texto (*.txt)", Pattern: "*.txt"},
			{DisplayName: "Todos os Arquivos (*.*)", Pattern: "*.*"},
		}
	default:
		if ext != "" {
			filters = []runtime.FileFilter{
				{DisplayName: fmt.Sprintf("Arquivo de Código (*%s)", ext), Pattern: "*" + ext},
				{DisplayName: "Todos os Arquivos (*.*)", Pattern: "*.*"},
			}
		} else {
			filters = []runtime.FileFilter{
				{DisplayName: "Todos os Arquivos (*.*)", Pattern: "*.*"},
			}
		}
	}

	selectedPath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Exportar Nota",
		DefaultFilename: defaultFilename,
		Filters:         filters,
	})
	if err != nil {
		return "", fmt.Errorf("abrir diálogo de salvamento: %w", err)
	}
	if strings.TrimSpace(selectedPath) == "" {
		// Usuário cancelou a seleção do local
		return "", nil
	}

	if err := os.WriteFile(selectedPath, []byte(content), 0644); err != nil {
		return "", fmt.Errorf("salvar arquivo exportado: %w", err)
	}

	return selectedPath, nil
}

func sanitizeFilename(name string) string {
	ext := filepath.Ext(name)
	base := strings.TrimSuffix(name, ext)
	invalidChars := []string{"\\", "/", ":", "*", "?", "\"", "<", ">", "|"}
	for _, char := range invalidChars {
		base = strings.ReplaceAll(base, char, "_")
	}
	base = strings.TrimSpace(base)
	if base == "" {
		base = "Nota"
	}
	return base + ext
}
