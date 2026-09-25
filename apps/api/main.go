package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

type RemoteNote struct {
	ID             string     `json:"id"`
	Title          string     `json:"title"`
	Body           string     `json:"body"`
	BodyText       string     `json:"bodyText"`
	Folder         string     `json:"folder"`
	FolderID       string     `json:"folderId"`
	Revision       int64      `json:"revision"`
	PinnedAt       *time.Time `json:"pinnedAt"`
	Tags           []string   `json:"tags"`
	ChecklistTotal int64      `json:"checklistTotal"`
	ChecklistOpen  int64      `json:"checklistOpen"`
	DeletedAt      *time.Time `json:"deletedAt"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}

type NotePayload struct {
	Title          string     `json:"title"`
	Body           string     `json:"body"`
	BodyText       string     `json:"bodyText"`
	Folder         string     `json:"folder"`
	FolderID       string     `json:"folderId"`
	PinnedAt       *time.Time `json:"pinnedAt"`
	Tags           []string   `json:"tags"`
	ChecklistTotal int64      `json:"checklistTotal"`
	ChecklistOpen  int64      `json:"checklistOpen"`
}

type NoteMutation struct {
	BaseRevision int64       `json:"baseRevision"`
	MutationID   string      `json:"mutationId"`
	Note         NotePayload `json:"note"`
}

type DeleteMutation struct {
	BaseRevision int64  `json:"baseRevision"`
	MutationID   string `json:"mutationId"`
}

type MutationResult struct {
	Note   RemoteNote `json:"note"`
	Cursor string     `json:"cursor"`
}

type Change struct {
	Cursor string     `json:"cursor"`
	Note   RemoteNote `json:"note"`
}

type ChangesPage struct {
	Changes    []Change `json:"changes"`
	NextCursor string   `json:"nextCursor"`
	HasMore    bool     `json:"hasMore"`
}

type Conflict struct {
	Code   string     `json:"code"`
	Note   RemoteNote `json:"note"`
	Cursor string     `json:"cursor"`
}

type RemoteFolder struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	ParentID  *string    `json:"parentId"`
	Color     string     `json:"color"`
	Icon      string     `json:"icon"`
	DeletedAt *time.Time `json:"deletedAt"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

type syncService struct {
	turso *TursoClient
}

func loadEnvFile(path string) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 && os.Getenv(strings.TrimSpace(parts[0])) == "" {
			os.Setenv(strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1]))
		}
	}
	if err := scanner.Err(); err != nil {
		log.Printf("error reading env file: %v", err)
	}
}

func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Magnetares-Profile, X-Magnetares-Turso-URL, X-Magnetares-Turso-Token")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	loadEnvFile(".env")
	service := &syncService{turso: NewTursoClientFromEnv()}
	if service.turso != nil {
		if err := service.turso.InitSchema(); err != nil {
			log.Printf("Warning: Turso schema init: %v", err)
		} else {
			log.Println("Turso sync schema initialized successfully.")
		}
	} else {
		log.Println("Running API in local mode without remote sync credentials.")
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) })
	mux.HandleFunc("GET /v1/changes", service.handleChanges)
	mux.HandleFunc("PUT /v1/notes/{id}", service.handlePutNote)
	mux.HandleFunc("DELETE /v1/notes/{id}", service.handleDeleteNote)
	mux.HandleFunc("GET /v1/folders", service.handleGetFolders)
	mux.HandleFunc("PUT /v1/folders/{id}", service.handlePutFolder)
	mux.HandleFunc("DELETE /v1/folders/{id}", service.handleDeleteFolder)

	addr := os.Getenv("PORT")
	if addr == "" {
		addr = "8080"
	}
	log.Printf("Magnetares API listening on :%s", addr)
	log.Fatal(http.ListenAndServe(":"+addr, enableCORS(mux)))
}

func (s *syncService) handleChanges(w http.ResponseWriter, r *http.Request) {
	service, err := s.forRequest(r)
	if err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	profile, ok := syncProfile(w, r)
	if !ok {
		return
	}
	cursor, err := strconv.ParseInt(r.URL.Query().Get("cursor"), 10, 64)
	if err != nil || cursor < 0 {
		writeJSONError(w, http.StatusBadRequest, "cursor inválido")
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit < 1 {
		limit = 200
	}
	if limit > 500 {
		limit = 500
	}
	page, err := service.changes(profile, cursor, limit)
	if err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, page)
}

func (s *syncService) handlePutNote(w http.ResponseWriter, r *http.Request) {
	service, err := s.forRequest(r)
	if err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	profile, ok := syncProfile(w, r)
	if !ok {
		return
	}
	var mutation NoteMutation
	if err := json.NewDecoder(r.Body).Decode(&mutation); err != nil || mutation.MutationID == "" {
		writeJSONError(w, http.StatusBadRequest, "mutação inválida")
		return
	}
	result, conflict, err := service.putNote(profile, r.PathValue("id"), mutation)
	if err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	if conflict != nil {
		writeJSON(w, http.StatusConflict, conflict)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *syncService) handleDeleteNote(w http.ResponseWriter, r *http.Request) {
	service, err := s.forRequest(r)
	if err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	profile, ok := syncProfile(w, r)
	if !ok {
		return
	}
	var mutation DeleteMutation
	if err := json.NewDecoder(r.Body).Decode(&mutation); err != nil || mutation.MutationID == "" {
		writeJSONError(w, http.StatusBadRequest, "mutação inválida")
		return
	}
	result, conflict, err := service.deleteNote(profile, r.PathValue("id"), mutation)
	if err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	if conflict != nil {
		writeJSON(w, http.StatusConflict, conflict)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *syncService) handleGetFolders(w http.ResponseWriter, r *http.Request) {
	service, err := s.forRequest(r)
	if err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	profile, ok := syncProfile(w, r)
	if !ok {
		return
	}
	folders, err := service.getFolders(profile)
	if err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, folders)
}

func (s *syncService) handlePutFolder(w http.ResponseWriter, r *http.Request) {
	service, err := s.forRequest(r)
	if err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	profile, ok := syncProfile(w, r)
	if !ok {
		return
	}
	var folder RemoteFolder
	if err := json.NewDecoder(r.Body).Decode(&folder); err != nil || folder.ID == "" {
		writeJSONError(w, http.StatusBadRequest, "pasta inválida")
		return
	}
	if err := service.putFolder(profile, folder); err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, folder)
}

func (s *syncService) handleDeleteFolder(w http.ResponseWriter, r *http.Request) {
	service, err := s.forRequest(r)
	if err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	profile, ok := syncProfile(w, r)
	if !ok {
		return
	}
	folderID := r.PathValue("id")
	if folderID == "" {
		writeJSONError(w, http.StatusBadRequest, "id inválido")
		return
	}
	if err := service.deleteFolder(profile, folderID); err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "folder deleted"})
}

func (s *syncService) forRequest(r *http.Request) (*syncService, error) {
	databaseURL := strings.TrimSpace(r.Header.Get("X-Magnetares-Turso-URL"))
	authToken := strings.TrimSpace(r.Header.Get("X-Magnetares-Turso-Token"))
	if databaseURL == "" && authToken == "" {
		if s.turso == nil {
			return nil, errors.New("sincronização remota não configurada")
		}
		return s, nil
	}
	if databaseURL == "" || authToken == "" {
		return nil, errors.New("URL e token Turso devem ser informados juntos")
	}
	turso := NewTursoClient(databaseURL, authToken)
	if turso == nil {
		return nil, errors.New("configuração Turso inválida")
	}
	if err := turso.InitSchema(); err != nil {
		return nil, fmt.Errorf("inicializar schema Turso: %w", err)
	}
	return &syncService{turso: turso}, nil
}

func syncProfile(w http.ResponseWriter, r *http.Request) (string, bool) {
	profile := strings.TrimSpace(r.Header.Get("X-Magnetares-Profile"))
	if profile == "" {
		writeJSONError(w, http.StatusBadRequest, "header X-Magnetares-Profile é obrigatório")
		return "", false
	}
	return profile, true
}

func (s *syncService) changes(profile string, cursor int64, limit int) (ChangesPage, error) {
	if s.turso == nil {
		return ChangesPage{}, errors.New("sincronização remota não configurada no servidor")
	}
	_, rows, err := s.turso.Query(`SELECT c.cursor, n.id, n.title, n.body, n.body_text, n.folder, n.folder_id, n.pinned_at, n.checklist_total, n.checklist_open, n.tags, n.revision, n.deleted_at, n.created_at, n.updated_at
		FROM sync_note_changes c JOIN sync_notes n ON n.user_id = c.user_id AND n.id = c.note_id
		WHERE c.user_id = ? AND c.cursor > ? ORDER BY c.cursor ASC LIMIT ?`, profile, cursor, limit+1)
	if err != nil {
		return ChangesPage{}, err
	}
	page := ChangesPage{Changes: make([]Change, 0, len(rows)), NextCursor: strconv.FormatInt(cursor, 10)}
	for index, row := range rows {
		if index == limit {
			page.HasMore = true
			break
		}
		changeCursor, err := tursoInt(row[0])
		if err != nil {
			return ChangesPage{}, err
		}
		note, err := noteFromRow(row[1:])
		if err != nil {
			return ChangesPage{}, err
		}
		page.Changes = append(page.Changes, Change{Cursor: strconv.FormatInt(changeCursor, 10), Note: note})
		page.NextCursor = strconv.FormatInt(changeCursor, 10)
	}
	return page, nil
}

func (s *syncService) putNote(profile, id string, mutation NoteMutation) (MutationResult, *Conflict, error) {
	if s.turso == nil {
		return MutationResult{}, nil, errors.New("sincronização remota não configurada no servidor")
	}
	if existing, cursor, found, err := s.mutationResult(profile, mutation.MutationID); err != nil {
		return MutationResult{}, nil, err
	} else if found {
		return MutationResult{Note: existing, Cursor: strconv.FormatInt(cursor, 10)}, nil, nil
	}

	existing, found, err := s.remoteNote(profile, id)
	if err != nil {
		return MutationResult{}, nil, err
	}
	if found && existing.Revision != mutation.BaseRevision {
		return MutationResult{}, s.conflict(profile, existing, found), nil
	}

	now := time.Now().UTC()
	nextRevision := int64(1)
	createdAt := now
	if found {
		nextRevision = existing.Revision + 1
		createdAt = existing.CreatedAt
	}
	tagsJSON, _ := json.Marshal(mutation.Note.Tags)
	var pinnedAtMilli any = nil
	if mutation.Note.PinnedAt != nil {
		pinnedAtMilli = mutation.Note.PinnedAt.UnixMilli()
	}
	folder := mutation.Note.Folder
	if folder == "" {
		folder = "Notas"
	}
	folderID := mutation.Note.FolderID
	if folderID == "" {
		folderID = "folder-default"
	}
	note := RemoteNote{
		ID:             id,
		Title:          mutation.Note.Title,
		Body:           mutation.Note.Body,
		BodyText:       mutation.Note.BodyText,
		Folder:         folder,
		FolderID:       folderID,
		PinnedAt:       mutation.Note.PinnedAt,
		Tags:           mutation.Note.Tags,
		ChecklistTotal: mutation.Note.ChecklistTotal,
		ChecklistOpen:  mutation.Note.ChecklistOpen,
		Revision:       nextRevision,
		CreatedAt:      createdAt,
		UpdatedAt:      now,
	}
	if note.Tags == nil {
		note.Tags = make([]string, 0)
	}

	if err := s.turso.Execute(`INSERT INTO sync_notes(user_id, id, title, body, body_text, folder, folder_id, pinned_at, checklist_total, checklist_open, tags, revision, deleted_at, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
		ON CONFLICT(user_id, id) DO UPDATE SET title = excluded.title, body = excluded.body, body_text = excluded.body_text,
		folder = excluded.folder, folder_id = excluded.folder_id, pinned_at = excluded.pinned_at,
		checklist_total = excluded.checklist_total, checklist_open = excluded.checklist_open, tags = excluded.tags,
		revision = excluded.revision, deleted_at = NULL, updated_at = excluded.updated_at`,
		profile, note.ID, note.Title, note.Body, note.BodyText, note.Folder, note.FolderID, pinnedAtMilli, note.ChecklistTotal, note.ChecklistOpen, string(tagsJSON), note.Revision, note.CreatedAt.UnixMilli(), note.UpdatedAt.UnixMilli()); err != nil {
		return MutationResult{}, nil, err
	}
	cursor, err := s.recordMutation(profile, mutation.MutationID, note)
	if err != nil {
		return MutationResult{}, nil, err
	}
	return MutationResult{Note: note, Cursor: strconv.FormatInt(cursor, 10)}, nil, nil
}

func (s *syncService) deleteNote(profile, id string, mutation DeleteMutation) (MutationResult, *Conflict, error) {
	if s.turso == nil {
		return MutationResult{}, nil, errors.New("sincronização remota não configurada no servidor")
	}
	if existing, cursor, found, err := s.mutationResult(profile, mutation.MutationID); err != nil {
		return MutationResult{}, nil, err
	} else if found {
		return MutationResult{Note: existing, Cursor: strconv.FormatInt(cursor, 10)}, nil, nil
	}

	existing, found, err := s.remoteNote(profile, id)
	if err != nil {
		return MutationResult{}, nil, err
	}
	if !found || existing.Revision != mutation.BaseRevision {
		return MutationResult{}, s.conflict(profile, existing, found), nil
	}
	deletedAt := time.Now().UTC()
	existing.Revision++
	existing.DeletedAt = &deletedAt
	existing.UpdatedAt = deletedAt
	if err := s.turso.Execute(`UPDATE sync_notes SET revision = ?, deleted_at = ?, updated_at = ?
		WHERE user_id = ? AND id = ? AND revision = ?`, existing.Revision, deletedAt.UnixMilli(), deletedAt.UnixMilli(), profile, id, mutation.BaseRevision); err != nil {
		return MutationResult{}, nil, err
	}
	cursor, err := s.recordMutation(profile, mutation.MutationID, existing)
	if err != nil {
		return MutationResult{}, nil, err
	}
	return MutationResult{Note: existing, Cursor: strconv.FormatInt(cursor, 10)}, nil, nil
}

func (s *syncService) remoteNote(profile, id string) (RemoteNote, bool, error) {
	_, rows, err := s.turso.Query(`SELECT id, title, body, body_text, folder, folder_id, pinned_at, checklist_total, checklist_open, tags, revision, deleted_at, created_at, updated_at
		FROM sync_notes WHERE user_id = ? AND id = ?`, profile, id)
	if err != nil {
		return RemoteNote{}, false, err
	}
	if len(rows) == 0 {
		return RemoteNote{}, false, nil
	}
	note, err := noteFromRow(rows[0])
	return note, true, err
}

func (s *syncService) mutationResult(profile, mutationID string) (RemoteNote, int64, bool, error) {
	_, rows, err := s.turso.Query(`SELECT m.cursor, n.id, n.title, n.body, n.body_text, n.folder, n.folder_id, n.pinned_at, n.checklist_total, n.checklist_open, n.tags, n.revision, n.deleted_at, n.created_at, n.updated_at
		FROM sync_mutations m JOIN sync_notes n ON n.user_id = m.user_id AND n.id = m.note_id
		WHERE m.user_id = ? AND m.mutation_id = ?`, profile, mutationID)
	if err != nil {
		return RemoteNote{}, 0, false, err
	}
	if len(rows) == 0 {
		return RemoteNote{}, 0, false, nil
	}
	cursor, err := tursoInt(rows[0][0])
	if err != nil {
		return RemoteNote{}, 0, false, err
	}
	note, err := noteFromRow(rows[0][1:])
	return note, cursor, true, err
}

func (s *syncService) recordMutation(profile, mutationID string, note RemoteNote) (int64, error) {
	if err := s.turso.Execute(`INSERT INTO sync_note_changes(user_id, note_id, revision, changed_at) VALUES (?, ?, ?, ?)`, profile, note.ID, note.Revision, note.UpdatedAt.UnixMilli()); err != nil {
		return 0, err
	}
	_, rows, err := s.turso.Query(`SELECT cursor FROM sync_note_changes WHERE user_id = ? AND note_id = ? AND revision = ? ORDER BY cursor DESC LIMIT 1`, profile, note.ID, note.Revision)
	if err != nil || len(rows) == 0 {
		return 0, fmt.Errorf("read sync cursor: %w", err)
	}
	cursor, err := tursoInt(rows[0][0])
	if err != nil {
		return 0, err
	}
	if err := s.turso.Execute(`INSERT INTO sync_mutations(user_id, mutation_id, note_id, revision, cursor) VALUES (?, ?, ?, ?, ?)`, profile, mutationID, note.ID, note.Revision, cursor); err != nil {
		return 0, err
	}
	return cursor, nil
}

func (s *syncService) conflict(profile string, note RemoteNote, found bool) *Conflict {
	cursor := int64(0)
	if found {
		_, rows, err := s.turso.Query(`SELECT cursor FROM sync_note_changes WHERE user_id = ? AND note_id = ? ORDER BY cursor DESC LIMIT 1`, profile, note.ID)
		if err == nil && len(rows) > 0 {
			cursor, _ = tursoInt(rows[0][0])
		}
	}
	return &Conflict{Code: "revision_conflict", Note: note, Cursor: strconv.FormatInt(cursor, 10)}
}

func (s *syncService) getFolders(profile string) ([]RemoteFolder, error) {
	if s.turso == nil {
		return nil, errors.New("sincronização remota não configurada no servidor")
	}
	_, rows, err := s.turso.Query(`SELECT id, name, parent_id, COALESCE(color, ''), COALESCE(icon, ''), deleted_at, created_at, updated_at FROM sync_folders WHERE user_id = ? AND deleted_at IS NULL ORDER BY name ASC`, profile)
	if err != nil {
		return nil, err
	}
	folders := make([]RemoteFolder, 0, len(rows))
	for _, row := range rows {
		if len(row) < 8 {
			continue
		}
		createdAt, _ := tursoTime(row[6])
		updatedAt, _ := tursoTime(row[7])
		folder := RemoteFolder{
			ID:        row[0].Value,
			Name:      row[1].Value,
			Color:     row[3].Value,
			Icon:      row[4].Value,
			CreatedAt: createdAt,
			UpdatedAt: updatedAt,
		}
		if row[2].Type != "null" && row[2].Value != "" {
			pID := row[2].Value
			folder.ParentID = &pID
		}
		if row[5].Type != "null" && row[5].Value != "" {
			dTime, err := tursoTime(row[5])
			if err == nil {
				folder.DeletedAt = &dTime
			}
		}
		folders = append(folders, folder)
	}
	return folders, nil
}

func (s *syncService) putFolder(profile string, folder RemoteFolder) error {
	if s.turso == nil {
		return errors.New("sincronização remota não configurada no servidor")
	}
	now := time.Now().UTC().UnixMilli()
	createdAt := now
	if !folder.CreatedAt.IsZero() {
		createdAt = folder.CreatedAt.UnixMilli()
	}
	var parentID any = nil
	if folder.ParentID != nil && *folder.ParentID != "" {
		parentID = *folder.ParentID
	}
	var deletedAt any = nil
	if folder.DeletedAt != nil {
		deletedAt = folder.DeletedAt.UnixMilli()
	}
	return s.turso.Execute(`INSERT INTO sync_folders(user_id, id, name, parent_id, color, icon, deleted_at, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(user_id, id) DO UPDATE SET name = excluded.name, parent_id = excluded.parent_id, color = excluded.color, icon = excluded.icon, deleted_at = excluded.deleted_at, updated_at = excluded.updated_at`,
		profile, folder.ID, folder.Name, parentID, folder.Color, folder.Icon, deletedAt, createdAt, now)
}

func (s *syncService) deleteFolder(profile string, folderID string) error {
	if s.turso == nil {
		return errors.New("sincronização remota não configurada no servidor")
	}
	now := time.Now().UTC().UnixMilli()
	return s.turso.Execute(`UPDATE sync_folders SET deleted_at = ?, updated_at = ? WHERE user_id = ? AND id = ?`, now, now, profile, folderID)
}

func noteFromRow(row []TursoValue) (RemoteNote, error) {
	if len(row) < 14 {
		return RemoteNote{}, errors.New("invalid remote note row")
	}
	checklistTotal, _ := tursoInt(row[7])
	checklistOpen, _ := tursoInt(row[8])
	revision, err := tursoInt(row[10])
	if err != nil {
		return RemoteNote{}, err
	}
	createdAt, err := tursoTime(row[12])
	if err != nil {
		return RemoteNote{}, err
	}
	updatedAt, err := tursoTime(row[13])
	if err != nil {
		return RemoteNote{}, err
	}
	note := RemoteNote{
		ID:             row[0].Value,
		Title:          row[1].Value,
		Body:           row[2].Value,
		BodyText:       row[3].Value,
		Folder:         row[4].Value,
		FolderID:       row[5].Value,
		ChecklistTotal: checklistTotal,
		ChecklistOpen:  checklistOpen,
		Revision:       revision,
		CreatedAt:      createdAt,
		UpdatedAt:      updatedAt,
	}
	if note.Folder == "" {
		note.Folder = "Notas"
	}
	if note.FolderID == "" {
		note.FolderID = "folder-default"
	}
	if row[6].Type != "null" && row[6].Value != "" {
		pTime, err := tursoTime(row[6])
		if err == nil {
			note.PinnedAt = &pTime
		}
	}
	if row[9].Type != "null" && row[9].Value != "" {
		var tags []string
		_ = json.Unmarshal([]byte(row[9].Value), &tags)
		if tags == nil {
			tags = make([]string, 0)
		}
		note.Tags = tags
	} else {
		note.Tags = make([]string, 0)
	}
	if row[11].Type != "null" && row[11].Value != "" {
		deletedAt, err := tursoTime(row[11])
		if err != nil {
			return RemoteNote{}, err
		}
		note.DeletedAt = &deletedAt
	}
	return note, nil
}

func tursoInt(value TursoValue) (int64, error) {
	if value.Type == "null" || value.Value == "" {
		return 0, nil
	}
	return strconv.ParseInt(value.Value, 10, 64)
}

func tursoTime(value TursoValue) (time.Time, error) {
	millis, err := tursoInt(value)
	if err != nil {
		return time.Time{}, err
	}
	return time.UnixMilli(millis).UTC(), nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
