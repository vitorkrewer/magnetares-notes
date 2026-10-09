package main

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"strings"
)

// Sincronização de Listas de Tarefas, Tarefas e Subtarefas com o Turso.
//
// Utiliza a estratégia Last-Write-Wins (LWW) por updated_at nos dois sentidos:
// o push envia o que estiver com sync_state = 'pending'; o pull lê a partição do
// perfil do usuário no Turso e aplica as versões mais recentes localmente.
//
// Ordem de sincronização obrigatória por integridade referencial:
// 1. TaskLists (listas)
// 2. Tasks (tarefas que apontam para listas)
// 3. Subtasks (subtarefas que apontam para tarefas)

func (s *noteStore) syncTaskEntities(turso *TursoClient, profileID string) string {
	if turso == nil {
		return ""
	}

	var failed []string
	if err := s.syncTaskListsDirect(turso, profileID); err != nil {
		log.Printf("sync tasks: listas: %v", err)
		failed = append(failed, "listas de tarefas")
	}
	if err := s.syncTasksDirect(turso, profileID); err != nil {
		log.Printf("sync tasks: tarefas: %v", err)
		failed = append(failed, "tarefas")
	}
	if err := s.syncSubtasksDirect(turso, profileID); err != nil {
		log.Printf("sync tasks: subtarefas: %v", err)
		failed = append(failed, "subtarefas")
	}

	if len(failed) == 0 {
		return ""
	}
	return fmt.Sprintf(" Atenção: falha parcial ao sincronizar %s (detalhes no log).", strings.Join(failed, ", "))
}

// =========================================================================
// 1. TASK LISTS (Listas)
// =========================================================================

func (s *noteStore) syncTaskListsDirect(turso *TursoClient, profileID string) error {
	if turso == nil {
		return nil
	}
	var problems []error

	// Push: enviar listas com sync_state = 'pending'
	rows, err := s.db.Query(`SELECT id, name, color, icon, position, deleted_at, created_at, updated_at FROM task_lists WHERE sync_state = 'pending'`)
	if err != nil {
		return fmt.Errorf("ler task_lists pendentes: %w", err)
	}
	type pendingList struct {
		id, name, color, icon string
		position              float64
		deletedAt             sql.NullInt64
		createdAt, updatedAt  int64
	}
	var pending []pendingList
	for rows.Next() {
		var item pendingList
		if err := rows.Scan(&item.id, &item.name, &item.color, &item.icon, &item.position, &item.deletedAt, &item.createdAt, &item.updatedAt); err != nil {
			problems = append(problems, fmt.Errorf("ler task_list pendente: %w", err))
			continue
		}
		pending = append(pending, item)
	}
	if err := rows.Err(); err != nil {
		problems = append(problems, fmt.Errorf("iterar task_lists pendentes: %w", err))
	}
	_ = rows.Close()

	for _, list := range pending {
		var deletedAt any
		if list.deletedAt.Valid {
			deletedAt = list.deletedAt.Int64
		}
		if err := turso.Execute(`INSERT INTO sync_task_lists(user_id, id, name, color, icon, position, deleted_at, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(user_id, id) DO UPDATE SET
				name = CASE WHEN excluded.updated_at >= updated_at THEN excluded.name ELSE name END,
				color = CASE WHEN excluded.updated_at >= updated_at THEN excluded.color ELSE color END,
				icon = CASE WHEN excluded.updated_at >= updated_at THEN excluded.icon ELSE icon END,
				position = CASE WHEN excluded.updated_at >= updated_at THEN excluded.position ELSE position END,
				deleted_at = CASE WHEN excluded.updated_at >= updated_at THEN excluded.deleted_at ELSE deleted_at END,
				updated_at = MAX(excluded.updated_at, updated_at)`,
			profileID, list.id, list.name, list.color, list.icon, list.position, deletedAt, list.createdAt, list.updatedAt); err != nil {
			problems = append(problems, fmt.Errorf("enviar task_list %s: %w", list.id, err))
			continue
		}

		if _, err := s.db.Exec(`UPDATE task_lists SET sync_state = 'clean' WHERE id = ? AND updated_at = ?`, list.id, list.updatedAt); err != nil {
			problems = append(problems, fmt.Errorf("marcar task_list %s como limpa: %w", list.id, err))
		}
	}

	// Pull: buscar listas remotas
	_, remoteRows, err := turso.Query(`SELECT id, name, color, icon, position, deleted_at, created_at, updated_at
		FROM sync_task_lists WHERE user_id = ? ORDER BY created_at ASC, id ASC`, profileID)
	if err != nil {
		problems = append(problems, fmt.Errorf("buscar task_lists remotas: %w", err))
		return errors.Join(problems...)
	}

	for _, row := range remoteRows {
		if len(row) < 8 {
			continue
		}
		if err := s.applyRemoteTaskList(row); err != nil {
			problems = append(problems, fmt.Errorf("aplicar task_list %s: %w", row[0].Value, err))
		}
	}

	return errors.Join(problems...)
}

func (s *noteStore) applyRemoteTaskList(row []TursoValue) error {
	id := row[0].Value
	name := row[1].Value
	color := row[2].Value
	icon := row[3].Value
	position, err := tursoFloat(row[4])
	if err != nil {
		return fmt.Errorf("posição inválida: %w", err)
	}
	var deletedAt any
	if row[5].Type != "null" && row[5].Value != "" {
		if deletedAt, err = tursoInt(row[5]); err != nil {
			return fmt.Errorf("deleted_at inválido: %w", err)
		}
	}
	createdAt, err := tursoInt(row[6])
	if err != nil {
		return fmt.Errorf("created_at inválido: %w", err)
	}
	updatedAt, err := tursoInt(row[7])
	if err != nil {
		return fmt.Errorf("updated_at inválido: %w", err)
	}

	_, err = s.db.Exec(`INSERT INTO task_lists(id, name, color, icon, position, deleted_at, created_at, updated_at, sync_state)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'clean')
		ON CONFLICT(id) DO UPDATE SET
			name = CASE WHEN updated_at >= excluded.updated_at THEN name ELSE excluded.name END,
			color = CASE WHEN updated_at >= excluded.updated_at THEN color ELSE excluded.color END,
			icon = CASE WHEN updated_at >= excluded.updated_at THEN icon ELSE excluded.icon END,
			position = CASE WHEN updated_at >= excluded.updated_at THEN position ELSE excluded.position END,
			deleted_at = CASE WHEN updated_at >= excluded.updated_at THEN deleted_at ELSE excluded.deleted_at END,
			updated_at = CASE WHEN updated_at >= excluded.updated_at THEN updated_at ELSE excluded.updated_at END,
			sync_state = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN 'pending' ELSE 'clean' END`,
		id, name, color, icon, position, deletedAt, createdAt, updatedAt)
	return err
}

// =========================================================================
// 2. TASKS (Tarefas)
// =========================================================================

func (s *noteStore) syncTasksDirect(turso *TursoClient, profileID string) error {
	if turso == nil {
		return nil
	}
	var problems []error

	// Push: tarefas pendentes
	rows, err := s.db.Query(`SELECT id, list_id, title, notes, completed, completed_at, due_date, priority, position, deleted_at, created_at, updated_at
		FROM tasks WHERE sync_state = 'pending'`)
	if err != nil {
		return fmt.Errorf("ler tasks pendentes: %w", err)
	}
	type pendingTask struct {
		id, listID, title, notes string
		completed                int
		completedAt              sql.NullInt64
		dueDate                  sql.NullString
		priority                 int
		position                 float64
		deletedAt                sql.NullInt64
		createdAt, updatedAt     int64
	}
	var pending []pendingTask
	for rows.Next() {
		var item pendingTask
		if err := rows.Scan(&item.id, &item.listID, &item.title, &item.notes, &item.completed, &item.completedAt, &item.dueDate, &item.priority, &item.position, &item.deletedAt, &item.createdAt, &item.updatedAt); err != nil {
			problems = append(problems, fmt.Errorf("ler task pendente: %w", err))
			continue
		}
		pending = append(pending, item)
	}
	if err := rows.Err(); err != nil {
		problems = append(problems, fmt.Errorf("iterar tasks pendentes: %w", err))
	}
	_ = rows.Close()

	for _, task := range pending {
		var completedAt, deletedAt, dueDate any
		if task.completedAt.Valid {
			completedAt = task.completedAt.Int64
		}
		if task.deletedAt.Valid {
			deletedAt = task.deletedAt.Int64
		}
		if task.dueDate.Valid && task.dueDate.String != "" {
			dueDate = task.dueDate.String
		}

		if err := turso.Execute(`INSERT INTO sync_tasks(user_id, id, list_id, title, notes, completed, completed_at, due_date, priority, position, deleted_at, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(user_id, id) DO UPDATE SET
				list_id = CASE WHEN excluded.updated_at >= updated_at THEN excluded.list_id ELSE list_id END,
				title = CASE WHEN excluded.updated_at >= updated_at THEN excluded.title ELSE title END,
				notes = CASE WHEN excluded.updated_at >= updated_at THEN excluded.notes ELSE notes END,
				completed = CASE WHEN excluded.updated_at >= updated_at THEN excluded.completed ELSE completed END,
				completed_at = CASE WHEN excluded.updated_at >= updated_at THEN excluded.completed_at ELSE completed_at END,
				due_date = CASE WHEN excluded.updated_at >= updated_at THEN excluded.due_date ELSE due_date END,
				priority = CASE WHEN excluded.updated_at >= updated_at THEN excluded.priority ELSE priority END,
				position = CASE WHEN excluded.updated_at >= updated_at THEN excluded.position ELSE position END,
				deleted_at = CASE WHEN excluded.updated_at >= updated_at THEN excluded.deleted_at ELSE deleted_at END,
				updated_at = MAX(excluded.updated_at, updated_at)`,
			profileID, task.id, task.listID, task.title, task.notes, task.completed, completedAt, dueDate, task.priority, task.position, deletedAt, task.createdAt, task.updatedAt); err != nil {
			problems = append(problems, fmt.Errorf("enviar task %s: %w", task.id, err))
			continue
		}

		if _, err := s.db.Exec(`UPDATE tasks SET sync_state = 'clean' WHERE id = ? AND updated_at = ?`, task.id, task.updatedAt); err != nil {
			problems = append(problems, fmt.Errorf("marcar task %s como limpa: %w", task.id, err))
		}
	}

	// Pull: buscar tarefas remotas
	_, remoteRows, err := turso.Query(`SELECT id, list_id, title, notes, completed, completed_at, due_date, priority, position, deleted_at, created_at, updated_at
		FROM sync_tasks WHERE user_id = ?`, profileID)
	if err != nil {
		problems = append(problems, fmt.Errorf("buscar tasks remotas: %w", err))
		return errors.Join(problems...)
	}

	for _, row := range remoteRows {
		if len(row) < 12 {
			continue
		}
		if err := s.applyRemoteTask(row); err != nil {
			problems = append(problems, fmt.Errorf("aplicar task %s: %w", row[0].Value, err))
		}
	}

	return errors.Join(problems...)
}

func (s *noteStore) applyRemoteTask(row []TursoValue) error {
	id := row[0].Value
	listID := row[1].Value
	title := row[2].Value
	notes := row[3].Value
	completed, err := tursoInt(row[4])
	if err != nil {
		return fmt.Errorf("completed inválido: %w", err)
	}
	var completedAt, dueDate, deletedAt any
	if row[5].Type != "null" && row[5].Value != "" {
		if completedAt, err = tursoInt(row[5]); err != nil {
			return fmt.Errorf("completed_at inválido: %w", err)
		}
	}
	if row[6].Type != "null" && row[6].Value != "" {
		dueDate = row[6].Value
	}
	priority, err := tursoInt(row[7])
	if err != nil {
		return fmt.Errorf("priority inválida: %w", err)
	}
	position, err := tursoFloat(row[8])
	if err != nil {
		return fmt.Errorf("position inválida: %w", err)
	}
	if row[9].Type != "null" && row[9].Value != "" {
		if deletedAt, err = tursoInt(row[9]); err != nil {
			return fmt.Errorf("deleted_at inválido: %w", err)
		}
	}
	createdAt, err := tursoInt(row[10])
	if err != nil {
		return fmt.Errorf("created_at inválido: %w", err)
	}
	updatedAt, err := tursoInt(row[11])
	if err != nil {
		return fmt.Errorf("updated_at inválido: %w", err)
	}

	_, err = s.db.Exec(`INSERT INTO tasks(id, list_id, title, notes, completed, completed_at, due_date, priority, position, deleted_at, created_at, updated_at, sync_state)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'clean')
		ON CONFLICT(id) DO UPDATE SET
			list_id = CASE WHEN updated_at >= excluded.updated_at THEN list_id ELSE excluded.list_id END,
			title = CASE WHEN updated_at >= excluded.updated_at THEN title ELSE excluded.title END,
			notes = CASE WHEN updated_at >= excluded.updated_at THEN notes ELSE excluded.notes END,
			completed = CASE WHEN updated_at >= excluded.updated_at THEN completed ELSE excluded.completed END,
			completed_at = CASE WHEN updated_at >= excluded.updated_at THEN completed_at ELSE excluded.completed_at END,
			due_date = CASE WHEN updated_at >= excluded.updated_at THEN due_date ELSE excluded.due_date END,
			priority = CASE WHEN updated_at >= excluded.updated_at THEN priority ELSE excluded.priority END,
			position = CASE WHEN updated_at >= excluded.updated_at THEN position ELSE excluded.position END,
			deleted_at = CASE WHEN updated_at >= excluded.updated_at THEN deleted_at ELSE excluded.deleted_at END,
			updated_at = CASE WHEN updated_at >= excluded.updated_at THEN updated_at ELSE excluded.updated_at END,
			sync_state = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN 'pending' ELSE 'clean' END`,
		id, listID, title, notes, completed, completedAt, dueDate, priority, position, deletedAt, createdAt, updatedAt)
	return err
}

// =========================================================================
// 3. SUBTASKS (Subtarefas)
// =========================================================================

func (s *noteStore) syncSubtasksDirect(turso *TursoClient, profileID string) error {
	if turso == nil {
		return nil
	}
	var problems []error

	// Push: subtarefas pendentes
	rows, err := s.db.Query(`SELECT id, task_id, title, completed, completed_at, position, deleted_at, created_at, updated_at
		FROM subtasks WHERE sync_state = 'pending'`)
	if err != nil {
		return fmt.Errorf("ler subtasks pendentes: %w", err)
	}
	type pendingSubtask struct {
		id, taskID, title    string
		completed            int
		completedAt          sql.NullInt64
		position             float64
		deletedAt            sql.NullInt64
		createdAt, updatedAt int64
	}
	var pending []pendingSubtask
	for rows.Next() {
		var item pendingSubtask
		if err := rows.Scan(&item.id, &item.taskID, &item.title, &item.completed, &item.completedAt, &item.position, &item.deletedAt, &item.createdAt, &item.updatedAt); err != nil {
			problems = append(problems, fmt.Errorf("ler subtask pendente: %w", err))
			continue
		}
		pending = append(pending, item)
	}
	if err := rows.Err(); err != nil {
		problems = append(problems, fmt.Errorf("iterar subtasks pendentes: %w", err))
	}
	_ = rows.Close()

	for _, subtask := range pending {
		var completedAt, deletedAt any
		if subtask.completedAt.Valid {
			completedAt = subtask.completedAt.Int64
		}
		if subtask.deletedAt.Valid {
			deletedAt = subtask.deletedAt.Int64
		}

		if err := turso.Execute(`INSERT INTO sync_subtasks(user_id, id, task_id, title, completed, completed_at, position, deleted_at, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(user_id, id) DO UPDATE SET
				task_id = CASE WHEN excluded.updated_at >= updated_at THEN excluded.task_id ELSE task_id END,
				title = CASE WHEN excluded.updated_at >= updated_at THEN excluded.title ELSE title END,
				completed = CASE WHEN excluded.updated_at >= updated_at THEN excluded.completed ELSE completed END,
				completed_at = CASE WHEN excluded.updated_at >= updated_at THEN excluded.completed_at ELSE completed_at END,
				position = CASE WHEN excluded.updated_at >= updated_at THEN excluded.position ELSE position END,
				deleted_at = CASE WHEN excluded.updated_at >= updated_at THEN excluded.deleted_at ELSE deleted_at END,
				updated_at = MAX(excluded.updated_at, updated_at)`,
			profileID, subtask.id, subtask.taskID, subtask.title, subtask.completed, completedAt, subtask.position, deletedAt, subtask.createdAt, subtask.updatedAt); err != nil {
			problems = append(problems, fmt.Errorf("enviar subtask %s: %w", subtask.id, err))
			continue
		}

		if _, err := s.db.Exec(`UPDATE subtasks SET sync_state = 'clean' WHERE id = ? AND updated_at = ?`, subtask.id, subtask.updatedAt); err != nil {
			problems = append(problems, fmt.Errorf("marcar subtask %s como limpa: %w", subtask.id, err))
		}
	}

	// Pull: buscar subtarefas remotas
	_, remoteRows, err := turso.Query(`SELECT id, task_id, title, completed, completed_at, position, deleted_at, created_at, updated_at
		FROM sync_subtasks WHERE user_id = ?`, profileID)
	if err != nil {
		problems = append(problems, fmt.Errorf("buscar subtasks remotas: %w", err))
		return errors.Join(problems...)
	}

	for _, row := range remoteRows {
		if len(row) < 9 {
			continue
		}
		if err := s.applyRemoteSubtask(row); err != nil {
			problems = append(problems, fmt.Errorf("aplicar subtask %s: %w", row[0].Value, err))
		}
	}

	return errors.Join(problems...)
}

func (s *noteStore) applyRemoteSubtask(row []TursoValue) error {
	id := row[0].Value
	taskID := row[1].Value
	title := row[2].Value
	completed, err := tursoInt(row[3])
	if err != nil {
		return fmt.Errorf("completed inválido: %w", err)
	}
	var completedAt, deletedAt any
	if row[4].Type != "null" && row[4].Value != "" {
		if completedAt, err = tursoInt(row[4]); err != nil {
			return fmt.Errorf("completed_at inválido: %w", err)
		}
	}
	position, err := tursoFloat(row[5])
	if err != nil {
		return fmt.Errorf("position inválida: %w", err)
	}
	if row[6].Type != "null" && row[6].Value != "" {
		if deletedAt, err = tursoInt(row[6]); err != nil {
			return fmt.Errorf("deleted_at inválido: %w", err)
		}
	}
	createdAt, err := tursoInt(row[7])
	if err != nil {
		return fmt.Errorf("created_at inválido: %w", err)
	}
	updatedAt, err := tursoInt(row[8])
	if err != nil {
		return fmt.Errorf("updated_at inválido: %w", err)
	}

	_, err = s.db.Exec(`INSERT INTO subtasks(id, task_id, title, completed, completed_at, position, deleted_at, created_at, updated_at, sync_state)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'clean')
		ON CONFLICT(id) DO UPDATE SET
			task_id = CASE WHEN updated_at >= excluded.updated_at THEN task_id ELSE excluded.task_id END,
			title = CASE WHEN updated_at >= excluded.updated_at THEN title ELSE excluded.title END,
			completed = CASE WHEN updated_at >= excluded.updated_at THEN completed ELSE excluded.completed END,
			completed_at = CASE WHEN updated_at >= excluded.updated_at THEN completed_at ELSE excluded.completed_at END,
			position = CASE WHEN updated_at >= excluded.updated_at THEN position ELSE excluded.position END,
			deleted_at = CASE WHEN updated_at >= excluded.updated_at THEN deleted_at ELSE excluded.deleted_at END,
			updated_at = CASE WHEN updated_at >= excluded.updated_at THEN updated_at ELSE excluded.updated_at END,
			sync_state = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN 'pending' ELSE 'clean' END`,
		id, taskID, title, completed, completedAt, position, deletedAt, createdAt, updatedAt)
	return err
}
