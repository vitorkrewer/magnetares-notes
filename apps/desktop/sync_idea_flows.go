package main

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"strings"
)

// Sincronização de Fluxos de Ideias, Nós e Arestas com o Turso.
//
// Utiliza estratégia Last-Write-Wins (LWW) por updated_at nos dois sentidos:
// o push envia apenas registros com sync_state = 'dirty'; o pull lê a
// partição do perfil no Turso e aplica as versões mais recentes localmente.
//
// Ordem de sincronização por integridade referencial:
// 1. idea_flows
// 2. idea_nodes (referencia idea_flows)
// 3. idea_edges (referencia idea_flows e nós)

func (s *noteStore) syncIdeaFlowEntities(turso *TursoClient, profileID string) string {
	if turso == nil {
		return ""
	}

	var failed []string
	if err := s.syncIdeaFlowsDirect(turso, profileID); err != nil {
		log.Printf("sync idea_flows: fluxos: %v", err)
		failed = append(failed, "fluxos de ideias")
	}
	if err := s.syncIdeaNodesDirect(turso, profileID); err != nil {
		log.Printf("sync idea_flows: nós: %v", err)
		failed = append(failed, "nós de ideias")
	}
	if err := s.syncIdeaEdgesDirect(turso, profileID); err != nil {
		log.Printf("sync idea_flows: arestas: %v", err)
		failed = append(failed, "arestas de ideias")
	}

	if len(failed) == 0 {
		return ""
	}
	return fmt.Sprintf(" Atenção: falha parcial ao sincronizar %s (detalhes no log).", strings.Join(failed, ", "))
}

// =========================================================================
// 1. IDEA FLOWS
// =========================================================================

func (s *noteStore) syncIdeaFlowsDirect(turso *TursoClient, profileID string) error {
	if turso == nil {
		return nil
	}
	var problems []error

	rows, err := s.db.Query(`SELECT id, title, description, color, icon, viewport_x, viewport_y, viewport_zoom, position, deleted_at, created_at, updated_at
		FROM idea_flows WHERE sync_state = 'dirty'`)
	if err != nil {
		return fmt.Errorf("ler idea_flows pendentes: %w", err)
	}
	type pendingFlow struct {
		id, title, description, color, icon string
		viewportX, viewportY, viewportZoom  float64
		position                            int
		deletedAt                           sql.NullString
		createdAt, updatedAt                string
	}
	var pending []pendingFlow
	for rows.Next() {
		var f pendingFlow
		if err := rows.Scan(&f.id, &f.title, &f.description, &f.color, &f.icon, &f.viewportX, &f.viewportY, &f.viewportZoom, &f.position, &f.deletedAt, &f.createdAt, &f.updatedAt); err != nil {
			problems = append(problems, fmt.Errorf("ler idea_flow pendente: %w", err))
			continue
		}
		pending = append(pending, f)
	}
	if err := rows.Err(); err != nil {
		problems = append(problems, fmt.Errorf("iterar idea_flows pendentes: %w", err))
	}
	_ = rows.Close()

	for _, f := range pending {
		var deletedAt any
		if f.deletedAt.Valid {
			deletedAt = f.deletedAt.String
		}
		if err := turso.Execute(`INSERT INTO sync_idea_flows(
			user_id, id, title, description, color, icon, viewport_x, viewport_y, viewport_zoom, position, deleted_at, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(user_id, id) DO UPDATE SET
			title = CASE WHEN excluded.updated_at >= updated_at THEN excluded.title ELSE title END,
			description = CASE WHEN excluded.updated_at >= updated_at THEN excluded.description ELSE description END,
			color = CASE WHEN excluded.updated_at >= updated_at THEN excluded.color ELSE color END,
			icon = CASE WHEN excluded.updated_at >= updated_at THEN excluded.icon ELSE icon END,
			viewport_x = CASE WHEN excluded.updated_at >= updated_at THEN excluded.viewport_x ELSE viewport_x END,
			viewport_y = CASE WHEN excluded.updated_at >= updated_at THEN excluded.viewport_y ELSE viewport_y END,
			viewport_zoom = CASE WHEN excluded.updated_at >= updated_at THEN excluded.viewport_zoom ELSE viewport_zoom END,
			position = CASE WHEN excluded.updated_at >= updated_at THEN excluded.position ELSE position END,
			deleted_at = CASE WHEN excluded.updated_at >= updated_at THEN excluded.deleted_at ELSE deleted_at END,
			updated_at = CASE WHEN excluded.updated_at >= updated_at THEN excluded.updated_at ELSE updated_at END`,
			profileID, f.id, f.title, f.description, f.color, f.icon, f.viewportX, f.viewportY, f.viewportZoom, f.position, deletedAt, f.createdAt, f.updatedAt); err != nil {
			problems = append(problems, fmt.Errorf("enviar idea_flow %s: %w", f.id, err))
			continue
		}
		if _, err := s.db.Exec(`UPDATE idea_flows SET sync_state = 'clean' WHERE id = ? AND updated_at = ?`, f.id, f.updatedAt); err != nil {
			problems = append(problems, fmt.Errorf("marcar idea_flow %s como sincronizado: %w", f.id, err))
		}
	}

	_, remoteRows, err := turso.Query(`SELECT id, title, description, color, icon, viewport_x, viewport_y, viewport_zoom, position, deleted_at, created_at, updated_at
		FROM sync_idea_flows WHERE user_id = ?`, profileID)
	if err != nil {
		problems = append(problems, fmt.Errorf("buscar idea_flows remotos: %w", err))
		return errors.Join(problems...)
	}
	for _, row := range remoteRows {
		if len(row) < 12 {
			continue
		}
		if err := s.applyRemoteIdeaFlow(row); err != nil {
			problems = append(problems, fmt.Errorf("aplicar idea_flow %s: %w", row[0].Value, err))
		}
	}
	return errors.Join(problems...)
}

func (s *noteStore) applyRemoteIdeaFlow(row []TursoValue) error {
	viewportX, err := tursoFloat(row[5])
	if err != nil {
		return fmt.Errorf("viewport_x inválido: %w", err)
	}
	viewportY, err := tursoFloat(row[6])
	if err != nil {
		return fmt.Errorf("viewport_y inválido: %w", err)
	}
	viewportZoom, err := tursoFloat(row[7])
	if err != nil {
		return fmt.Errorf("viewport_zoom inválido: %w", err)
	}
	if viewportZoom <= 0 {
		viewportZoom = 1
	}
	position, err := tursoInt(row[8])
	if err != nil {
		return fmt.Errorf("position inválido: %w", err)
	}
	var deletedAt any
	if row[9].Type != "null" && row[9].Value != "" {
		deletedAt = row[9].Value
	}

	_, err = s.db.Exec(`INSERT INTO idea_flows(
		id, title, description, color, icon, viewport_x, viewport_y, viewport_zoom, position, deleted_at, created_at, updated_at, sync_state
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'clean')
	ON CONFLICT(id) DO UPDATE SET
		title = CASE WHEN updated_at >= excluded.updated_at THEN title ELSE excluded.title END,
		description = CASE WHEN updated_at >= excluded.updated_at THEN description ELSE excluded.description END,
		color = CASE WHEN updated_at >= excluded.updated_at THEN color ELSE excluded.color END,
		icon = CASE WHEN updated_at >= excluded.updated_at THEN icon ELSE excluded.icon END,
		viewport_x = CASE WHEN updated_at >= excluded.updated_at THEN viewport_x ELSE excluded.viewport_x END,
		viewport_y = CASE WHEN updated_at >= excluded.updated_at THEN viewport_y ELSE excluded.viewport_y END,
		viewport_zoom = CASE WHEN updated_at >= excluded.updated_at THEN viewport_zoom ELSE excluded.viewport_zoom END,
		position = CASE WHEN updated_at >= excluded.updated_at THEN position ELSE excluded.position END,
		deleted_at = CASE WHEN updated_at >= excluded.updated_at THEN deleted_at ELSE excluded.deleted_at END,
		updated_at = CASE WHEN updated_at >= excluded.updated_at THEN updated_at ELSE excluded.updated_at END,
		sync_state = CASE WHEN sync_state = 'dirty' AND updated_at >= excluded.updated_at THEN 'dirty' ELSE 'clean' END`,
		row[0].Value, row[1].Value, row[2].Value, row[3].Value, row[4].Value,
		viewportX, viewportY, viewportZoom, position, deletedAt, row[10].Value, row[11].Value)
	return err
}

// =========================================================================
// 2. IDEA NODES
// =========================================================================

func (s *noteStore) syncIdeaNodesDirect(turso *TursoClient, profileID string) error {
	if turso == nil {
		return nil
	}
	var problems []error

	rows, err := s.db.Query(`SELECT id, flow_id, node_type, label, content, x, y, width, height, color, linked_kind, linked_id, linked_label, style_json, deleted_at, created_at, updated_at
		FROM idea_nodes WHERE sync_state = 'dirty'`)
	if err != nil {
		return fmt.Errorf("ler idea_nodes pendentes: %w", err)
	}
	type pendingNode struct {
		id, flowID, nodeType, label, content          string
		x, y, width, height                           float64
		color, linkedKind, linkedID, linkedLabel      string
		styleJSON                                     string
		deletedAt                                     sql.NullString
		createdAt, updatedAt                          string
	}
	var pending []pendingNode
	for rows.Next() {
		var n pendingNode
		if err := rows.Scan(&n.id, &n.flowID, &n.nodeType, &n.label, &n.content, &n.x, &n.y, &n.width, &n.height, &n.color, &n.linkedKind, &n.linkedID, &n.linkedLabel, &n.styleJSON, &n.deletedAt, &n.createdAt, &n.updatedAt); err != nil {
			problems = append(problems, fmt.Errorf("ler idea_node pendente: %w", err))
			continue
		}
		pending = append(pending, n)
	}
	if err := rows.Err(); err != nil {
		problems = append(problems, fmt.Errorf("iterar idea_nodes pendentes: %w", err))
	}
	_ = rows.Close()

	for _, n := range pending {
		var deletedAt any
		if n.deletedAt.Valid {
			deletedAt = n.deletedAt.String
		}
		if err := turso.Execute(`INSERT INTO sync_idea_nodes(
			user_id, id, flow_id, node_type, label, content, x, y, width, height, color, linked_kind, linked_id, linked_label, style_json, deleted_at, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(user_id, id) DO UPDATE SET
			flow_id = CASE WHEN excluded.updated_at >= updated_at THEN excluded.flow_id ELSE flow_id END,
			node_type = CASE WHEN excluded.updated_at >= updated_at THEN excluded.node_type ELSE node_type END,
			label = CASE WHEN excluded.updated_at >= updated_at THEN excluded.label ELSE label END,
			content = CASE WHEN excluded.updated_at >= updated_at THEN excluded.content ELSE content END,
			x = CASE WHEN excluded.updated_at >= updated_at THEN excluded.x ELSE x END,
			y = CASE WHEN excluded.updated_at >= updated_at THEN excluded.y ELSE y END,
			width = CASE WHEN excluded.updated_at >= updated_at THEN excluded.width ELSE width END,
			height = CASE WHEN excluded.updated_at >= updated_at THEN excluded.height ELSE height END,
			color = CASE WHEN excluded.updated_at >= updated_at THEN excluded.color ELSE color END,
			linked_kind = CASE WHEN excluded.updated_at >= updated_at THEN excluded.linked_kind ELSE linked_kind END,
			linked_id = CASE WHEN excluded.updated_at >= updated_at THEN excluded.linked_id ELSE linked_id END,
			linked_label = CASE WHEN excluded.updated_at >= updated_at THEN excluded.linked_label ELSE linked_label END,
			style_json = CASE WHEN excluded.updated_at >= updated_at THEN excluded.style_json ELSE style_json END,
			deleted_at = CASE WHEN excluded.updated_at >= updated_at THEN excluded.deleted_at ELSE deleted_at END,
			updated_at = CASE WHEN excluded.updated_at >= updated_at THEN excluded.updated_at ELSE updated_at END`,
			profileID, n.id, n.flowID, n.nodeType, n.label, n.content, n.x, n.y, n.width, n.height, n.color, n.linkedKind, n.linkedID, n.linkedLabel, n.styleJSON, deletedAt, n.createdAt, n.updatedAt); err != nil {
			problems = append(problems, fmt.Errorf("enviar idea_node %s: %w", n.id, err))
			continue
		}
		if _, err := s.db.Exec(`UPDATE idea_nodes SET sync_state = 'clean' WHERE id = ? AND updated_at = ?`, n.id, n.updatedAt); err != nil {
			problems = append(problems, fmt.Errorf("marcar idea_node %s como sincronizado: %w", n.id, err))
		}
	}

	_, remoteRows, err := turso.Query(`SELECT id, flow_id, node_type, label, content, x, y, width, height, color, linked_kind, linked_id, linked_label, style_json, deleted_at, created_at, updated_at
		FROM sync_idea_nodes WHERE user_id = ?`, profileID)
	if err != nil {
		problems = append(problems, fmt.Errorf("buscar idea_nodes remotos: %w", err))
		return errors.Join(problems...)
	}
	for _, row := range remoteRows {
		if len(row) < 17 {
			continue
		}
		if err := s.applyRemoteIdeaNode(row); err != nil {
			problems = append(problems, fmt.Errorf("aplicar idea_node %s: %w", row[0].Value, err))
		}
	}
	return errors.Join(problems...)
}

func (s *noteStore) applyRemoteIdeaNode(row []TursoValue) error {
	x, err := tursoFloat(row[5])
	if err != nil {
		return fmt.Errorf("x inválido: %w", err)
	}
	y, err := tursoFloat(row[6])
	if err != nil {
		return fmt.Errorf("y inválido: %w", err)
	}
	width, err := tursoFloat(row[7])
	if err != nil {
		return fmt.Errorf("width inválido: %w", err)
	}
	height, err := tursoFloat(row[8])
	if err != nil {
		return fmt.Errorf("height inválido: %w", err)
	}
	var deletedAt any
	if row[14].Type != "null" && row[14].Value != "" {
		deletedAt = row[14].Value
	}

	_, err = s.db.Exec(`INSERT INTO idea_nodes(
		id, flow_id, node_type, label, content, x, y, width, height, color, linked_kind, linked_id, linked_label, style_json, deleted_at, created_at, updated_at, sync_state
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'clean')
	ON CONFLICT(id) DO UPDATE SET
		flow_id = CASE WHEN updated_at >= excluded.updated_at THEN flow_id ELSE excluded.flow_id END,
		node_type = CASE WHEN updated_at >= excluded.updated_at THEN node_type ELSE excluded.node_type END,
		label = CASE WHEN updated_at >= excluded.updated_at THEN label ELSE excluded.label END,
		content = CASE WHEN updated_at >= excluded.updated_at THEN content ELSE excluded.content END,
		x = CASE WHEN updated_at >= excluded.updated_at THEN x ELSE excluded.x END,
		y = CASE WHEN updated_at >= excluded.updated_at THEN y ELSE excluded.y END,
		width = CASE WHEN updated_at >= excluded.updated_at THEN width ELSE excluded.width END,
		height = CASE WHEN updated_at >= excluded.updated_at THEN height ELSE excluded.height END,
		color = CASE WHEN updated_at >= excluded.updated_at THEN color ELSE excluded.color END,
		linked_kind = CASE WHEN updated_at >= excluded.updated_at THEN linked_kind ELSE excluded.linked_kind END,
		linked_id = CASE WHEN updated_at >= excluded.updated_at THEN linked_id ELSE excluded.linked_id END,
		linked_label = CASE WHEN updated_at >= excluded.updated_at THEN linked_label ELSE excluded.linked_label END,
		style_json = CASE WHEN updated_at >= excluded.updated_at THEN style_json ELSE excluded.style_json END,
		deleted_at = CASE WHEN updated_at >= excluded.updated_at THEN deleted_at ELSE excluded.deleted_at END,
		updated_at = CASE WHEN updated_at >= excluded.updated_at THEN updated_at ELSE excluded.updated_at END,
		sync_state = CASE WHEN sync_state = 'dirty' AND updated_at >= excluded.updated_at THEN 'dirty' ELSE 'clean' END`,
		row[0].Value, row[1].Value, row[2].Value, row[3].Value, row[4].Value,
		x, y, width, height, row[9].Value, row[10].Value, row[11].Value, row[12].Value, row[13].Value,
		deletedAt, row[15].Value, row[16].Value)
	return err
}

// =========================================================================
// 3. IDEA EDGES
// =========================================================================

func (s *noteStore) syncIdeaEdgesDirect(turso *TursoClient, profileID string) error {
	if turso == nil {
		return nil
	}
	var problems []error

	rows, err := s.db.Query(`SELECT id, flow_id, source_node_id, target_node_id, source_handle, target_handle, label, edge_type, color, animated, style_json, deleted_at, created_at, updated_at
		FROM idea_edges WHERE sync_state = 'dirty'`)
	if err != nil {
		return fmt.Errorf("ler idea_edges pendentes: %w", err)
	}
	type pendingEdge struct {
		id, flowID, sourceNodeID, targetNodeID string
		sourceHandle, targetHandle             string
		label, edgeType, color, styleJSON      string
		animated                               int
		deletedAt                              sql.NullString
		createdAt, updatedAt                   string
	}
	var pending []pendingEdge
	for rows.Next() {
		var e pendingEdge
		if err := rows.Scan(&e.id, &e.flowID, &e.sourceNodeID, &e.targetNodeID, &e.sourceHandle, &e.targetHandle, &e.label, &e.edgeType, &e.color, &e.animated, &e.styleJSON, &e.deletedAt, &e.createdAt, &e.updatedAt); err != nil {
			problems = append(problems, fmt.Errorf("ler idea_edge pendente: %w", err))
			continue
		}
		pending = append(pending, e)
	}
	if err := rows.Err(); err != nil {
		problems = append(problems, fmt.Errorf("iterar idea_edges pendentes: %w", err))
	}
	_ = rows.Close()

	for _, e := range pending {
		var deletedAt any
		if e.deletedAt.Valid {
			deletedAt = e.deletedAt.String
		}
		if err := turso.Execute(`INSERT INTO sync_idea_edges(
			user_id, id, flow_id, source_node_id, target_node_id, source_handle, target_handle, label, edge_type, color, animated, style_json, deleted_at, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(user_id, id) DO UPDATE SET
			flow_id = CASE WHEN excluded.updated_at >= updated_at THEN excluded.flow_id ELSE flow_id END,
			source_node_id = CASE WHEN excluded.updated_at >= updated_at THEN excluded.source_node_id ELSE source_node_id END,
			target_node_id = CASE WHEN excluded.updated_at >= updated_at THEN excluded.target_node_id ELSE target_node_id END,
			source_handle = CASE WHEN excluded.updated_at >= updated_at THEN excluded.source_handle ELSE source_handle END,
			target_handle = CASE WHEN excluded.updated_at >= updated_at THEN excluded.target_handle ELSE target_handle END,
			label = CASE WHEN excluded.updated_at >= updated_at THEN excluded.label ELSE label END,
			edge_type = CASE WHEN excluded.updated_at >= updated_at THEN excluded.edge_type ELSE edge_type END,
			color = CASE WHEN excluded.updated_at >= updated_at THEN excluded.color ELSE color END,
			animated = CASE WHEN excluded.updated_at >= updated_at THEN excluded.animated ELSE animated END,
			style_json = CASE WHEN excluded.updated_at >= updated_at THEN excluded.style_json ELSE style_json END,
			deleted_at = CASE WHEN excluded.updated_at >= updated_at THEN excluded.deleted_at ELSE deleted_at END,
			updated_at = CASE WHEN excluded.updated_at >= updated_at THEN excluded.updated_at ELSE updated_at END`,
			profileID, e.id, e.flowID, e.sourceNodeID, e.targetNodeID, e.sourceHandle, e.targetHandle, e.label, e.edgeType, e.color, e.animated, e.styleJSON, deletedAt, e.createdAt, e.updatedAt); err != nil {
			problems = append(problems, fmt.Errorf("enviar idea_edge %s: %w", e.id, err))
			continue
		}
		if _, err := s.db.Exec(`UPDATE idea_edges SET sync_state = 'clean' WHERE id = ? AND updated_at = ?`, e.id, e.updatedAt); err != nil {
			problems = append(problems, fmt.Errorf("marcar idea_edge %s como sincronizado: %w", e.id, err))
		}
	}

	_, remoteRows, err := turso.Query(`SELECT id, flow_id, source_node_id, target_node_id, source_handle, target_handle, label, edge_type, color, animated, style_json, deleted_at, created_at, updated_at
		FROM sync_idea_edges WHERE user_id = ?`, profileID)
	if err != nil {
		problems = append(problems, fmt.Errorf("buscar idea_edges remotos: %w", err))
		return errors.Join(problems...)
	}
	for _, row := range remoteRows {
		if len(row) < 14 {
			continue
		}
		if err := s.applyRemoteIdeaEdge(row); err != nil {
			problems = append(problems, fmt.Errorf("aplicar idea_edge %s: %w", row[0].Value, err))
		}
	}
	return errors.Join(problems...)
}

func (s *noteStore) applyRemoteIdeaEdge(row []TursoValue) error {
	animated, err := tursoInt(row[9])
	if err != nil {
		return fmt.Errorf("animated inválido: %w", err)
	}
	var deletedAt any
	if row[11].Type != "null" && row[11].Value != "" {
		deletedAt = row[11].Value
	}

	_, err = s.db.Exec(`INSERT INTO idea_edges(
		id, flow_id, source_node_id, target_node_id, source_handle, target_handle, label, edge_type, color, animated, style_json, deleted_at, created_at, updated_at, sync_state
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'clean')
	ON CONFLICT(id) DO UPDATE SET
		flow_id = CASE WHEN updated_at >= excluded.updated_at THEN flow_id ELSE excluded.flow_id END,
		source_node_id = CASE WHEN updated_at >= excluded.updated_at THEN source_node_id ELSE excluded.source_node_id END,
		target_node_id = CASE WHEN updated_at >= excluded.updated_at THEN target_node_id ELSE excluded.target_node_id END,
		source_handle = CASE WHEN updated_at >= excluded.updated_at THEN source_handle ELSE excluded.source_handle END,
		target_handle = CASE WHEN updated_at >= excluded.updated_at THEN target_handle ELSE excluded.target_handle END,
		label = CASE WHEN updated_at >= excluded.updated_at THEN label ELSE excluded.label END,
		edge_type = CASE WHEN updated_at >= excluded.updated_at THEN edge_type ELSE excluded.edge_type END,
		color = CASE WHEN updated_at >= excluded.updated_at THEN color ELSE excluded.color END,
		animated = CASE WHEN updated_at >= excluded.updated_at THEN animated ELSE excluded.animated END,
		style_json = CASE WHEN updated_at >= excluded.updated_at THEN style_json ELSE excluded.style_json END,
		deleted_at = CASE WHEN updated_at >= excluded.updated_at THEN deleted_at ELSE excluded.deleted_at END,
		updated_at = CASE WHEN updated_at >= excluded.updated_at THEN updated_at ELSE excluded.updated_at END,
		sync_state = CASE WHEN sync_state = 'dirty' AND updated_at >= excluded.updated_at THEN 'dirty' ELSE 'clean' END`,
		row[0].Value, row[1].Value, row[2].Value, row[3].Value, row[4].Value, row[5].Value,
		row[6].Value, row[7].Value, row[8].Value, animated, row[10].Value,
		deletedAt, row[12].Value, row[13].Value)
	return err
}
