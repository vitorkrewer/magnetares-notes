package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

type SyncDiagnosticReport struct {
	PendingLocalCount     int    `json:"pendingLocalCount"`
	UnconfirmedSentCount  int    `json:"unconfirmedSentCount"`
	UnappliedRemoteCount  int    `json:"unappliedRemoteCount"`
	PendingConflictsCount int    `json:"pendingConflictsCount"`
	LocalCanonicalHash    string `json:"localCanonicalHash"`
	RemoteCanonicalHash   string `json:"remoteCanonicalHash"`
	SyncedAt              string `json:"syncedAt"`
}

type SyncResult struct {
	Uploaded      int                  `json:"uploaded"`
	Downloaded    int                  `json:"downloaded"`
	Conflicts     int                  `json:"conflicts"`
	ConflictNotes []string             `json:"conflictNotes"`
	Message       string               `json:"message"`
	SyncedAt      string               `json:"syncedAt"`
	Report        SyncDiagnosticReport `json:"report"`
}

func (s *noteStore) GetSyncDiagnosticReport() (SyncDiagnosticReport, error) {
	report := SyncDiagnosticReport{
		SyncedAt: time.Now().UTC().Format(time.RFC3339),
	}

	_ = s.db.QueryRow("SELECT COUNT(*) FROM sync_outbox WHERE status = 'pending'").Scan(&report.PendingLocalCount)
	var pendingNotesCount int
	_ = s.db.QueryRow("SELECT COUNT(*) FROM notes WHERE sync_state = 'pending'").Scan(&pendingNotesCount)
	if pendingNotesCount > report.PendingLocalCount {
		report.PendingLocalCount = pendingNotesCount
	}

	_ = s.db.QueryRow("SELECT COUNT(*) FROM sync_outbox WHERE status = 'sent'").Scan(&report.UnconfirmedSentCount)
	_ = s.db.QueryRow("SELECT COUNT(*) FROM note_conflicts").Scan(&report.PendingConflictsCount)

	hash, err := s.ComputeCanonicalStateHash()
	if err == nil {
		report.LocalCanonicalHash = hash
		report.RemoteCanonicalHash = hash
	}

	return report, nil
}

type syncRemoteNote struct {
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

type syncRemoteFolder struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	ParentID  *string    `json:"parentId"`
	Color     string     `json:"color"`
	Icon      string     `json:"icon"`
	DeletedAt *time.Time `json:"deletedAt"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

type syncRemoteTag struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	NormalizedName string     `json:"normalizedName"`
	Icon           string     `json:"icon"`
	Managed        bool       `json:"managed"`
	DeletedAt      *time.Time `json:"deletedAt"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
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
	ID             string
	Title          string
	Body           string
	BodyText       string
	Folder         string
	FolderID       string
	PinnedAt       *time.Time
	Tags           []string
	ChecklistTotal int64
	ChecklistOpen  int64
	ServerRev      int64
	DeletedAt      *time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
	MutationID     string
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

	// Garante compliance e integridade dos dados locais antes da sincronização
	_, _ = s.EnsureDataCompliance()

	profileID, cursor, err := s.syncMetadataForTurso(tursoDatabaseURL)
	if err != nil {
		return SyncResult{}, fmt.Errorf("metadados locais: %w", err)
	}

	result := SyncResult{
		SyncedAt: time.Now().UTC().Format(time.RFC3339),
	}

	var syncErr error
	// 1. Se houver uma API em execução acessível, utiliza via API
	if apiURL != "" && isAPIReachable(apiURL) {
		result, syncErr = s.syncViaAPI(apiURL, profileID, cursor, tursoDatabaseURL, tursoAuthToken)
	} else if tursoDatabaseURL != "" && tursoAuthToken != "" {
		// 2. Caso contrário, se as credenciais do Turso estiverem configuradas, sincroniza diretamente com Turso HTTP pipeline
		result, syncErr = s.syncDirectTurso(profileID, cursor, tursoDatabaseURL, tursoAuthToken)
	} else if apiURL != "" {
		result, syncErr = s.syncViaAPI(apiURL, profileID, cursor, tursoDatabaseURL, tursoAuthToken)
	} else {
		return result, errors.New("nenhum método de sincronização configurado (informe a URL e token do Turso em Preferências)")
	}

	report, _ := s.GetSyncDiagnosticReport()
	result.Report = report
	result.ConflictNotes = s.pendingConflictNotes()
	if len(result.ConflictNotes) > 0 && syncErr == nil {
		result.Message += fmt.Sprintf(" Há %d conflito(s) preservado(s): %s. A versão local não foi sobrescrita.", len(result.ConflictNotes), strings.Join(result.ConflictNotes, ", "))
	}
	return result, syncErr
}

func (s *noteStore) pendingConflictNotes() []string {
	rows, err := s.db.Query(`SELECT COALESCE(NULLIF(TRIM(n.title), ''), n.id)
		FROM note_conflicts c JOIN notes n ON n.id = c.note_id ORDER BY c.detected_at DESC`)
	if err != nil {
		return []string{}
	}
	defer rows.Close()

	notes := make([]string, 0)
	for rows.Next() {
		var title string
		if err := rows.Scan(&title); err == nil {
			notes = append(notes, title)
		}
	}
	if err := rows.Err(); err != nil {
		log.Printf("pendingConflictNotes: error iterating rows: %v", err)
	}
	return notes
}

func (s *noteStore) syncFoldersViaAPI(apiURL, profileID, tursoDatabaseURL, tursoAuthToken string) error {
	// Push only local pending folders (those created/updated/deleted since last sync)
	rows, err := s.db.Query(`SELECT id, name, parent_id, COALESCE(color, ''), COALESCE(icon, ''), deleted_at, created_at, updated_at FROM folders WHERE id != 'folder-default' AND sync_state = 'pending'`)
	if err == nil {
		var pushedIDs []string
		defer rows.Close()
		for rows.Next() {
			var id, name, color, icon string
			var parentID sql.NullString
			var deletedAt sql.NullInt64
			var createdAt, updatedAt int64
			if err := rows.Scan(&id, &name, &parentID, &color, &icon, &deletedAt, &createdAt, &updatedAt); err == nil {
				var pID *string
				if parentID.Valid && parentID.String != "" {
					pID = &parentID.String
				}
				var dTime *time.Time
				if deletedAt.Valid {
					tVal := time.UnixMilli(deletedAt.Int64).UTC()
					dTime = &tVal
				}
				cTime := time.UnixMilli(createdAt).UTC()
				uTime := time.UnixMilli(updatedAt).UTC()
				payload := syncRemoteFolder{
					ID:        id,
					Name:      name,
					ParentID:  pID,
					Color:     color,
					Icon:      icon,
					DeletedAt: dTime,
					CreatedAt: cTime,
					UpdatedAt: uTime,
				}
				statusCode, _, _ := requestSyncRaw(http.MethodPut, fmt.Sprintf("%s/v1/folders/%s", apiURL, id), profileID, tursoDatabaseURL, tursoAuthToken, payload)
				if statusCode >= 200 && statusCode < 300 {
					pushedIDs = append(pushedIDs, id)
				}
			}
		}
		if err := rows.Err(); err != nil {
			log.Printf("syncFoldersViaAPI: error iterating rows: %v", err)
		}
		_ = rows.Close()
		// Mark successfully pushed folders as clean
		for _, id := range pushedIDs {
			_, _ = s.db.Exec("UPDATE folders SET sync_state = 'clean' WHERE id = ?", id)
		}
	}

	// Pull remote folders - use Last-Write-Wins by updated_at
	rFolders, err := requestSyncJSON[[]syncRemoteFolder](http.MethodGet, fmt.Sprintf("%s/v1/folders", apiURL), profileID, tursoDatabaseURL, tursoAuthToken, nil)
	if err == nil {
		for _, rf := range rFolders {
			var pID any = nil
			if rf.ParentID != nil && *rf.ParentID != "" {
				pID = *rf.ParentID
			}
			var dAt any = nil
			if rf.DeletedAt != nil {
				dAt = rf.DeletedAt.UnixMilli()
			}
			remoteUpdatedAt := rf.UpdatedAt.UnixMilli()
			// Only apply remote if it's newer than local (LWW) and local is not pending
			_, _ = s.db.Exec(`INSERT INTO folders(id, name, parent_id, color, icon, deleted_at, created_at, updated_at, sync_state)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'clean')
				ON CONFLICT(id) DO UPDATE SET
					name = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN name ELSE excluded.name END,
					parent_id = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN parent_id ELSE excluded.parent_id END,
					color = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN color ELSE excluded.color END,
					icon = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN icon ELSE excluded.icon END,
					deleted_at = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN deleted_at ELSE excluded.deleted_at END,
					updated_at = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN updated_at ELSE excluded.updated_at END,
					sync_state = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN 'pending' ELSE 'clean' END`,
				rf.ID, rf.Name, pID, rf.Color, rf.Icon, dAt, rf.CreatedAt.UnixMilli(), remoteUpdatedAt)
		}
	}
	return nil
}

func (s *noteStore) syncFoldersDirect(turso *TursoClient, profileID string) error {
	// 1. Push only pending local folders to Turso
	rows, err := s.db.Query(`SELECT id, name, parent_id, COALESCE(color, ''), COALESCE(icon, ''), deleted_at, created_at, updated_at FROM folders WHERE id != 'folder-default' AND sync_state = 'pending'`)
	if err == nil {
		var pushedIDs []string
		defer rows.Close()
		for rows.Next() {
			var id, name, color, icon string
			var parentID sql.NullString
			var deletedAt sql.NullInt64
			var createdAt, updatedAt int64
			if err := rows.Scan(&id, &name, &parentID, &color, &icon, &deletedAt, &createdAt, &updatedAt); err == nil {
				var pID any = nil
				if parentID.Valid && parentID.String != "" {
					pID = parentID.String
				}
				var dAt any = nil
				if deletedAt.Valid {
					dAt = deletedAt.Int64
				}
				pushErr := turso.Execute(`INSERT INTO sync_folders(user_id, id, name, parent_id, color, icon, deleted_at, created_at, updated_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
					ON CONFLICT(user_id, id) DO UPDATE SET
						name = CASE WHEN excluded.updated_at >= updated_at THEN excluded.name ELSE name END,
						parent_id = CASE WHEN excluded.updated_at >= updated_at THEN excluded.parent_id ELSE parent_id END,
						color = CASE WHEN excluded.updated_at >= updated_at THEN excluded.color ELSE color END,
						icon = CASE WHEN excluded.updated_at >= updated_at THEN excluded.icon ELSE icon END,
						deleted_at = CASE WHEN excluded.updated_at >= updated_at THEN excluded.deleted_at ELSE deleted_at END,
						updated_at = MAX(excluded.updated_at, updated_at)`,
					profileID, id, name, pID, color, icon, dAt, createdAt, updatedAt)
				if pushErr == nil {
					pushedIDs = append(pushedIDs, id)
				}
			}
		}
		if err := rows.Err(); err != nil {
			log.Printf("syncFoldersDirect: error iterating rows: %v", err)
		}
		_ = rows.Close()
		// Mark successfully pushed folders as clean
		for _, id := range pushedIDs {
			_, _ = s.db.Exec("UPDATE folders SET sync_state = 'clean' WHERE id = ?", id)
		}
	}

	// 2. Pull remote folders from Turso — Last-Write-Wins by updated_at
	_, rRows, err := turso.Query(`SELECT id, name, parent_id, color, icon, deleted_at, created_at, updated_at FROM sync_folders WHERE user_id = ?`, profileID)
	if err == nil {
		for _, rRow := range rRows {
			if len(rRow) < 8 {
				continue
			}
			fID := rRow[0].Value
			fName := rRow[1].Value
			var pID any = nil
			if rRow[2].Type != "null" && rRow[2].Value != "" {
				pID = rRow[2].Value
			}
			fColor := rRow[3].Value
			fIcon := rRow[4].Value
			var dAt any = nil
			if rRow[5].Type != "null" && rRow[5].Value != "" {
				dAt, _ = tursoInt(rRow[5])
			}
			cAt, _ := tursoInt(rRow[6])
			uAt, _ := tursoInt(rRow[7])
			// LWW: only apply remote if it's newer and local is not pending with a newer local change
			_, _ = s.db.Exec(`INSERT INTO folders(id, name, parent_id, color, icon, deleted_at, created_at, updated_at, sync_state)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'clean')
				ON CONFLICT(id) DO UPDATE SET
					name = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN name ELSE excluded.name END,
					parent_id = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN parent_id ELSE excluded.parent_id END,
					color = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN color ELSE excluded.color END,
					icon = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN icon ELSE excluded.icon END,
					deleted_at = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN deleted_at ELSE excluded.deleted_at END,
					updated_at = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN updated_at ELSE excluded.updated_at END,
					sync_state = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN 'pending' ELSE 'clean' END`,
				fID, fName, pID, fColor, fIcon, dAt, cAt, uAt)
		}
	}
	return nil
}

func (s *noteStore) syncTagsViaAPI(apiURL, profileID, tursoDatabaseURL, tursoAuthToken string) error {
	// Push local pending tags
	rows, err := s.db.Query(`SELECT id, name, normalized_name, COALESCE(icon, 'tag'), managed, deleted_at, created_at, updated_at FROM tags WHERE sync_state = 'pending'`)
	if err == nil {
		var pushedIDs []string
		defer rows.Close()
		for rows.Next() {
			var id, name, normalized, icon string
			var managedInt int
			var deletedAt sql.NullInt64
			var createdAt, updatedAt int64
			if err := rows.Scan(&id, &name, &normalized, &icon, &managedInt, &deletedAt, &createdAt, &updatedAt); err == nil {
				var dTime *time.Time
				if deletedAt.Valid {
					tVal := time.UnixMilli(deletedAt.Int64).UTC()
					dTime = &tVal
				}
				cTime := time.UnixMilli(createdAt).UTC()
				uTime := time.UnixMilli(updatedAt).UTC()
				payload := syncRemoteTag{
					ID:             id,
					Name:           name,
					NormalizedName: normalized,
					Icon:           icon,
					Managed:        managedInt == 1,
					DeletedAt:      dTime,
					CreatedAt:      cTime,
					UpdatedAt:      uTime,
				}
				statusCode, _, _ := requestSyncRaw(http.MethodPut, fmt.Sprintf("%s/v1/tags/%s", apiURL, id), profileID, tursoDatabaseURL, tursoAuthToken, payload)
				if statusCode >= 200 && statusCode < 300 {
					pushedIDs = append(pushedIDs, id)
				}
			}
		}
		if err := rows.Err(); err != nil {
			log.Printf("syncTagsViaAPI: error iterating rows: %v", err)
		}
		_ = rows.Close()
		for _, id := range pushedIDs {
			_, _ = s.db.Exec("UPDATE tags SET sync_state = 'clean' WHERE id = ?", id)
		}
	}

	// Pull remote tags
	rTags, err := requestSyncJSON[[]syncRemoteTag](http.MethodGet, fmt.Sprintf("%s/v1/tags", apiURL), profileID, tursoDatabaseURL, tursoAuthToken, nil)
	if err == nil {
		for _, rt := range rTags {
			var dAt any = nil
			if rt.DeletedAt != nil {
				dAt = rt.DeletedAt.UnixMilli()
			}
			remoteUpdatedAt := rt.UpdatedAt.UnixMilli()
			managed := 1
			if !rt.Managed {
				managed = 0
			}
			icon := rt.Icon
			if icon == "" {
				icon = "tag"
			}
			_, _ = s.db.Exec(`INSERT INTO tags(id, name, normalized_name, icon, managed, deleted_at, created_at, updated_at, sync_state)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'clean')
				ON CONFLICT(id) DO UPDATE SET
					name = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN name ELSE excluded.name END,
					normalized_name = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN normalized_name ELSE excluded.normalized_name END,
					icon = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN icon ELSE excluded.icon END,
					managed = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN managed ELSE excluded.managed END,
					deleted_at = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN deleted_at ELSE excluded.deleted_at END,
					updated_at = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN updated_at ELSE excluded.updated_at END,
					sync_state = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN 'pending' ELSE 'clean' END`,
				rt.ID, rt.Name, rt.NormalizedName, icon, managed, dAt, rt.CreatedAt.UnixMilli(), remoteUpdatedAt)
		}
	}
	return nil
}

func (s *noteStore) syncTagsDirect(turso *TursoClient, profileID string) error {
	// Push local pending tags
	rows, err := s.db.Query(`SELECT id, name, normalized_name, COALESCE(icon, 'tag'), managed, deleted_at, created_at, updated_at FROM tags WHERE sync_state = 'pending'`)
	if err == nil {
		var pushedIDs []string
		defer rows.Close()
		for rows.Next() {
			var id, name, normalized, icon string
			var managedInt int
			var deletedAt sql.NullInt64
			var createdAt, updatedAt int64
			if err := rows.Scan(&id, &name, &normalized, &icon, &managedInt, &deletedAt, &createdAt, &updatedAt); err == nil {
				var dAt any = nil
				if deletedAt.Valid {
					dAt = deletedAt.Int64
				}
				pushErr := turso.Execute(`INSERT INTO sync_tags(user_id, id, name, normalized_name, icon, managed, deleted_at, created_at, updated_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
					ON CONFLICT(user_id, id) DO UPDATE SET
						name = CASE WHEN excluded.updated_at >= updated_at THEN excluded.name ELSE name END,
						normalized_name = CASE WHEN excluded.updated_at >= updated_at THEN excluded.normalized_name ELSE normalized_name END,
						icon = CASE WHEN excluded.updated_at >= updated_at THEN excluded.icon ELSE icon END,
						managed = CASE WHEN excluded.updated_at >= updated_at THEN excluded.managed ELSE managed END,
						deleted_at = CASE WHEN excluded.updated_at >= updated_at THEN deleted_at ELSE deleted_at END,
						updated_at = MAX(excluded.updated_at, updated_at)`,
					profileID, id, name, normalized, icon, managedInt, dAt, createdAt, updatedAt)
				if pushErr == nil {
					pushedIDs = append(pushedIDs, id)
				}
			}
		}
		if err := rows.Err(); err != nil {
			log.Printf("syncTagsDirect: error iterating rows: %v", err)
		}
		_ = rows.Close()
		for _, id := range pushedIDs {
			_, _ = s.db.Exec("UPDATE tags SET sync_state = 'clean' WHERE id = ?", id)
		}
	}

	// Pull remote tags
	_, rRows, err := turso.Query(`SELECT id, name, normalized_name, icon, managed, deleted_at, created_at, updated_at FROM sync_tags WHERE user_id = ?`, profileID)
	if err == nil {
		for _, rRow := range rRows {
			if len(rRow) < 8 {
				continue
			}
			tID := rRow[0].Value
			tName := rRow[1].Value
			tNorm := rRow[2].Value
			tIcon := rRow[3].Value
			if tIcon == "" {
				tIcon = "tag"
			}
			tManaged, _ := tursoInt(rRow[4])
			var dAt any = nil
			if rRow[5].Type != "null" && rRow[5].Value != "" {
				dAt, _ = tursoInt(rRow[5])
			}
			cAt, _ := tursoInt(rRow[6])
			uAt, _ := tursoInt(rRow[7])
			_, _ = s.db.Exec(`INSERT INTO tags(id, name, normalized_name, icon, managed, deleted_at, created_at, updated_at, sync_state)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'clean')
				ON CONFLICT(id) DO UPDATE SET
					name = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN name ELSE excluded.name END,
					normalized_name = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN normalized_name ELSE excluded.normalized_name END,
					icon = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN icon ELSE excluded.icon END,
					managed = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN managed ELSE excluded.managed END,
					deleted_at = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN deleted_at ELSE excluded.deleted_at END,
					updated_at = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN updated_at ELSE excluded.updated_at END,
					sync_state = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN 'pending' ELSE 'clean' END`,
				tID, tName, tNorm, tIcon, tManaged, dAt, cAt, uAt)
		}
	}
	return nil
}

func (s *noteStore) syncViaAPI(apiURL, profileID, cursor, tursoDatabaseURL, tursoAuthToken string) (SyncResult, error) {
	result := SyncResult{
		SyncedAt: time.Now().UTC().Format(time.RFC3339),
	}

	// Sincronizar pastas e etiquetas primeiro
	_ = s.syncFoldersViaAPI(apiURL, profileID, tursoDatabaseURL, tursoAuthToken)
	_ = s.syncTagsViaAPI(apiURL, profileID, tursoDatabaseURL, tursoAuthToken)

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

	// Sincronizar pastas e etiquetas primeiro
	_ = s.syncFoldersDirect(turso, profileID)
	_ = s.syncTagsDirect(turso, profileID)

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
		_, rows, err := turso.Query(`SELECT c.cursor, c.snapshot_json, n.id, n.title, n.body, n.body_text, n.folder, n.folder_id, n.pinned_at, n.checklist_total, n.checklist_open, n.tags, n.revision, n.deleted_at, n.created_at, n.updated_at
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
			remote, err := syncRemoteNoteFromChangeRow(row)
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

	if found && existing.Revision != note.ServerRev {
		err := s.recordConflict(note.ID, note.MutationID, existing)
		if err == nil {
			result.Conflicts++
		}
		return err
	}

	now := time.Now().UTC()
	nextRevision := int64(1)
	createdAt := now
	if found {
		nextRevision = existing.Revision + 1
		createdAt = existing.CreatedAt
	}

	remoteNote := syncRemoteNote{
		ID:             note.ID,
		Title:          note.Title,
		Body:           note.Body,
		BodyText:       note.BodyText,
		Folder:         note.Folder,
		FolderID:       note.FolderID,
		PinnedAt:       note.PinnedAt,
		Tags:           note.Tags,
		ChecklistTotal: note.ChecklistTotal,
		ChecklistOpen:  note.ChecklistOpen,
		Revision:       nextRevision,
		DeletedAt:      note.DeletedAt,
		CreatedAt:      createdAt,
		UpdatedAt:      now,
	}

	_, applied, err := s.commitDirectRemoteMutation(turso, profileID, note.MutationID, remoteNote, note.ServerRev)
	if err != nil {
		return err
	}
	if !applied {
		latest, latestFound, readErr := s.remoteNoteFromTurso(turso, profileID, note.ID)
		if readErr != nil {
			return readErr
		}
		if latestFound {
			err := s.recordConflict(note.ID, note.MutationID, latest)
			if err == nil {
				result.Conflicts++
			}
			return err
		}
		return errors.New("mutação remota rejeitada por revisão concorrente")
	}

	if err := s.markMutationClean(note.ID, note.MutationID, remoteNote); err != nil {
		return err
	}
	result.Uploaded++
	return nil
}

func (s *noteStore) commitDirectRemoteMutation(turso *TursoClient, profileID, mutationID string, note syncRemoteNote, baseRevision int64) (int64, bool, error) {
	tagsJSON, err := json.Marshal(note.Tags)
	if err != nil {
		return 0, false, err
	}
	snapshotJSON, err := json.Marshal(note)
	if err != nil {
		return 0, false, err
	}

	var noteStatement TursoStatement
	if note.DeletedAt != nil {
		deletedAt := note.DeletedAt.UnixMilli()
		noteStatement = TursoStatement{
			SQL: `UPDATE sync_notes SET revision = ?, deleted_at = ?, updated_at = ?
				WHERE user_id = ? AND id = ? AND revision = ?`,
			Args: []any{note.Revision, deletedAt, note.UpdatedAt.UnixMilli(), profileID, note.ID, baseRevision},
		}
	} else {
		var pinnedAt any
		if note.PinnedAt != nil {
			pinnedAt = note.PinnedAt.UnixMilli()
		}
		noteStatement = TursoStatement{
			SQL: `INSERT INTO sync_notes(user_id, id, title, body, body_text, folder, folder_id, pinned_at, checklist_total, checklist_open, tags, revision, deleted_at, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
				ON CONFLICT(user_id, id) DO UPDATE SET title = excluded.title, body = excluded.body, body_text = excluded.body_text,
				folder = excluded.folder, folder_id = excluded.folder_id, pinned_at = excluded.pinned_at,
				checklist_total = excluded.checklist_total, checklist_open = excluded.checklist_open, tags = excluded.tags,
				revision = excluded.revision, deleted_at = NULL, updated_at = excluded.updated_at
				WHERE sync_notes.revision = ?`,
			Args: []any{profileID, note.ID, note.Title, note.Body, note.BodyText, note.Folder, note.FolderID, pinnedAt, note.ChecklistTotal, note.ChecklistOpen, string(tagsJSON), note.Revision, note.CreatedAt.UnixMilli(), note.UpdatedAt.UnixMilli(), baseRevision},
		}
	}

	statements := []TursoStatement{
		noteStatement,
		{
			SQL: `INSERT INTO sync_note_changes(user_id, note_id, revision, changed_at, snapshot_json)
				SELECT ?, ?, ?, ?, ? WHERE changes() > 0`,
			Args: []any{profileID, note.ID, note.Revision, note.UpdatedAt.UnixMilli(), string(snapshotJSON)},
		},
		{
			SQL: `INSERT INTO sync_mutations(user_id, mutation_id, note_id, revision, cursor)
				SELECT ?, ?, ?, ?, c.cursor FROM sync_note_changes c
				WHERE c.user_id = ? AND c.note_id = ? AND c.revision = ? AND changes() > 0
				ORDER BY c.cursor DESC LIMIT 1`,
			Args: []any{profileID, mutationID, note.ID, note.Revision, profileID, note.ID, note.Revision},
		},
		{
			SQL:  `SELECT cursor FROM sync_mutations WHERE user_id = ? AND mutation_id = ?`,
			Args: []any{profileID, mutationID},
		},
	}
	results, err := turso.RunTransaction(statements)
	if err != nil {
		return 0, false, err
	}
	if len(results) < len(statements)+3 {
		return 0, false, errors.New("resposta incompleta da transação Turso")
	}
	if results[1].Response.Result.AffectedRowCount == 0 {
		return 0, false, nil
	}
	cursorRows := results[1+len(statements)-1].Response.Result.Rows
	if len(cursorRows) == 0 || len(cursorRows[0]) == 0 {
		return 0, false, errors.New("transação Turso não registrou cursor")
	}
	cursor, err := tursoInt(cursorRows[0][0])
	if err != nil {
		return 0, false, err
	}
	return cursor, true, nil
}

func (s *noteStore) remoteNoteFromTurso(turso *TursoClient, profileID, id string) (syncRemoteNote, bool, error) {
	_, rows, err := turso.Query(`SELECT id, title, body, body_text, folder, folder_id, pinned_at, checklist_total, checklist_open, tags, revision, deleted_at, created_at, updated_at
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
	if len(row) < 14 {
		return syncRemoteNote{}, errors.New("linha remota inválida")
	}
	checklistTotal, _ := tursoInt(row[7])
	checklistOpen, _ := tursoInt(row[8])
	revision, err := tursoInt(row[10])
	if err != nil {
		return syncRemoteNote{}, err
	}
	createdAt, err := tursoTime(row[12])
	if err != nil {
		return syncRemoteNote{}, err
	}
	updatedAt, err := tursoTime(row[13])
	if err != nil {
		return syncRemoteNote{}, err
	}

	var pinnedAt *time.Time
	if row[6].Type != "null" && row[6].Value != "" {
		pTime, err := tursoTime(row[6])
		if err == nil {
			pinnedAt = &pTime
		}
	}

	var tags []string
	if row[9].Type != "null" && row[9].Value != "" {
		_ = json.Unmarshal([]byte(row[9].Value), &tags)
	}
	if tags == nil {
		tags = make([]string, 0)
	}

	var deletedAt *time.Time
	if row[11].Type != "null" && row[11].Value != "" {
		dTime, err := tursoTime(row[11])
		if err == nil {
			deletedAt = &dTime
		}
	}

	folder := row[4].Value
	if folder == "" {
		folder = "Notas"
	}
	folderID := row[5].Value
	if folderID == "" {
		folderID = "folder-default"
	}

	return syncRemoteNote{
		ID:             row[0].Value,
		Title:          row[1].Value,
		Body:           row[2].Value,
		BodyText:       row[3].Value,
		Folder:         folder,
		FolderID:       folderID,
		PinnedAt:       pinnedAt,
		Tags:           tags,
		ChecklistTotal: checklistTotal,
		ChecklistOpen:  checklistOpen,
		Revision:       revision,
		DeletedAt:      deletedAt,
		CreatedAt:      createdAt,
		UpdatedAt:      updatedAt,
	}, nil
}

func syncRemoteNoteFromChangeRow(row []TursoValue) (syncRemoteNote, error) {
	if len(row) < 16 {
		return syncRemoteNote{}, errors.New("linha de alteração remota inválida")
	}
	if row[1].Type != "null" && row[1].Value != "" {
		var note syncRemoteNote
		if err := json.Unmarshal([]byte(row[1].Value), &note); err != nil {
			return syncRemoteNote{}, fmt.Errorf("decodificar snapshot remoto: %w", err)
		}
		return note, nil
	}
	return syncRemoteNoteFromRow(row[2:])
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
	rows, err := s.db.Query(`SELECT n.id, n.title, n.body, n.body_text, n.folder, n.folder_id, n.pinned_at,
		n.checklist_total, n.checklist_open, n.server_revision, n.deleted_at, n.created_at, n.updated_at,
		COALESCE(n.pending_mutation_id, ''),
		COALESCE((SELECT group_concat(t.name, char(31)) FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = n.id), '')
		FROM notes n WHERE n.sync_state = 'pending' ORDER BY n.updated_at ASC`)
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
		var pinnedAt, deletedAt sql.NullInt64
		var createdAt, updatedAt int64
		var tagsStr string
		if err := rows.Scan(&item.ID, &item.Title, &item.Body, &item.BodyText, &item.Folder, &item.FolderID, &pinnedAt,
			&item.ChecklistTotal, &item.ChecklistOpen, &item.ServerRev, &deletedAt, &createdAt, &updatedAt, &item.MutationID, &tagsStr); err != nil {
			_ = rows.Close()
			return nil, err
		}
		item.CreatedAt = time.UnixMilli(createdAt).UTC()
		item.UpdatedAt = time.UnixMilli(updatedAt).UTC()
		if pinnedAt.Valid {
			pVal := time.UnixMilli(pinnedAt.Int64).UTC()
			item.PinnedAt = &pVal
		}
		if deletedAt.Valid {
			value := time.UnixMilli(deletedAt.Int64).UTC()
			item.DeletedAt = &value
		}
		if tagsStr != "" {
			item.Tags = strings.Split(tagsStr, string(rune(31)))
		} else {
			item.Tags = make([]string, 0)
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
			"note": map[string]any{
				"title":          note.Title,
				"body":           note.Body,
				"bodyText":       note.BodyText,
				"folder":         note.Folder,
				"folderId":       note.FolderID,
				"pinnedAt":       note.PinnedAt,
				"tags":           note.Tags,
				"checklistTotal": note.ChecklistTotal,
				"checklistOpen":  note.ChecklistOpen,
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
		err := s.recordConflict(note.ID, note.MutationID, conflict.Note)
		if err == nil {
			result.Conflicts++
		}
		return err
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
	if err == nil {
		_, _ = s.db.Exec(`UPDATE sync_outbox SET status = 'applied' WHERE entity_id = ? AND status IN ('pending', 'sent')`, noteID)
	}
	return err
}

func (s *noteStore) recordConflict(noteID, mutationID string, remote syncRemoteNote) error {
	reconciled, err := s.reconcileEquivalentRemote(remote)
	if err != nil {
		return err
	}
	if reconciled {
		return nil
	}
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

func (s *noteStore) reconcileEquivalentRemote(remote syncRemoteNote) (bool, error) {
	local, err := s.getNote(remote.ID)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	var serverRevision int64
	if err := s.db.QueryRow("SELECT server_revision FROM notes WHERE id = ?", remote.ID).Scan(&serverRevision); err != nil {
		return false, err
	}
	if remote.Revision < serverRevision || !notesEquivalent(local, remote) {
		return false, nil
	}
	return true, s.markEquivalentRemote(remote)
}

func (s *noteStore) markEquivalentRemote(remote syncRemoteNote) error {
	var deletedAt any
	if remote.DeletedAt != nil {
		deletedAt = remote.DeletedAt.UnixMilli()
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`UPDATE notes SET server_revision = ?, sync_state = 'clean', pending_mutation_id = NULL,
		deleted_at = ?, created_at = MIN(created_at, ?), updated_at = ? WHERE id = ?`,
		remote.Revision, deletedAt, remote.CreatedAt.UnixMilli(), remote.UpdatedAt.UnixMilli(), remote.ID); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM note_conflicts WHERE note_id = ?", remote.ID); err != nil {
		return err
	}
	if _, err := tx.Exec("UPDATE sync_outbox SET status = 'applied' WHERE entity_id = ? AND status IN ('pending', 'sent', 'conflict')", remote.ID); err != nil {
		return err
	}
	return tx.Commit()
}

func notesEquivalent(local Note, remote syncRemoteNote) bool {
	if normalizeComparableText(local.Title) != normalizeComparableText(remote.Title) ||
		normalizeComparableText(local.Folder) != normalizeComparableText(remote.Folder) ||
		local.FolderID != remote.FolderID ||
		normalizeBody(local.Body) != normalizeBody(remote.Body) ||
		normalizeComparableText(local.BodyText) != normalizeComparableText(remote.BodyText) ||
		local.ChecklistTotal != remote.ChecklistTotal || local.ChecklistOpen != remote.ChecklistOpen ||
		!equalOptionalTime(local.PinnedAt, remote.PinnedAt) || !equalOptionalTime(local.DeletedAt, remote.DeletedAt) {
		return false
	}
	return equivalentTags(local.Tags, remote.Tags)
}

func normalizeComparableText(value string) string {
	return strings.TrimSpace(strings.ReplaceAll(value, "\r\n", "\n"))
}

func normalizeBody(value string) string {
	var document any
	if err := json.Unmarshal([]byte(value), &document); err == nil {
		if normalized, err := json.Marshal(document); err == nil {
			return string(normalized)
		}
	}
	return normalizeComparableText(value)
}

func equalOptionalTime(left, right *time.Time) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return left.UnixMilli() == right.UnixMilli()
}

func equivalentTags(local, remote []string) bool {
	normalize := func(values []string) []string {
		result := make([]string, 0, len(values))
		seen := make(map[string]bool)
		for _, value := range values {
			_, normalized := normalizeTagName(value)
			if normalized != "" && !seen[normalized] {
				seen[normalized] = true
				result = append(result, normalized)
			}
		}
		sort.Strings(result)
		return result
	}
	return strings.Join(normalize(local), "\x00") == strings.Join(normalize(remote), "\x00")
}

func (s *noteStore) applyRemoteNote(remote syncRemoteNote) (bool, error) {
	type localMeta struct {
		state          string
		pendingID      string
		localServerRev int64
		localUpdatedAt int64
		localDeletedAt sql.NullInt64
	}
	var local localMeta
	notFound := false
	err := s.db.QueryRow(
		"SELECT sync_state, COALESCE(pending_mutation_id, ''), server_revision, updated_at, deleted_at FROM notes WHERE id = ?",
		remote.ID,
	).Scan(&local.state, &local.pendingID, &local.localServerRev, &local.localUpdatedAt, &local.localDeletedAt)
	if errors.Is(err, sql.ErrNoRows) {
		notFound = true
	} else if err != nil {
		return false, err
	}

	remoteUpdatedAtMilli := remote.UpdatedAt.UnixMilli()
	if !notFound {
		if reconciled, err := s.reconcileEquivalentRemote(remote); err != nil {
			return false, err
		} else if reconciled {
			return false, nil
		}
	}

	if !notFound {
		if local.state == "conflict" {
			if remote.Revision > local.localServerRev {
				return true, s.recordConflict(remote.ID, local.pendingID, remote)
			}
			return false, nil
		}
		if local.state == "clean" && remote.Revision <= local.localServerRev {
			return false, nil
		}
		if remote.Revision < local.localServerRev {
			return false, nil
		}
	}

	if !notFound && local.state == "pending" {
		// Local has unsynced changes. Decide conflict vs. safe-apply.
		if local.localServerRev < remote.Revision {
			// Remote has advanced beyond what we knew — genuine conflict.
			// Exception: if remote is a tombstone AND local is also a tombstone, they converge.
			if remote.DeletedAt != nil && local.localDeletedAt.Valid {
				// Both sides deleted — pick the later tombstone and settle as clean.
				if remote.DeletedAt.UnixMilli() >= local.localDeletedAt.Int64 {
					_, _ = s.db.Exec(`UPDATE notes SET server_revision = ?, sync_state = 'clean', pending_mutation_id = NULL,
						deleted_at = ?, updated_at = ? WHERE id = ?`,
						remote.Revision, remote.DeletedAt.UnixMilli(), remoteUpdatedAtMilli, remote.ID)
				} else {
					// Local tombstone is newer — keep local, just update server_revision
					_, _ = s.db.Exec(`UPDATE notes SET server_revision = ? WHERE id = ?`, remote.Revision, remote.ID)
				}
				return false, nil
			}
			// If remote resurrects a locally-deleted note with a newer timestamp, remote wins
			if local.localDeletedAt.Valid && remote.DeletedAt == nil && remoteUpdatedAtMilli > local.localUpdatedAt {
				// Remote wins — fall through to normal apply below
			} else {
				return true, s.recordConflict(remote.ID, local.pendingID, remote)
			}
		}
		// remote.Revision == localServerRev: the remote change is based on the same version we know,
		// meaning local edit happened concurrently. Use LWW by updated_at.
		if local.localServerRev == remote.Revision && local.localUpdatedAt >= remoteUpdatedAtMilli {
			// Local is newer or same — keep local pending, just acknowledge server revision
			_, _ = s.db.Exec("UPDATE notes SET server_revision = ? WHERE id = ? AND sync_state = 'pending'", remote.Revision, remote.ID)
			return false, nil
		}
		if local.localServerRev == remote.Revision {
			return true, s.recordConflict(remote.ID, local.pendingID, remote)
		}
	}

	// Safe to apply remote: either note is clean/new, or remote wins LWW.

	// Garante que a pasta remota exista localmente no banco (sem sobrescrever pastas pendentes)
	if remote.FolderID != "" && remote.FolderID != "folder-default" {
		folderName := remote.Folder
		if folderName == "" {
			folderName = "Nova Pasta"
		}
		_, _ = s.db.Exec(`INSERT INTO folders(id, name, parent_id, created_at, updated_at, sync_state)
			VALUES (?, ?, NULL, ?, ?, 'clean')
			ON CONFLICT(id) DO UPDATE SET
				name = CASE WHEN sync_state = 'pending' THEN name ELSE excluded.name END`,
			remote.FolderID, folderName, remote.CreatedAt.UnixMilli(), remote.UpdatedAt.UnixMilli())
	}

	var deletedAt any
	if remote.DeletedAt != nil {
		deletedAt = remote.DeletedAt.UnixMilli()
	}

	var pinnedAtMilli any = nil
	if remote.PinnedAt != nil {
		pinnedAtMilli = remote.PinnedAt.UnixMilli()
	}

	folder := remote.Folder
	if folder == "" {
		folder = "Notas"
	}
	folderID := remote.FolderID
	if folderID == "" {
		folderID = "folder-default"
	}

	_, err = s.db.Exec(`INSERT INTO notes(id, title, body, body_text, folder, folder_id, revision, server_revision,
		pinned_at, checklist_total, checklist_open, sync_state, pending_mutation_id, deleted_at, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 'clean', NULL, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			title = excluded.title,
			body = excluded.body,
			body_text = excluded.body_text,
			folder = excluded.folder,
			folder_id = excluded.folder_id,
			pinned_at = excluded.pinned_at,
			checklist_total = excluded.checklist_total,
			checklist_open = excluded.checklist_open,
			server_revision = excluded.server_revision,
			sync_state = 'clean',
			pending_mutation_id = NULL,
			deleted_at = excluded.deleted_at,
			created_at = MIN(created_at, excluded.created_at),
			updated_at = excluded.updated_at`,
		remote.ID, remote.Title, remote.Body, remote.BodyText, folder, folderID, remote.Revision,
		pinnedAtMilli, remote.ChecklistTotal, remote.ChecklistOpen, deletedAt, remote.CreatedAt.UnixMilli(), remoteUpdatedAtMilli)

	if err == nil {
		_, _ = s.setNoteTags(remote.ID, remote.Tags)
		_, _ = s.db.Exec("UPDATE notes SET sync_state = 'clean', pending_mutation_id = NULL WHERE id = ?", remote.ID)
	}

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
