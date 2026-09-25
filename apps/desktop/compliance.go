package main

import (
	"fmt"
	"log"
	"time"
)

type ComplianceReport struct {
	Passed              bool     `json:"passed"`
	RepairedNotes       int      `json:"repairedNotes"`
	RepairedFolders     int      `json:"repairedFolders"`
	OrphanNotesFixed    int      `json:"orphanNotesFixed"`
	ChecklistsCorrected int      `json:"checklistsCorrected"`
	OrphanTagsCleaned   int      `json:"orphanTagsCleaned"`
	Details             []string `json:"details"`
	AuditedAt           string   `json:"auditedAt"`
}

func (s *noteStore) EnsureDataCompliance() (ComplianceReport, error) {
	report := ComplianceReport{
		Passed:    true,
		Details:   make([]string, 0),
		AuditedAt: time.Now().UTC().Format(time.RFC3339),
	}

	tx, err := s.db.Begin()
	if err != nil {
		return report, fmt.Errorf("iniciar transação de compliance: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	now := time.Now().UTC().UnixMilli()

	// 1. Garantir existência da pasta padrão 'folder-default' ('Notas')
	_, err = tx.Exec(`INSERT INTO folders(id, name, parent_id, color, icon, created_at, updated_at)
		VALUES ('folder-default', 'Notas', NULL, '#6366f1', 'folder', ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			color = CASE WHEN folders.color IS NULL OR folders.color = '' THEN '#6366f1' ELSE folders.color END,
			icon = CASE WHEN folders.icon IS NULL OR folders.icon = '' THEN 'folder' ELSE folders.icon END`, now, now)
	if err != nil {
		return report, fmt.Errorf("compliance pasta padrão: %w", err)
	}

	// 2. Corrigir pastas legadas com parent_id inválido ou auto-referenciado
	res, err := tx.Exec(`UPDATE folders SET parent_id = NULL, updated_at = ?
		WHERE parent_id IS NOT NULL AND (parent_id = id OR parent_id NOT IN (SELECT id FROM folders))`, now)
	if err == nil {
		if affected, _ := res.RowsAffected(); affected > 0 {
			report.RepairedFolders += int(affected)
			report.Details = append(report.Details, fmt.Sprintf("Corrigidas %d pastas com hierarquia/parent_id inválido", affected))
		}
	}

	// 3. Preencher cor e ícone padrão em pastas legadas com valores nulos ou vazios
	res, err = tx.Exec(`UPDATE folders SET
		color = CASE WHEN color IS NULL OR color = '' THEN '#6366f1' ELSE color END,
		icon = CASE WHEN icon IS NULL OR icon = '' THEN 'folder' ELSE icon END
		WHERE color IS NULL OR color = '' OR icon IS NULL OR icon = ''`)
	if err == nil {
		if affected, _ := res.RowsAffected(); affected > 0 {
			report.RepairedFolders += int(affected)
			report.Details = append(report.Details, fmt.Sprintf("Preenchidas cores/ícones padrão em %d pastas legadas", affected))
		}
	}

	// 4. Corrigir notas órfãs (folder_id nulo/vazio ou pasta inexistente no banco)
	res, err = tx.Exec(`UPDATE notes SET folder_id = 'folder-default', folder = 'Notas', sync_state = 'pending', updated_at = ?
		WHERE folder_id IS NULL OR folder_id = '' OR folder_id NOT IN (SELECT id FROM folders)`, now)
	if err == nil {
		if affected, _ := res.RowsAffected(); affected > 0 {
			report.OrphanNotesFixed += int(affected)
			report.RepairedNotes += int(affected)
			report.Details = append(report.Details, fmt.Sprintf("Reatribuídas %d notas órfãs para a pasta padrão (Notas)", affected))
		}
	}

	// 5. Corrigir incompatibilidade entre note.folder (nome textual) e folders.name
	res, err = tx.Exec(`UPDATE notes SET folder = (SELECT f.name FROM folders f WHERE f.id = notes.folder_id), sync_state = 'pending', updated_at = ?
		WHERE folder_id IN (SELECT id FROM folders) AND folder != (SELECT f.name FROM folders f WHERE f.id = notes.folder_id)`, now)
	if err == nil {
		if affected, _ := res.RowsAffected(); affected > 0 {
			report.RepairedNotes += int(affected)
			report.Details = append(report.Details, fmt.Sprintf("Sincronizados nomes de pastas em %d notas", affected))
		}
	}

	// 6. Corrigir timestamps nulos ou inválidos nas notas (created_at <= 0 ou updated_at <= 0)
	res, err = tx.Exec(`UPDATE notes SET
		created_at = CASE WHEN created_at <= 0 THEN ? ELSE created_at END,
		updated_at = CASE WHEN updated_at <= 0 THEN ? ELSE updated_at END,
		sync_state = 'pending'
		WHERE created_at <= 0 OR updated_at <= 0`, now, now)
	if err == nil {
		if affected, _ := res.RowsAffected(); affected > 0 {
			report.RepairedNotes += int(affected)
			report.Details = append(report.Details, fmt.Sprintf("Corrigidos timestamps em %d notas", affected))
		}
	}

	// 7. Recalcular e verificar projeções de checklist (checklist_total & checklist_open)
	rows, err := tx.Query(`SELECT id, body, checklist_total, checklist_open FROM notes WHERE body IS NOT NULL AND body != ''`)
	if err == nil {
		defer rows.Close()
		type checklistPatch struct {
			id    string
			total int64
			open  int64
		}
		var patches []checklistPatch
		for rows.Next() {
			var id, body string
			var storedTotal, storedOpen int64
			if err := rows.Scan(&id, &body, &storedTotal, &storedOpen); err == nil {
				calcTotal, calcOpen := countChecklistItems(body)
				if calcTotal != storedTotal || calcOpen != storedOpen {
					patches = append(patches, checklistPatch{id: id, total: calcTotal, open: calcOpen})
				}
			}
		}
		if err := rows.Err(); err != nil {
			log.Printf("EnsureDataCompliance: error iterating checklist rows: %v", err)
		}

		for _, p := range patches {
			if _, err := tx.Exec(`UPDATE notes SET checklist_total = ?, checklist_open = ?, sync_state = 'pending', updated_at = ? WHERE id = ?`, p.total, p.open, now, p.id); err == nil {
				report.ChecklistsCorrected++
				report.RepairedNotes++
			}
		}
		if report.ChecklistsCorrected > 0 {
			report.Details = append(report.Details, fmt.Sprintf("Recalculados metadados de checklist em %d notas", report.ChecklistsCorrected))
		}
	}

	// 8. Limpar associações de tags órfãs (note_tags apontando para notas ou tags inexistentes)
	res, err = tx.Exec(`DELETE FROM note_tags WHERE note_id NOT IN (SELECT id FROM notes) OR tag_id NOT IN (SELECT id FROM tags)`)
	if err == nil {
		if affected, _ := res.RowsAffected(); affected > 0 {
			report.OrphanTagsCleaned += int(affected)
			report.Details = append(report.Details, fmt.Sprintf("Removidas %d associações de etiquetas órfãs", affected))
		}
	}

	// 9. Limpar conflitos falsos (onde a nota remota registrada possuía revisão 0 ou ID vazio)
	res, err = tx.Exec(`DELETE FROM note_conflicts WHERE server_revision = 0 OR server_note_json LIKE '%"id":""%'`)
	if err == nil {
		if affected, _ := res.RowsAffected(); affected > 0 {
			report.Details = append(report.Details, fmt.Sprintf("Removidos %d registros de conflitos falsos", affected))
		}
	}

	// 10. Restaurar notas com conflito falso para 'pending' e server_revision = 0 para permitir upload à nuvem
	res, err = tx.Exec(`UPDATE notes SET sync_state = 'pending', server_revision = 0, updated_at = ?
		WHERE sync_state = 'conflict' AND id NOT IN (SELECT note_id FROM note_conflicts)`, now)
	if err == nil {
		if affected, _ := res.RowsAffected(); affected > 0 {
			report.RepairedNotes += int(affected)
			report.Details = append(report.Details, fmt.Sprintf("Restauradas %d notas em falso conflito para sincronização com a nuvem", affected))
		}
	}

	// 11. Garantir sync_state válido ('pending', 'clean', 'conflict')
	res, err = tx.Exec(`UPDATE notes SET sync_state = 'pending' WHERE sync_state IS NULL OR sync_state NOT IN ('pending', 'clean', 'conflict')`)
	if err == nil {
		if affected, _ := res.RowsAffected(); affected > 0 {
			report.RepairedNotes += int(affected)
			report.Details = append(report.Details, fmt.Sprintf("Corrigido estado de sincronização em %d notas", affected))
		}
	}

	if err := tx.Commit(); err != nil {
		return report, fmt.Errorf("commit compliance: %w", err)
	}

	if len(report.Details) == 0 {
		report.Details = append(report.Details, "Banco de dados em conformidade e integridade total. Nenhuma inconsistência encontrada.")
	}

	return report, nil
}
