package main

import (
	"path/filepath"
	"testing"
)

func TestIdeaFlowsCRUDGraphAndCompliance(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "idea_flows.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	// 1. Inicialmente não há fluxos
	flows, err := app.ListIdeaFlows()
	if err != nil {
		t.Fatalf("ListIdeaFlows: %v", err)
	}
	if len(flows) != 0 {
		t.Fatalf("esperava 0 fluxos iniciais, obteve %d", len(flows))
	}

	// 2. Criar fluxo
	created, err := app.SaveIdeaFlow(SaveIdeaFlowInput{
		Title:       "Arquitetura v2",
		Description: "Mapa de módulos principais",
		Color:       "#10b981",
		Icon:        "network",
	})
	if err != nil {
		t.Fatalf("SaveIdeaFlow (create): %v", err)
	}
	if created.ID == "" || created.Title != "Arquitetura v2" || created.Color != "#10b981" || created.Icon != "network" {
		t.Fatalf("fluxo criado inesperado: %+v", created)
	}
	if created.ViewportZoom != 1 {
		t.Fatalf("esperava viewportZoom padrão 1, obteve %v", created.ViewportZoom)
	}

	// 3. Listagem e Navigation incluem o fluxo criado
	nav, err := app.ListNavigation()
	if err != nil {
		t.Fatalf("ListNavigation: %v", err)
	}
	if len(nav.IdeaFlows) != 1 || nav.IdeaFlows[0].ID != created.ID {
		t.Fatalf("Navigation.IdeaFlows inesperado: %+v", nav.IdeaFlows)
	}

	// 4. Atualizar metadados do fluxo
	updated, err := app.SaveIdeaFlow(SaveIdeaFlowInput{
		ID:          created.ID,
		Title:       "Arquitetura v2.1",
		Description: "Descrição atualizada",
		Color:       "#4b75ff",
		Icon:        "git-branch",
	})
	if err != nil {
		t.Fatalf("SaveIdeaFlow (update): %v", err)
	}
	if updated.Title != "Arquitetura v2.1" || updated.Description != "Descrição atualizada" {
		t.Fatalf("fluxo atualizado inesperado: %+v", updated)
	}

	// 5. Salvar grafo completo (nós com linkedKind/linkedId e aresta)
	savedGraph, err := app.SaveIdeaFlowGraph(SaveIdeaFlowGraphInput{
		FlowID:       created.ID,
		ViewportX:    120.5,
		ViewportY:    -45.0,
		ViewportZoom: 1.25,
		Nodes: []IdeaNode{
			{
				ID:          "node-1",
				NodeType:    "note-link",
				Label:       "Nota Central",
				Content:     "Resumo inicial",
				X:           100,
				Y:           200,
				Width:       240,
				Height:      110,
				Color:       "#4b75ff",
				LinkedKind:  "note",
				LinkedID:    "note-abc-123",
				LinkedLabel: "Especificação Técnica",
				StyleJSON:   `{"borderStyle":"solid"}`,
			},
			{
				ID:        "node-2",
				NodeType:  "idea",
				Label:     "Próximo Passo",
				Content:   "Validar sincronização",
				X:         420,
				Y:         220,
				StyleJSON: `{}`,
			},
		},
		Edges: []IdeaEdge{
			{
				ID:           "edge-1",
				SourceNodeID: "node-1",
				TargetNodeID: "node-2",
				SourceHandle: "right",
				TargetHandle: "left",
				Label:        "depende de",
				EdgeType:     "bezier",
				Color:        "#4b75ff",
				Animated:     true,
				StyleJSON:    `{}`,
			},
		},
	})
	if err != nil {
		t.Fatalf("SaveIdeaFlowGraph: %v", err)
	}
	if savedGraph.Flow.NodeCount != 2 || savedGraph.Flow.EdgeCount != 1 {
		t.Fatalf("contagens inesperadas no grafo: nodes=%d edges=%d", savedGraph.Flow.NodeCount, savedGraph.Flow.EdgeCount)
	}
	if savedGraph.Flow.ViewportX != 120.5 || savedGraph.Flow.ViewportY != -45.0 || savedGraph.Flow.ViewportZoom != 1.25 {
		t.Fatalf("viewport inesperado: %+v", savedGraph.Flow)
	}
	if len(savedGraph.Nodes) != 2 || savedGraph.Nodes[0].LinkedKind != "note" || savedGraph.Nodes[0].LinkedID != "note-abc-123" {
		t.Fatalf("nós salvos inesperados: %+v", savedGraph.Nodes)
	}
	if len(savedGraph.Edges) != 1 || !savedGraph.Edges[0].Animated || savedGraph.Edges[0].Label != "depende de" {
		t.Fatalf("arestas salvas inesperadas: %+v", savedGraph.Edges)
	}

	// 6. Duplicar fluxo
	dup, err := app.DuplicateIdeaFlow(created.ID)
	if err != nil {
		t.Fatalf("DuplicateIdeaFlow: %v", err)
	}
	if dup.ID == created.ID || dup.Title != "Arquitetura v2.1 (Cópia)" {
		t.Fatalf("duplicação inesperada: %+v", dup)
	}
	if dup.NodeCount != 2 || dup.EdgeCount != 1 {
		t.Fatalf("esperava 2 nós e 1 aresta na cópia, obteve %d e %d", dup.NodeCount, dup.EdgeCount)
	}
	dupGraph, err := app.GetIdeaFlowGraph(dup.ID)
	if err != nil {
		t.Fatalf("GetIdeaFlowGraph (dup): %v", err)
	}
	dupNodeIDs := make(map[string]bool, len(dupGraph.Nodes))
	for _, n := range dupGraph.Nodes {
		if n.ID == "node-1" || n.ID == "node-2" {
			t.Fatalf("a cópia deve gerar novos IDs para os nós, obteve %s", n.ID)
		}
		dupNodeIDs[n.ID] = true
	}
	if dupGraph.Edges[0].ID == "edge-1" {
		t.Fatalf("a cópia deve gerar novo ID para a aresta")
	}
	if !dupNodeIDs[dupGraph.Edges[0].SourceNodeID] || !dupNodeIDs[dupGraph.Edges[0].TargetNodeID] || dupGraph.Edges[0].SourceNodeID == dupGraph.Edges[0].TargetNodeID {
		t.Fatalf("arestas da cópia devem apontar para os novos IDs dos nós: edge=%+v nodes=%+v", dupGraph.Edges[0], dupNodeIDs)
	}

	// 7. Remover um nó e a aresta via SaveIdeaFlowGraph (soft delete dos removidos)
	trimmedGraph, err := app.SaveIdeaFlowGraph(SaveIdeaFlowGraphInput{
		FlowID:       created.ID,
		ViewportX:    0,
		ViewportY:    0,
		ViewportZoom: 1,
		Nodes: []IdeaNode{
			savedGraph.Nodes[0],
		},
		Edges: []IdeaEdge{},
	})
	if err != nil {
		t.Fatalf("SaveIdeaFlowGraph (remove node): %v", err)
	}
	if len(trimmedGraph.Nodes) != 1 || len(trimmedGraph.Edges) != 0 {
		t.Fatalf("esperava 1 nó e 0 arestas após remoção, obteve %d e %d", len(trimmedGraph.Nodes), len(trimmedGraph.Edges))
	}
	var deletedAtNode2 string
	if err := app.store.db.QueryRow(`SELECT COALESCE(deleted_at, '') FROM idea_nodes WHERE id = 'node-2'`).Scan(&deletedAtNode2); err != nil {
		t.Fatalf("consultar deleted_at de node-2: %v", err)
	}
	if deletedAtNode2 == "" {
		t.Fatalf("esperava deleted_at preenchido em node-2 após remoção do grafo")
	}

	// 8. Exclusão lógica em cascata do fluxo
	if err := app.DeleteIdeaFlow(created.ID); err != nil {
		t.Fatalf("DeleteIdeaFlow: %v", err)
	}
	if _, err := app.GetIdeaFlowGraph(created.ID); err == nil {
		t.Fatalf("esperava erro ao carregar grafo de fluxo excluído")
	}
	var deletedAtNode1 string
	if err := app.store.db.QueryRow(`SELECT COALESCE(deleted_at, '') FROM idea_nodes WHERE id = 'node-1'`).Scan(&deletedAtNode1); err != nil {
		t.Fatalf("consultar deleted_at de node-1: %v", err)
	}
	if deletedAtNode1 == "" {
		t.Fatalf("esperava deleted_at preenchido em node-1 após exclusão do fluxo")
	}

	// 9. Compliance: inserir nó ativo ligado a um fluxo já excluído logicamente e zoom inválido
	if _, err := app.store.db.Exec(`UPDATE idea_flows SET viewport_zoom = 0, color = '' WHERE id = ?`, dup.ID); err != nil {
		t.Fatalf("corromper fluxo para compliance: %v", err)
	}
	if _, err := app.store.db.Exec(`INSERT INTO idea_nodes(id, flow_id, label, created_at, updated_at, sync_state)
		VALUES ('orphan-node', ?, 'Órfão', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'clean')`, created.ID); err != nil {
		t.Fatalf("inserir nó órfão: %v", err)
	}
	report, err := app.store.EnsureDataCompliance()
	if err != nil {
		t.Fatalf("EnsureDataCompliance: %v", err)
	}
	if report.OrphanIdeaNodesFixed != 1 {
		t.Fatalf("esperava 1 nó órfão corrigido, obteve %d", report.OrphanIdeaNodesFixed)
	}
	dupAfter, err := app.GetIdeaFlowGraph(dup.ID)
	if err != nil {
		t.Fatalf("GetIdeaFlowGraph após compliance: %v", err)
	}
	if dupAfter.Flow.ViewportZoom != 1 || dupAfter.Flow.Color != defaultIdeaFlowColor {
		t.Fatalf("compliance não normalizou zoom/cor: %+v", dupAfter.Flow)
	}
}

func TestIdeaFlowDynamicLinkedLabels(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "idea_flows_labels.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	// Cria lista e tarefa
	list, err := app.SaveTaskList(TaskList{Name: "Sprint Atual"})
	if err != nil {
		t.Fatalf("SaveTaskList: %v", err)
	}
	task, err := app.SaveTask(Task{ListID: list.ID, Title: "Tarefa Original"})
	if err != nil {
		t.Fatalf("SaveTask: %v", err)
	}

	// Cria fluxo e nó referenciando a tarefa
	flow, err := app.SaveIdeaFlow(SaveIdeaFlowInput{Title: "Fluxo Sync Nomes"})
	if err != nil {
		t.Fatalf("SaveIdeaFlow: %v", err)
	}
	_, err = app.SaveIdeaFlowGraph(SaveIdeaFlowGraphInput{
		FlowID:       flow.ID,
		ViewportZoom: 1,
		Nodes: []IdeaNode{
			{
				ID:          "ref-task",
				NodeType:    "reference",
				Label:       "Tarefa Original",
				LinkedKind:  "task",
				LinkedID:    list.ID + "::" + task.ID,
				LinkedLabel: "Tarefa Original",
			},
			{
				ID:          "ref-list",
				NodeType:    "reference",
				Label:       "Sprint Atual",
				LinkedKind:  "taskList",
				LinkedID:    list.ID,
				LinkedLabel: "Sprint Atual",
			},
		},
	})
	if err != nil {
		t.Fatalf("SaveIdeaFlowGraph: %v", err)
	}

	// Renomeia a tarefa e a lista
	task.Title = "Tarefa Renomeada"
	if _, err := app.SaveTask(task); err != nil {
		t.Fatalf("SaveTask rename: %v", err)
	}
	list.Name = "Sprint Renomeada"
	if _, err := app.SaveTaskList(list); err != nil {
		t.Fatalf("SaveTaskList rename: %v", err)
	}

	// Ao carregar o grafo novamente, os rótulos devem refletir os novos nomes
	graph, err := app.GetIdeaFlowGraph(flow.ID)
	if err != nil {
		t.Fatalf("GetIdeaFlowGraph: %v", err)
	}
	for _, n := range graph.Nodes {
		switch n.ID {
		case "ref-task":
			if n.Label != "Tarefa Renomeada" || n.LinkedLabel != "Tarefa Renomeada" {
				t.Fatalf("esperava 'Tarefa Renomeada', obteve label=%q linkedLabel=%q", n.Label, n.LinkedLabel)
			}
		case "ref-list":
			if n.Label != "Sprint Renomeada" || n.LinkedLabel != "Sprint Renomeada" {
				t.Fatalf("esperava 'Sprint Renomeada', obteve label=%q linkedLabel=%q", n.Label, n.LinkedLabel)
			}
		}
	}
}
