package main

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

const (
	defaultTaskListID   = "list-inbox"
	defaultTaskListName = "Entrada"
	defaultTaskListColor = "blue"
	defaultTaskListIcon  = "inbox"

	maxTaskListNameLen = 80
	maxTaskTitleLen    = 250
	maxTaskNotesLen    = 15000
	maxSubtaskTitleLen = 200

	taskListPositionEpsilon = 1e-9
)

// TaskList é uma lista de tarefas (ex: Entrada, Pessoal, Trabalho, Projetos).
type TaskList struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Color     string    `json:"color"`
	Icon      string    `json:"icon"`
	Position  float64   `json:"position"`
	TaskCount int64     `json:"taskCount"`     // Tarefas ativas (não concluídas)
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// Subtask é um subitem de checklist dentro de uma tarefa.
type Subtask struct {
	ID          string     `json:"id"`
	TaskID      string     `json:"taskId"`
	Title       string     `json:"title"`
	Completed   bool       `json:"completed"`
	CompletedAt *time.Time `json:"completedAt"`
	Position    float64    `json:"position"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

// Task é a entidade principal de afazer.
type Task struct {
	ID           string     `json:"id"`
	ListID       string     `json:"listId"`
	Title        string     `json:"title"`
	Notes        string     `json:"notes"`
	Completed    bool       `json:"completed"`
	CompletedAt  *time.Time `json:"completedAt"`
	DueDate      *string    `json:"dueDate"`      // Formato YYYY-MM-DD
	Priority     int        `json:"priority"`     // 0=Nenhuma, 1=Alta, 2=Média, 3=Baixa
	Position     float64    `json:"position"`
	Subtasks     []Subtask  `json:"subtasks"`
	SubtaskTotal int64      `json:"subtaskTotal"`
	SubtaskDone  int64      `json:"subtaskDone"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
}

// ==========================================
// MÉTODOS DE LISTAS (TaskLists)
// ==========================================

func (s *noteStore) ListTaskLists() ([]TaskList, error) {
	rows, err := s.db.Query(`
		SELECT l.id, l.name, l.color, l.icon, l.position, l.created_at, l.updated_at,
		       COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.completed = 0) AS open_task_count
		FROM task_lists l
		LEFT JOIN tasks t ON t.list_id = l.id
		WHERE l.deleted_at IS NULL
		GROUP BY l.id
		ORDER BY l.position ASC, l.created_at ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("listar task lists: %w", err)
	}
	defer rows.Close()

	var lists []TaskList
	for rows.Next() {
		var l TaskList
		var createdAt, updatedAt int64
		if err := rows.Scan(&l.ID, &l.Name, &l.Color, &l.Icon, &l.Position, &createdAt, &updatedAt, &l.TaskCount); err != nil {
			return nil, fmt.Errorf("scan task list: %w", err)
		}
		l.CreatedAt = time.UnixMilli(createdAt).UTC()
		l.UpdatedAt = time.UnixMilli(updatedAt).UTC()
		lists = append(lists, l)
	}
	if lists == nil {
		lists = []TaskList{}
	}
	return lists, nil
}

func (s *noteStore) SaveTaskList(list TaskList) (TaskList, error) {
	name := strings.TrimSpace(list.Name)
	if name == "" {
		return TaskList{}, errors.New("o nome da lista não pode ser vazio")
	}
	if utf8.RuneCountInString(name) > maxTaskListNameLen {
		return TaskList{}, fmt.Errorf("o nome da lista pode ter no máximo %d caracteres", maxTaskListNameLen)
	}

	color := strings.TrimSpace(list.Color)
	if color == "" {
		color = defaultTaskListColor
	}
	icon := strings.TrimSpace(list.Icon)
	if icon == "" {
		icon = defaultTaskListIcon
	}

	id := strings.TrimSpace(list.ID)
	now := time.Now().UTC().UnixMilli()

	tx, err := s.db.Begin()
	if err != nil {
		return TaskList{}, fmt.Errorf("iniciar transação save task list: %w", err)
	}
	defer tx.Rollback()

	var count int
	if id != "" {
		_ = tx.QueryRow("SELECT COUNT(1) FROM task_lists WHERE id = ?", id).Scan(&count)
	}

	if count == 0 {
		if id == "" {
			id = "list-" + uuid.NewString()
		}
		var maxPos sql.NullFloat64
		_ = tx.QueryRow("SELECT MAX(position) FROM task_lists WHERE deleted_at IS NULL").Scan(&maxPos)
		pos := 0.0
		if maxPos.Valid {
			pos = maxPos.Float64 + 1.0
		}

		_, err = tx.Exec(`
			INSERT INTO task_lists(id, name, color, icon, position, sync_state, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
		`, id, name, color, icon, pos, now, now)
		if err != nil {
			return TaskList{}, fmt.Errorf("inserir task list: %w", err)
		}
		list.Position = pos
		list.CreatedAt = time.UnixMilli(now).UTC()
	} else {
		_, err = tx.Exec(`
			UPDATE task_lists
			SET name = ?, color = ?, icon = ?, deleted_at = NULL, updated_at = ?, sync_state = 'pending'
			WHERE id = ?
		`, name, color, icon, now, id)
		if err != nil {
			return TaskList{}, fmt.Errorf("atualizar task list: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return TaskList{}, fmt.Errorf("commit save task list: %w", err)
	}

	list.ID = id
	list.Name = name
	list.Color = color
	list.Icon = icon
	list.UpdatedAt = time.UnixMilli(now).UTC()
	return list, nil
}

func (s *noteStore) DeleteTaskList(id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return errors.New("id da lista obrigatório")
	}
	if id == defaultTaskListID {
		return errors.New("a lista padrão 'Entrada' não pode ser excluída")
	}

	now := time.Now().UTC().UnixMilli()
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("iniciar transação delete task list: %w", err)
	}
	defer tx.Rollback()

	// Soft-delete da lista
	_, err = tx.Exec(`
		UPDATE task_lists
		SET deleted_at = ?, updated_at = ?, sync_state = 'pending'
		WHERE id = ? AND deleted_at IS NULL
	`, now, now, id)
	if err != nil {
		return fmt.Errorf("deletar task list: %w", err)
	}

	// Mover tarefas da lista excluída para a lista Inbox ou aplicar soft-delete
	_, err = tx.Exec(`
		UPDATE tasks
		SET deleted_at = ?, updated_at = ?, sync_state = 'pending'
		WHERE list_id = ? AND deleted_at IS NULL
	`, now, now, id)
	if err != nil {
		return fmt.Errorf("deletar tarefas filhas da lista: %w", err)
	}

	return tx.Commit()
}

// ==========================================
// MÉTODOS DE TAREFAS (Tasks)
// ==========================================

func (s *noteStore) ListTasks(listID string, includeCompleted bool) ([]Task, error) {
	listID = strings.TrimSpace(listID)
	query := `
		SELECT t.id, t.list_id, t.title, t.notes, t.completed, t.completed_at, t.due_date,
		       t.priority, t.position, t.created_at, t.updated_at,
		       COUNT(st.id) AS subtask_total,
		       COUNT(st.id) FILTER (WHERE st.completed = 1) AS subtask_done
		FROM tasks t
		LEFT JOIN subtasks st ON st.task_id = t.id AND st.deleted_at IS NULL
		WHERE t.deleted_at IS NULL
	`
	var args []any
	if listID != "" && listID != "all" {
		query += " AND t.list_id = ?"
		args = append(args, listID)
	}
	if !includeCompleted {
		query += " AND t.completed = 0"
	}
	query += " GROUP BY t.id ORDER BY t.completed ASC, t.priority ASC, t.position ASC, t.created_at DESC"

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("listar tasks: %w", err)
	}
	defer rows.Close()

	var tasks []Task
	for rows.Next() {
		var t Task
		var completedInt int
		var completedAt sql.NullInt64
		var dueDate sql.NullString
		var createdAt, updatedAt int64

		if err := rows.Scan(
			&t.ID, &t.ListID, &t.Title, &t.Notes, &completedInt, &completedAt, &dueDate,
			&t.Priority, &t.Position, &createdAt, &updatedAt, &t.SubtaskTotal, &t.SubtaskDone,
		); err != nil {
			return nil, fmt.Errorf("scan task: %w", err)
		}

		t.Completed = completedInt == 1
		if completedAt.Valid {
			cTime := time.UnixMilli(completedAt.Int64).UTC()
			t.CompletedAt = &cTime
		}
		if dueDate.Valid {
			dStr := dueDate.String
			t.DueDate = &dStr
		}
		t.CreatedAt = time.UnixMilli(createdAt).UTC()
		t.UpdatedAt = time.UnixMilli(updatedAt).UTC()
		t.Subtasks = []Subtask{}
		tasks = append(tasks, t)
	}

	if tasks == nil {
		tasks = []Task{}
	}
	return tasks, nil
}

func (s *noteStore) GetTaskWithSubtasks(id string) (Task, error) {
	var t Task
	var completedInt int
	var completedAt sql.NullInt64
	var dueDate sql.NullString
	var createdAt, updatedAt int64

	row := s.db.QueryRow(`
		SELECT id, list_id, title, notes, completed, completed_at, due_date, priority, position, created_at, updated_at
		FROM tasks
		WHERE id = ? AND deleted_at IS NULL
	`, id)
	err := row.Scan(&t.ID, &t.ListID, &t.Title, &t.Notes, &completedInt, &completedAt, &dueDate, &t.Priority, &t.Position, &createdAt, &updatedAt)
	if err != nil {
		return Task{}, err
	}

	t.Completed = completedInt == 1
	if completedAt.Valid {
		cTime := time.UnixMilli(completedAt.Int64).UTC()
		t.CompletedAt = &cTime
	}
	if dueDate.Valid {
		dStr := dueDate.String
		t.DueDate = &dStr
	}
	t.CreatedAt = time.UnixMilli(createdAt).UTC()
	t.UpdatedAt = time.UnixMilli(updatedAt).UTC()

	// Subtarefas
	subRows, err := s.db.Query(`
		SELECT id, task_id, title, completed, completed_at, position, created_at, updated_at
		FROM subtasks
		WHERE task_id = ? AND deleted_at IS NULL
		ORDER BY position ASC, created_at ASC
	`, id)
	if err == nil {
		defer subRows.Close()
		var subtasks []Subtask
		for subRows.Next() {
			var st Subtask
			var stCompleted int
			var stCompletedAt sql.NullInt64
			var stCreated, stUpdated int64
			if err := subRows.Scan(&st.ID, &st.TaskID, &st.Title, &stCompleted, &stCompletedAt, &st.Position, &stCreated, &stUpdated); err == nil {
				st.Completed = stCompleted == 1
				if stCompletedAt.Valid {
					stTime := time.UnixMilli(stCompletedAt.Int64).UTC()
					st.CompletedAt = &stTime
				}
				st.CreatedAt = time.UnixMilli(stCreated).UTC()
				st.UpdatedAt = time.UnixMilli(stUpdated).UTC()
				subtasks = append(subtasks, st)
			}
		}
		t.Subtasks = subtasks
		t.SubtaskTotal = int64(len(subtasks))
		done := int64(0)
		for _, st := range subtasks {
			if st.Completed {
				done++
			}
		}
		t.SubtaskDone = done
	}

	return t, nil
}

func (s *noteStore) SaveTask(task Task) (Task, error) {
	title := strings.TrimSpace(task.Title)
	if title == "" {
		return Task{}, errors.New("o título da tarefa não pode ser vazio")
	}
	if utf8.RuneCountInString(title) > maxTaskTitleLen {
		return Task{}, fmt.Errorf("o título pode ter no máximo %d caracteres", maxTaskTitleLen)
	}

	listID := strings.TrimSpace(task.ListID)
	if listID == "" {
		listID = defaultTaskListID
	}

	id := strings.TrimSpace(task.ID)
	now := time.Now().UTC().UnixMilli()

	tx, err := s.db.Begin()
	if err != nil {
		return Task{}, fmt.Errorf("iniciar transação save task: %w", err)
	}
	defer tx.Rollback()

	completedInt := 0
	var completedAt any = nil
	if task.Completed {
		completedInt = 1
		if task.CompletedAt != nil {
			completedAt = task.CompletedAt.UnixMilli()
		} else {
			completedAt = now
		}
	}

	var count int
	if id != "" {
		_ = tx.QueryRow("SELECT COUNT(1) FROM tasks WHERE id = ?", id).Scan(&count)
	}

	if count == 0 {
		if id == "" {
			id = "task-" + uuid.NewString()
		}
		var maxPos sql.NullFloat64
		_ = tx.QueryRow("SELECT MAX(position) FROM tasks WHERE list_id = ? AND deleted_at IS NULL", listID).Scan(&maxPos)
		pos := 0.0
		if maxPos.Valid {
			pos = maxPos.Float64 + 1.0
		}

		_, err = tx.Exec(`
			INSERT INTO tasks(id, list_id, title, notes, completed, completed_at, due_date, priority, position, sync_state, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
		`, id, listID, title, task.Notes, completedInt, completedAt, task.DueDate, task.Priority, pos, now, now)
		if err != nil {
			return Task{}, fmt.Errorf("inserir task: %w", err)
		}
		task.Position = pos
		task.CreatedAt = time.UnixMilli(now).UTC()
	} else {
		_, err = tx.Exec(`
			UPDATE tasks
			SET list_id = ?, title = ?, notes = ?, completed = ?, completed_at = ?, due_date = ?, priority = ?, deleted_at = NULL, updated_at = ?, sync_state = 'pending'
			WHERE id = ?
		`, listID, title, task.Notes, completedInt, completedAt, task.DueDate, task.Priority, now, id)
		if err != nil {
			return Task{}, fmt.Errorf("atualizar task: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return Task{}, fmt.Errorf("commit save task: %w", err)
	}

	task.ID = id
	task.Title = title
	task.ListID = listID
	task.UpdatedAt = time.UnixMilli(now).UTC()
	return task, nil
}

func (s *noteStore) ToggleTaskCompleted(id string, completed bool) error {
	now := time.Now().UTC().UnixMilli()
	completedInt := 0
	var completedAt any = nil
	if completed {
		completedInt = 1
		completedAt = now
	}

	_, err := s.db.Exec(`
		UPDATE tasks
		SET completed = ?, completed_at = ?, updated_at = ?, sync_state = 'pending'
		WHERE id = ? AND deleted_at IS NULL
	`, completedInt, completedAt, now, id)
	return err
}

func (s *noteStore) DeleteTask(id string) error {
	now := time.Now().UTC().UnixMilli()
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Soft-delete da tarefa
	_, err = tx.Exec(`
		UPDATE tasks
		SET deleted_at = ?, updated_at = ?, sync_state = 'pending'
		WHERE id = ? AND deleted_at IS NULL
	`, now, now, id)
	if err != nil {
		return err
	}

	// Soft-delete das subtarefas filhas
	_, err = tx.Exec(`
		UPDATE subtasks
		SET deleted_at = ?, updated_at = ?, sync_state = 'pending'
		WHERE task_id = ? AND deleted_at IS NULL
	`, now, now, id)
	if err != nil {
		return err
	}

	return tx.Commit()
}

// ==========================================
// MÉTODOS DE SUBTAREFAS (Subtasks)
// ==========================================

func (s *noteStore) SaveSubtask(subtask Subtask) (Subtask, error) {
	title := strings.TrimSpace(subtask.Title)
	if title == "" {
		return Subtask{}, errors.New("o título da subtarefa não pode ser vazio")
	}
	if utf8.RuneCountInString(title) > maxSubtaskTitleLen {
		return Subtask{}, fmt.Errorf("o título pode ter no máximo %d caracteres", maxSubtaskTitleLen)
	}

	taskID := strings.TrimSpace(subtask.TaskID)
	if taskID == "" {
		return Subtask{}, errors.New("task_id é obrigatório para a subtarefa")
	}

	id := strings.TrimSpace(subtask.ID)
	now := time.Now().UTC().UnixMilli()

	tx, err := s.db.Begin()
	if err != nil {
		return Subtask{}, err
	}
	defer tx.Rollback()

	completedInt := 0
	var completedAt any = nil
	if subtask.Completed {
		completedInt = 1
		if subtask.CompletedAt != nil {
			completedAt = subtask.CompletedAt.UnixMilli()
		} else {
			completedAt = now
		}
	}

	var count int
	if id != "" {
		_ = tx.QueryRow("SELECT COUNT(1) FROM subtasks WHERE id = ?", id).Scan(&count)
	}

	if count == 0 {
		if id == "" {
			id = "subtask-" + uuid.NewString()
		}
		var maxPos sql.NullFloat64
		_ = tx.QueryRow("SELECT MAX(position) FROM subtasks WHERE task_id = ? AND deleted_at IS NULL", taskID).Scan(&maxPos)
		pos := 0.0
		if maxPos.Valid {
			pos = maxPos.Float64 + 1.0
		}

		_, err = tx.Exec(`
			INSERT INTO subtasks(id, task_id, title, completed, completed_at, position, sync_state, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
		`, id, taskID, title, completedInt, completedAt, pos, now, now)
		if err != nil {
			return Subtask{}, err
		}
		subtask.Position = pos
		subtask.CreatedAt = time.UnixMilli(now).UTC()
	} else {
		_, err = tx.Exec(`
			UPDATE subtasks
			SET title = ?, completed = ?, completed_at = ?, deleted_at = NULL, updated_at = ?, sync_state = 'pending'
			WHERE id = ?
		`, title, completedInt, completedAt, now, id)
		if err != nil {
			return Subtask{}, err
		}
	}

	// Tocar no updated_at da tarefa pai para sincronização consistente
	_, _ = tx.Exec(`UPDATE tasks SET updated_at = ?, sync_state = 'pending' WHERE id = ?`, now, taskID)

	if err := tx.Commit(); err != nil {
		return Subtask{}, err
	}

	subtask.ID = id
	subtask.Title = title
	subtask.TaskID = taskID
	subtask.UpdatedAt = time.UnixMilli(now).UTC()
	return subtask, nil
}

func (s *noteStore) ToggleSubtaskCompleted(id string, completed bool) error {
	now := time.Now().UTC().UnixMilli()
	completedInt := 0
	var completedAt any = nil
	if completed {
		completedInt = 1
		completedAt = now
	}

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var taskID string
	_ = tx.QueryRow("SELECT task_id FROM subtasks WHERE id = ?", id).Scan(&taskID)

	_, err = tx.Exec(`
		UPDATE subtasks
		SET completed = ?, completed_at = ?, updated_at = ?, sync_state = 'pending'
		WHERE id = ? AND deleted_at IS NULL
	`, completedInt, completedAt, now, id)
	if err != nil {
		return err
	}

	if taskID != "" {
		_, _ = tx.Exec(`UPDATE tasks SET updated_at = ?, sync_state = 'pending' WHERE id = ?`, now, taskID)
	}

	return tx.Commit()
}

func (s *noteStore) DeleteSubtask(id string) error {
	now := time.Now().UTC().UnixMilli()
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var taskID string
	_ = tx.QueryRow("SELECT task_id FROM subtasks WHERE id = ?", id).Scan(&taskID)

	_, err = tx.Exec(`
		UPDATE subtasks
		SET deleted_at = ?, updated_at = ?, sync_state = 'pending'
		WHERE id = ? AND deleted_at IS NULL
	`, now, now, id)
	if err != nil {
		return err
	}

	if taskID != "" {
		_, _ = tx.Exec(`UPDATE tasks SET updated_at = ?, sync_state = 'pending' WHERE id = ?`, now, taskID)
	}

	return tx.Commit()
}
