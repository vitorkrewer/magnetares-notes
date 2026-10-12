package main

import (
	"path/filepath"
	"testing"

	"github.com/google/uuid"
)

func TestTaskListsAndTasksCRUDWithClientIDs(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "tasks.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	// 1. Navigation includes default 'Entrada' list
	nav, err := app.ListNavigation()
	if err != nil {
		t.Fatal(err)
	}
	if len(nav.TaskLists) == 0 {
		t.Fatal("esperava que a lista padrão 'Entrada' existisse")
	}
	if nav.TaskLists[0].ID != defaultTaskListID || nav.TaskLists[0].Name != defaultTaskListName {
		t.Fatalf("lista padrão inesperada: %+v", nav.TaskLists[0])
	}

	// 2. Create task with client-generated UUID (frontend behavior)
	clientTaskID := uuid.NewString()
	task, err := app.SaveTask(Task{
		ID:       clientTaskID,
		ListID:   defaultTaskListID,
		Title:    "Comprar leite e café",
		Notes:    `[{"id":"note-1","title":"Marca","content":"Integral","createdAt":"2026-10-08T00:00:00Z","updatedAt":"2026-10-08T00:00:00Z"}]`,
		Priority: 2,
	})
	if err != nil {
		t.Fatalf("falha ao salvar tarefa com ID do cliente: %v", err)
	}
	if task.ID != clientTaskID {
		t.Fatalf("esperava ID %s, obteve %s", clientTaskID, task.ID)
	}

	// 3. Verify task exists in ListTasks
	tasks, err := app.ListTasks(defaultTaskListID, true)
	if err != nil {
		t.Fatalf("falha ao listar tarefas: %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("esperava 1 tarefa, encontrou %d", len(tasks))
	}
	if tasks[0].ID != clientTaskID || tasks[0].Title != "Comprar leite e café" {
		t.Fatalf("dados da tarefa incorretos: %+v", tasks[0])
	}

	// 4. Update task details
	task.Title = "Comprar leite desnatado e café em grão"
	task.Priority = 3
	updatedTask, err := app.SaveTask(task)
	if err != nil {
		t.Fatalf("falha ao atualizar tarefa: %v", err)
	}
	if updatedTask.Title != "Comprar leite desnatado e café em grão" || updatedTask.Priority != 3 {
		t.Fatalf("tarefa não foi atualizada: %+v", updatedTask)
	}

	// 5. Add subtask with client-generated UUID
	clientSubtaskID := uuid.NewString()
	subtask, err := app.SaveSubtask(Subtask{
		ID:     clientSubtaskID,
		TaskID: clientTaskID,
		Title:  "Verificar validade",
	})
	if err != nil {
		t.Fatalf("falha ao criar subtarefa com ID do cliente: %v", err)
	}
	if subtask.ID != clientSubtaskID {
		t.Fatalf("esperava ID de subtarefa %s, obteve %s", clientSubtaskID, subtask.ID)
	}

	// 6. GetTaskWithSubtasks
	fullTask, err := app.GetTaskWithSubtasks(clientTaskID)
	if err != nil {
		t.Fatalf("falha ao buscar tarefa com subtarefas: %v", err)
	}
	if len(fullTask.Subtasks) != 1 || fullTask.Subtasks[0].ID != clientSubtaskID {
		t.Fatalf("subtarefa ausente: %+v", fullTask)
	}

	// 7. Toggle subtask completion
	if err := app.ToggleSubtaskCompleted(clientSubtaskID, true); err != nil {
		t.Fatalf("falha ao concluir subtarefa: %v", err)
	}

	// 8. Create custom task list with client-generated UUID
	clientListID := uuid.NewString()
	customList, err := app.SaveTaskList(TaskList{
		ID:    clientListID,
		Name:  "Projetos Pessoais",
		Color: "emerald",
		Icon:  "briefcase",
	})
	if err != nil {
		t.Fatalf("falha ao criar lista com ID do cliente: %v", err)
	}
	if customList.ID != clientListID {
		t.Fatalf("esperava ID de lista %s, obteve %s", clientListID, customList.ID)
	}

	// 9. Compliance audit does not wipe valid tasks or lists
	report, err := app.RunComplianceAudit()
	if err != nil {
		t.Fatalf("falha na auditoria de compliance: %v", err)
	}
	if report.OrphanTasksFixed > 0 {
		t.Fatalf("tarefa válida foi tratada como órfã: %d", report.OrphanTasksFixed)
	}

	// Ensure tasks are still there after compliance audit
	tasksAfterAudit, err := app.ListTasks(defaultTaskListID, true)
	if err != nil {
		t.Fatalf("falha ao listar tarefas pós-compliance: %v", err)
	}
	if len(tasksAfterAudit) != 1 {
		t.Fatalf("tarefa desapareceu pós-compliance! esperava 1, encontrou %d", len(tasksAfterAudit))
	}

	// 10. Archive custom list
	archived, err := app.ArchiveTaskList(clientListID)
	if err != nil {
		t.Fatalf("falha ao arquivar lista: %v", err)
	}
	if archived.ArchivedAt == nil {
		t.Fatal("esperava que archivedAt estivesse preenchido")
	}

	// Verify it does not appear in active lists, but appears in archived lists
	activeLists, err := app.ListTaskLists()
	if err != nil {
		t.Fatal(err)
	}
	for _, l := range activeLists {
		if l.ID == clientListID {
			t.Fatal("lista arquivada ainda aparece nas listas ativas!")
		}
	}

	archivedLists, err := app.ListArchivedTaskLists()
	if err != nil {
		t.Fatal(err)
	}
	foundArchived := false
	for _, l := range archivedLists {
		if l.ID == clientListID {
			foundArchived = true
			break
		}
	}
	if !foundArchived {
		t.Fatal("lista arquivada não encontrada em ListArchivedTaskLists")
	}

	// 11. Cannot archive default Inbox
	if _, err := app.ArchiveTaskList(defaultTaskListID); err == nil {
		t.Fatal("esperava que arquivar a lista padrão 'Entrada' gerasse erro")
	}

	// 12. Unarchive custom list
	unarchived, err := app.UnarchiveTaskList(clientListID)
	if err != nil {
		t.Fatalf("falha ao desarquivar lista: %v", err)
	}
	if unarchived.ArchivedAt != nil {
		t.Fatal("esperava que archivedAt fosse nulo após desarquivar")
	}

	// 13. Delete custom list (and ensure its child tasks are also removed)
	_, err = app.SaveTask(Task{
		ID:     uuid.NewString(),
		ListID: clientListID,
		Title:  "Tarefa filha da lista custom",
	})
	if err != nil {
		t.Fatal(err)
	}

	if err := app.DeleteTaskList(clientListID); err != nil {
		t.Fatalf("falha ao deletar lista: %v", err)
	}

	// Cannot delete default inbox
	if err := app.DeleteTaskList(defaultTaskListID); err == nil {
		t.Fatal("esperava que deletar a lista padrão 'Entrada' gerasse erro")
	}

	// Ensure list is not in active or archived
	activeListsAfterDel, _ := app.ListTaskLists()
	for _, l := range activeListsAfterDel {
		if l.ID == clientListID {
			t.Fatal("lista deletada ainda está nas listas ativas!")
		}
	}
	archivedListsAfterDel, _ := app.ListArchivedTaskLists()
	for _, l := range archivedListsAfterDel {
		if l.ID == clientListID {
			t.Fatal("lista deletada ainda está nas listas arquivadas!")
		}
	}
}
