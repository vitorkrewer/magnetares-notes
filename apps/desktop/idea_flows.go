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
	defaultIdeaFlowColor    = "#4b75ff"
	defaultIdeaFlowIcon     = "git-branch"
	defaultIdeaNodeType     = "idea"
	defaultIdeaNodeWidth    = 220.0
	defaultIdeaNodeHeight   = 96.0
	defaultIdeaEdgeType     = "bezier"
	defaultIdeaSourceHandle = "right"
	defaultIdeaTargetHandle = "left"
	defaultIdeaStyleJSON    = "{}"

	maxIdeaFlowTitleLen       = 120
	maxIdeaFlowDescriptionLen = 1000

	// Formato ISO-8601 UTC com milissegundos fixos para ordenação lexicográfica LWW consistente.
	ideaFlowTimeFormat = "2006-01-02T15:04:05.000Z"
)

// IdeaFlow representa um diagrama/mapa de ideias persistido localmente.
type IdeaFlow struct {
	ID           string  `json:"id"`
	Title        string  `json:"title"`
	Description  string  `json:"description"`
	Color        string  `json:"color"`
	Icon         string  `json:"icon"`
	ViewportX    float64 `json:"viewportX"`
	ViewportY    float64 `json:"viewportY"`
	ViewportZoom float64 `json:"viewportZoom"`
	Position     int     `json:"position"`
	NodeCount    int     `json:"nodeCount"`
	EdgeCount    int     `json:"edgeCount"`
	DeletedAt    *string `json:"deletedAt"`
	CreatedAt    string  `json:"createdAt"`
	UpdatedAt    string  `json:"updatedAt"`
}

// IdeaNode representa um nó dentro de um Fluxo de Ideias.
type IdeaNode struct {
	ID          string  `json:"id"`
	FlowID      string  `json:"flowId"`
	NodeType    string  `json:"nodeType"`
	Label       string  `json:"label"`
	Content     string  `json:"content"`
	X           float64 `json:"x"`
	Y           float64 `json:"y"`
	Width       float64 `json:"width"`
	Height      float64 `json:"height"`
	Color       string  `json:"color"`
	LinkedKind  string  `json:"linkedKind"`
	LinkedID    string  `json:"linkedId"`
	LinkedLabel string  `json:"linkedLabel"`
	StyleJSON   string  `json:"styleJson"`
	DeletedAt   *string `json:"deletedAt"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
}

// IdeaEdge representa uma conexão direcionada entre dois nós de um Fluxo de Ideias.
type IdeaEdge struct {
	ID           string  `json:"id"`
	FlowID       string  `json:"flowId"`
	SourceNodeID string  `json:"sourceNodeId"`
	TargetNodeID string  `json:"targetNodeId"`
	SourceHandle string  `json:"sourceHandle"`
	TargetHandle string  `json:"targetHandle"`
	Label        string  `json:"label"`
	EdgeType     string  `json:"edgeType"`
	Color        string  `json:"color"`
	Animated     bool    `json:"animated"`
	StyleJSON    string  `json:"styleJson"`
	DeletedAt    *string `json:"deletedAt"`
	CreatedAt    string  `json:"createdAt"`
	UpdatedAt    string  `json:"updatedAt"`
}

// IdeaFlowGraph agrega os metadados de um fluxo com seus nós e arestas ativos.
type IdeaFlowGraph struct {
	Flow  IdeaFlow   `json:"flow"`
	Nodes []IdeaNode `json:"nodes"`
	Edges []IdeaEdge `json:"edges"`
}

// SaveIdeaFlowInput contém os dados para criação ou atualização de metadados de um fluxo.
type SaveIdeaFlowInput struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Color       string `json:"color"`
	Icon        string `json:"icon"`
	Position    *int   `json:"position,omitempty"`
}

// SaveIdeaFlowGraphInput contém o estado completo da tela do fluxo a ser salvo atomicamente.
type SaveIdeaFlowGraphInput struct {
	FlowID       string     `json:"flowId"`
	ViewportX    float64    `json:"viewportX"`
	ViewportY    float64    `json:"viewportY"`
	ViewportZoom float64    `json:"viewportZoom"`
	Nodes        []IdeaNode `json:"nodes"`
	Edges        []IdeaEdge `json:"edges"`
}

func nowIdeaFlowTimestamp() string {
	return time.Now().UTC().Format(ideaFlowTimeFormat)
}

func scanIdeaFlowRow(scanner interface{ Scan(...any) error }) (IdeaFlow, error) {
	var f IdeaFlow
	var deletedAt sql.NullString
	err := scanner.Scan(
		&f.ID, &f.Title, &f.Description, &f.Color, &f.Icon,
		&f.ViewportX, &f.ViewportY, &f.ViewportZoom, &f.Position,
		&deletedAt, &f.CreatedAt, &f.UpdatedAt,
		&f.NodeCount, &f.EdgeCount,
	)
	if err != nil {
		return IdeaFlow{}, err
	}
	if deletedAt.Valid {
		val := deletedAt.String
		f.DeletedAt = &val
	}
	return f, nil
}

const selectIdeaFlowSQL = `
	SELECT f.id, f.title, f.description, f.color, f.icon,
	       f.viewport_x, f.viewport_y, f.viewport_zoom, f.position,
	       f.deleted_at, f.created_at, f.updated_at,
	       (SELECT COUNT(*) FROM idea_nodes n WHERE n.flow_id = f.id AND n.deleted_at IS NULL) AS node_count,
	       (SELECT COUNT(*) FROM idea_edges e WHERE e.flow_id = f.id AND e.deleted_at IS NULL) AS edge_count
	FROM idea_flows f`

// ListIdeaFlows lista todos os fluxos de ideias ativos ordenados por posição.
func (s *noteStore) ListIdeaFlows() ([]IdeaFlow, error) {
	rows, err := s.db.Query(selectIdeaFlowSQL + `
		WHERE f.deleted_at IS NULL
		ORDER BY f.position ASC, f.created_at ASC, f.title COLLATE NOCASE ASC`)
	if err != nil {
		return nil, fmt.Errorf("listar fluxos de ideias: %w", err)
	}
	defer rows.Close()

	flows := make([]IdeaFlow, 0)
	for rows.Next() {
		f, err := scanIdeaFlowRow(rows)
		if err != nil {
			return nil, fmt.Errorf("ler fluxo de ideias: %w", err)
		}
		flows = append(flows, f)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterar fluxos de ideias: %w", err)
	}
	return flows, nil
}

func (s *noteStore) getIdeaFlow(id string) (IdeaFlow, error) {
	row := s.db.QueryRow(selectIdeaFlowSQL+` WHERE f.id = ? AND f.deleted_at IS NULL`, id)
	f, err := scanIdeaFlowRow(row)
	if err != nil {
		return IdeaFlow{}, fmt.Errorf("obter fluxo de ideias: %w", err)
	}
	return f, nil
}

// SaveIdeaFlow cria ou atualiza os metadados de um Fluxo de Ideias.
func (s *noteStore) SaveIdeaFlow(input SaveIdeaFlowInput) (IdeaFlow, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" {
		return IdeaFlow{}, errors.New("o título do fluxo de ideias é obrigatório")
	}
	if utf8.RuneCountInString(title) > maxIdeaFlowTitleLen {
		return IdeaFlow{}, fmt.Errorf("o título do fluxo pode ter no máximo %d caracteres", maxIdeaFlowTitleLen)
	}

	description := strings.TrimSpace(input.Description)
	if utf8.RuneCountInString(description) > maxIdeaFlowDescriptionLen {
		return IdeaFlow{}, fmt.Errorf("a descrição do fluxo pode ter no máximo %d caracteres", maxIdeaFlowDescriptionLen)
	}

	color := strings.TrimSpace(input.Color)
	if color == "" {
		color = defaultIdeaFlowColor
	}
	icon := strings.TrimSpace(input.Icon)
	if icon == "" {
		icon = defaultIdeaFlowIcon
	}

	id := strings.TrimSpace(input.ID)
	if id == "" {
		id = uuid.NewString()
	}

	tx, err := s.db.Begin()
	if err != nil {
		return IdeaFlow{}, fmt.Errorf("iniciar transação de fluxo: %w", err)
	}
	defer tx.Rollback()

	now := nowIdeaFlowTimestamp()
	var deletedAt sql.NullString
	err = tx.QueryRow(`SELECT deleted_at FROM idea_flows WHERE id = ?`, id).Scan(&deletedAt)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		position := 0
		if input.Position != nil {
			position = *input.Position
		} else {
			if err := tx.QueryRow(`SELECT COALESCE(MAX(position), -1) + 1 FROM idea_flows WHERE deleted_at IS NULL`).Scan(&position); err != nil {
				return IdeaFlow{}, fmt.Errorf("calcular posição do fluxo: %w", err)
			}
		}
		_, err = tx.Exec(`INSERT INTO idea_flows(
			id, title, description, color, icon, viewport_x, viewport_y, viewport_zoom,
			position, deleted_at, created_at, updated_at, sync_state
		) VALUES (?, ?, ?, ?, ?, 0, 0, 1, ?, NULL, ?, ?, 'dirty')`,
			id, title, description, color, icon, position, now, now)
		if err != nil {
			return IdeaFlow{}, fmt.Errorf("criar fluxo de ideias: %w", err)
		}
	case err != nil:
		return IdeaFlow{}, fmt.Errorf("buscar fluxo de ideias: %w", err)
	case deletedAt.Valid:
		return IdeaFlow{}, errors.New("o fluxo de ideias foi excluído")
	default:
		if input.Position != nil {
			_, err = tx.Exec(`UPDATE idea_flows SET
				title = ?, description = ?, color = ?, icon = ?, position = ?,
				updated_at = ?, sync_state = 'dirty'
				WHERE id = ?`,
				title, description, color, icon, *input.Position, now, id)
		} else {
			_, err = tx.Exec(`UPDATE idea_flows SET
				title = ?, description = ?, color = ?, icon = ?,
				updated_at = ?, sync_state = 'dirty'
				WHERE id = ?`,
				title, description, color, icon, now, id)
		}
		if err != nil {
			return IdeaFlow{}, fmt.Errorf("atualizar fluxo de ideias: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return IdeaFlow{}, fmt.Errorf("salvar fluxo de ideias: %w", err)
	}
	return s.getIdeaFlow(id)
}

// DeleteIdeaFlow realiza exclusão lógica (tombstone) em cascata no fluxo, seus nós e arestas.
func (s *noteStore) DeleteIdeaFlow(flowID string) error {
	flowID = strings.TrimSpace(flowID)
	if flowID == "" {
		return errors.New("o identificador do fluxo é obrigatório")
	}

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("iniciar exclusão de fluxo: %w", err)
	}
	defer tx.Rollback()

	now := nowIdeaFlowTimestamp()
	res, err := tx.Exec(`UPDATE idea_flows SET deleted_at = ?, updated_at = ?, sync_state = 'dirty'
		WHERE id = ? AND deleted_at IS NULL`, now, now, flowID)
	if err != nil {
		return fmt.Errorf("excluir fluxo de ideias: %w", err)
	}
	if affected, _ := res.RowsAffected(); affected == 0 {
		var exists bool
		if err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM idea_flows WHERE id = ?)`, flowID).Scan(&exists); err != nil {
			return fmt.Errorf("verificar fluxo de ideias: %w", err)
		}
		if !exists {
			return errors.New("fluxo de ideias não encontrado")
		}
	}

	if _, err := tx.Exec(`UPDATE idea_nodes SET deleted_at = ?, updated_at = ?, sync_state = 'dirty'
		WHERE flow_id = ? AND deleted_at IS NULL`, now, now, flowID); err != nil {
		return fmt.Errorf("excluir nós do fluxo: %w", err)
	}

	if _, err := tx.Exec(`UPDATE idea_edges SET deleted_at = ?, updated_at = ?, sync_state = 'dirty'
		WHERE flow_id = ? AND deleted_at IS NULL`, now, now, flowID); err != nil {
		return fmt.Errorf("excluir arestas do fluxo: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("confirmar exclusão do fluxo: %w", err)
	}
	return nil
}

// DuplicateIdeaFlow duplica um fluxo ativo, gerando novos IDs para o fluxo, nós e arestas.
func (s *noteStore) DuplicateIdeaFlow(flowID string) (IdeaFlow, error) {
	flowID = strings.TrimSpace(flowID)
	if flowID == "" {
		return IdeaFlow{}, errors.New("o identificador do fluxo é obrigatório")
	}

	origGraph, err := s.GetIdeaFlowGraph(flowID)
	if err != nil {
		return IdeaFlow{}, err
	}

	tx, err := s.db.Begin()
	if err != nil {
		return IdeaFlow{}, fmt.Errorf("iniciar duplicação de fluxo: %w", err)
	}
	defer tx.Rollback()

	now := nowIdeaFlowTimestamp()
	newFlowID := uuid.NewString()
	newTitle := origGraph.Flow.Title + " (Cópia)"
	if utf8.RuneCountInString(newTitle) > maxIdeaFlowTitleLen {
		runes := []rune(origGraph.Flow.Title)
		suffix := " (Cópia)"
		maxBase := maxIdeaFlowTitleLen - utf8.RuneCountInString(suffix)
		if maxBase > 0 && len(runes) > maxBase {
			newTitle = string(runes[:maxBase]) + suffix
		}
	}

	var nextPos int
	if err := tx.QueryRow(`SELECT COALESCE(MAX(position), -1) + 1 FROM idea_flows WHERE deleted_at IS NULL`).Scan(&nextPos); err != nil {
		return IdeaFlow{}, fmt.Errorf("calcular posição da cópia: %w", err)
	}

	_, err = tx.Exec(`INSERT INTO idea_flows(
		id, title, description, color, icon, viewport_x, viewport_y, viewport_zoom,
		position, deleted_at, created_at, updated_at, sync_state
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'dirty')`,
		newFlowID, newTitle, origGraph.Flow.Description, origGraph.Flow.Color, origGraph.Flow.Icon,
		origGraph.Flow.ViewportX, origGraph.Flow.ViewportY, origGraph.Flow.ViewportZoom,
		nextPos, now, now)
	if err != nil {
		return IdeaFlow{}, fmt.Errorf("inserir cópia do fluxo: %w", err)
	}

	nodeIDMap := make(map[string]string, len(origGraph.Nodes))
	for _, n := range origGraph.Nodes {
		newNodeID := uuid.NewString()
		nodeIDMap[n.ID] = newNodeID
		_, err = tx.Exec(`INSERT INTO idea_nodes(
			id, flow_id, node_type, label, content, x, y, width, height, color,
			linked_kind, linked_id, linked_label, style_json, deleted_at, created_at, updated_at, sync_state
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'dirty')`,
			newNodeID, newFlowID, n.NodeType, n.Label, n.Content, n.X, n.Y, n.Width, n.Height, n.Color,
			n.LinkedKind, n.LinkedID, n.LinkedLabel, n.StyleJSON, now, now)
		if err != nil {
			return IdeaFlow{}, fmt.Errorf("copiar nó %s: %w", n.ID, err)
		}
	}

	for _, e := range origGraph.Edges {
		newSource, okSource := nodeIDMap[e.SourceNodeID]
		newTarget, okTarget := nodeIDMap[e.TargetNodeID]
		if !okSource || !okTarget {
			continue
		}
		newEdgeID := uuid.NewString()
		animated := 0
		if e.Animated {
			animated = 1
		}
		_, err = tx.Exec(`INSERT INTO idea_edges(
			id, flow_id, source_node_id, target_node_id, source_handle, target_handle,
			label, edge_type, color, animated, style_json, deleted_at, created_at, updated_at, sync_state
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'dirty')`,
			newEdgeID, newFlowID, newSource, newTarget, e.SourceHandle, e.TargetHandle,
			e.Label, e.EdgeType, e.Color, animated, e.StyleJSON, now, now)
		if err != nil {
			return IdeaFlow{}, fmt.Errorf("copiar aresta %s: %w", e.ID, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return IdeaFlow{}, fmt.Errorf("confirmar duplicação do fluxo: %w", err)
	}
	return s.getIdeaFlow(newFlowID)
}

// GetIdeaFlowGraph carrega o fluxo e todos os seus nós e arestas ativos.
func (s *noteStore) GetIdeaFlowGraph(flowID string) (IdeaFlowGraph, error) {
	flowID = strings.TrimSpace(flowID)
	if flowID == "" {
		return IdeaFlowGraph{}, errors.New("o identificador do fluxo é obrigatório")
	}

	flow, err := s.getIdeaFlow(flowID)
	if err != nil {
		return IdeaFlowGraph{}, err
	}

	nodeRows, err := s.db.Query(`SELECT id, flow_id, node_type, label, content, x, y, width, height, color,
		linked_kind, linked_id, linked_label, style_json, deleted_at, created_at, updated_at
		FROM idea_nodes
		WHERE flow_id = ? AND deleted_at IS NULL
		ORDER BY created_at ASC, id ASC`, flowID)
	if err != nil {
		return IdeaFlowGraph{}, fmt.Errorf("listar nós do fluxo: %w", err)
	}
	defer nodeRows.Close()

	nodes := make([]IdeaNode, 0)
	for nodeRows.Next() {
		var n IdeaNode
		var deletedAt sql.NullString
		if err := nodeRows.Scan(
			&n.ID, &n.FlowID, &n.NodeType, &n.Label, &n.Content,
			&n.X, &n.Y, &n.Width, &n.Height, &n.Color,
			&n.LinkedKind, &n.LinkedID, &n.LinkedLabel, &n.StyleJSON,
			&deletedAt, &n.CreatedAt, &n.UpdatedAt,
		); err != nil {
			return IdeaFlowGraph{}, fmt.Errorf("ler nó do fluxo: %w", err)
		}
		if deletedAt.Valid {
			val := deletedAt.String
			n.DeletedAt = &val
		}
		nodes = append(nodes, n)
	}
	if err := nodeRows.Err(); err != nil {
		return IdeaFlowGraph{}, fmt.Errorf("iterar nós do fluxo: %w", err)
	}

	edgeRows, err := s.db.Query(`SELECT id, flow_id, source_node_id, target_node_id, source_handle, target_handle,
		label, edge_type, color, animated, style_json, deleted_at, created_at, updated_at
		FROM idea_edges
		WHERE flow_id = ? AND deleted_at IS NULL
		ORDER BY created_at ASC, id ASC`, flowID)
	if err != nil {
		return IdeaFlowGraph{}, fmt.Errorf("listar arestas do fluxo: %w", err)
	}
	defer edgeRows.Close()

	edges := make([]IdeaEdge, 0)
	for edgeRows.Next() {
		var e IdeaEdge
		var animated int
		var deletedAt sql.NullString
		if err := edgeRows.Scan(
			&e.ID, &e.FlowID, &e.SourceNodeID, &e.TargetNodeID, &e.SourceHandle, &e.TargetHandle,
			&e.Label, &e.EdgeType, &e.Color, &animated, &e.StyleJSON,
			&deletedAt, &e.CreatedAt, &e.UpdatedAt,
		); err != nil {
			return IdeaFlowGraph{}, fmt.Errorf("ler aresta do fluxo: %w", err)
		}
		e.Animated = animated != 0
		if deletedAt.Valid {
			val := deletedAt.String
			e.DeletedAt = &val
		}
		edges = append(edges, e)
	}
	if err := edgeRows.Err(); err != nil {
		return IdeaFlowGraph{}, fmt.Errorf("iterar arestas do fluxo: %w", err)
	}
	edgeRows.Close()
	nodeRows.Close()

	s.refreshIdeaNodesLinkedLabels(nodes)

	return IdeaFlowGraph{
		Flow:  flow,
		Nodes: nodes,
		Edges: edges,
	}, nil
}

// resolveIdeaNodeLinkedLabel consulta o título/nome atual do item referenciado por um nó no banco local.
func (s *noteStore) resolveIdeaNodeLinkedLabel(linkedKind, linkedID string) (string, bool) {
	kind := strings.TrimSpace(linkedKind)
	id := strings.TrimSpace(linkedID)
	if kind == "" || id == "" {
		return "", false
	}

	// Para "task" e "sticker", o linkedID pode vir como "containerID::itemID".
	targetID := id
	if idx := strings.LastIndex(id, "::"); idx >= 0 && idx+2 < len(id) {
		targetID = strings.TrimSpace(id[idx+2:])
	}

	switch kind {
	case "note":
		var title string
		if err := s.db.QueryRow(`SELECT title FROM notes WHERE id = ? AND deleted_at IS NULL`, targetID).Scan(&title); err == nil {
			title = strings.TrimSpace(title)
			if title == "" {
				title = "Sem título"
			}
			return title, true
		}
	case "taskList":
		var name string
		if err := s.db.QueryRow(`SELECT name FROM task_lists WHERE id = ? AND deleted_at IS NULL`, targetID).Scan(&name); err == nil {
			name = strings.TrimSpace(name)
			if name != "" {
				return name, true
			}
		}
	case "task":
		var title string
		if err := s.db.QueryRow(`SELECT title FROM tasks WHERE id = ? AND deleted_at IS NULL`, targetID).Scan(&title); err == nil {
			title = strings.TrimSpace(title)
			if title != "" {
				return title, true
			}
		}
	case "stickerBoard":
		var name string
		if err := s.db.QueryRow(`SELECT name FROM sticker_boards WHERE id = ? AND deleted_at IS NULL`, targetID).Scan(&name); err == nil {
			name = strings.TrimSpace(name)
			if name != "" {
				return name, true
			}
		}
	case "sticker":
		var title, body string
		if err := s.db.QueryRow(`SELECT title, body FROM stickers WHERE id = ? AND deleted_at IS NULL`, targetID).Scan(&title, &body); err == nil {
			title = strings.TrimSpace(title)
			if title != "" {
				return title, true
			}
			body = strings.TrimSpace(body)
			if body != "" {
				runes := []rune(body)
				if len(runes) > 48 {
					return string(runes[:48]), true
				}
				return body, true
			}
			return "Sticker", true
		}
	}
	return "", false
}

// refreshIdeaNodesLinkedLabels mantém os rótulos de referência sincronizados com os itens reais do banco.
func (s *noteStore) refreshIdeaNodesLinkedLabels(nodes []IdeaNode) {
	now := time.Now().UTC().Format(ideaFlowTimeFormat)
	for i := range nodes {
		if nodes[i].LinkedKind == "" || nodes[i].LinkedID == "" {
			continue
		}
		freshLabel, ok := s.resolveIdeaNodeLinkedLabel(nodes[i].LinkedKind, nodes[i].LinkedID)
		if !ok || freshLabel == "" {
			continue
		}
		oldLinked := nodes[i].LinkedLabel
		labelChanged := false
		if nodes[i].Label == "" || nodes[i].Label == oldLinked {
			if nodes[i].Label != freshLabel {
				nodes[i].Label = freshLabel
				labelChanged = true
			}
		}
		if oldLinked != freshLabel {
			nodes[i].LinkedLabel = freshLabel
			labelChanged = true
		}
		if labelChanged {
			_, _ = s.db.Exec(
				`UPDATE idea_nodes SET label = ?, linked_label = ?, updated_at = ?, sync_state = 'dirty' WHERE id = ?`,
				nodes[i].Label, nodes[i].LinkedLabel, now, nodes[i].ID,
			)
		}
	}
}

// SaveIdeaFlowGraph atualiza o viewport do fluxo, faz upsert dos nós/arestas enviados
// e aplica exclusão lógica nos nós/arestas que pertenciam ao fluxo e foram removidos.
func (s *noteStore) SaveIdeaFlowGraph(input SaveIdeaFlowGraphInput) (IdeaFlowGraph, error) {
	flowID := strings.TrimSpace(input.FlowID)
	if flowID == "" {
		return IdeaFlowGraph{}, errors.New("o identificador do fluxo é obrigatório")
	}

	zoom := input.ViewportZoom
	if zoom <= 0 {
		zoom = 1
	}

	tx, err := s.db.Begin()
	if err != nil {
		return IdeaFlowGraph{}, fmt.Errorf("iniciar salvamento do grafo: %w", err)
	}
	defer tx.Rollback()

	var deletedAt sql.NullString
	err = tx.QueryRow(`SELECT deleted_at FROM idea_flows WHERE id = ?`, flowID).Scan(&deletedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return IdeaFlowGraph{}, errors.New("fluxo de ideias não encontrado")
	}
	if err != nil {
		return IdeaFlowGraph{}, fmt.Errorf("verificar fluxo de ideias: %w", err)
	}
	if deletedAt.Valid {
		return IdeaFlowGraph{}, errors.New("o fluxo de ideias foi excluído")
	}

	now := nowIdeaFlowTimestamp()
	if _, err := tx.Exec(`UPDATE idea_flows SET
		viewport_x = ?, viewport_y = ?, viewport_zoom = ?, updated_at = ?, sync_state = 'dirty'
		WHERE id = ?`,
		input.ViewportX, input.ViewportY, zoom, now, flowID); err != nil {
		return IdeaFlowGraph{}, fmt.Errorf("atualizar viewport do fluxo: %w", err)
	}

	keptNodeIDs := make(map[string]struct{}, len(input.Nodes))
	for _, n := range input.Nodes {
		nodeID := strings.TrimSpace(n.ID)
		if nodeID == "" {
			nodeID = uuid.NewString()
		}
		nodeType := strings.TrimSpace(n.NodeType)
		if nodeType == "" {
			nodeType = defaultIdeaNodeType
		}
		width := n.Width
		if width <= 0 {
			width = defaultIdeaNodeWidth
		}
		height := n.Height
		if height <= 0 {
			height = defaultIdeaNodeHeight
		}
		styleJSON := strings.TrimSpace(n.StyleJSON)
		if styleJSON == "" {
			styleJSON = defaultIdeaStyleJSON
		}
		createdAt := strings.TrimSpace(n.CreatedAt)
		if createdAt == "" {
			createdAt = now
		}

		keptNodeIDs[nodeID] = struct{}{}
		_, err := tx.Exec(`INSERT INTO idea_nodes(
			id, flow_id, node_type, label, content, x, y, width, height, color,
			linked_kind, linked_id, linked_label, style_json, deleted_at, created_at, updated_at, sync_state
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'dirty')
		ON CONFLICT(id) DO UPDATE SET
			flow_id = excluded.flow_id,
			node_type = excluded.node_type,
			label = excluded.label,
			content = excluded.content,
			x = excluded.x,
			y = excluded.y,
			width = excluded.width,
			height = excluded.height,
			color = excluded.color,
			linked_kind = excluded.linked_kind,
			linked_id = excluded.linked_id,
			linked_label = excluded.linked_label,
			style_json = excluded.style_json,
			deleted_at = NULL,
			updated_at = excluded.updated_at,
			sync_state = 'dirty'`,
			nodeID, flowID, nodeType, n.Label, n.Content, n.X, n.Y, width, height, n.Color,
			n.LinkedKind, n.LinkedID, n.LinkedLabel, styleJSON, createdAt, now)
		if err != nil {
			return IdeaFlowGraph{}, fmt.Errorf("salvar nó %s: %w", nodeID, err)
		}
	}

	if err := softDeleteMissingIdeaItems(tx, "idea_nodes", flowID, keptNodeIDs, now); err != nil {
		return IdeaFlowGraph{}, err
	}

	keptEdgeIDs := make(map[string]struct{}, len(input.Edges))
	for _, e := range input.Edges {
		sourceID := strings.TrimSpace(e.SourceNodeID)
		targetID := strings.TrimSpace(e.TargetNodeID)
		if sourceID == "" || targetID == "" {
			continue
		}
		edgeID := strings.TrimSpace(e.ID)
		if edgeID == "" {
			edgeID = uuid.NewString()
		}
		sourceHandle := strings.TrimSpace(e.SourceHandle)
		if sourceHandle == "" {
			sourceHandle = defaultIdeaSourceHandle
		}
		targetHandle := strings.TrimSpace(e.TargetHandle)
		if targetHandle == "" {
			targetHandle = defaultIdeaTargetHandle
		}
		edgeType := strings.TrimSpace(e.EdgeType)
		if edgeType == "" {
			edgeType = defaultIdeaEdgeType
		}
		styleJSON := strings.TrimSpace(e.StyleJSON)
		if styleJSON == "" {
			styleJSON = defaultIdeaStyleJSON
		}
		createdAt := strings.TrimSpace(e.CreatedAt)
		if createdAt == "" {
			createdAt = now
		}
		animated := 0
		if e.Animated {
			animated = 1
		}

		keptEdgeIDs[edgeID] = struct{}{}
		_, err := tx.Exec(`INSERT INTO idea_edges(
			id, flow_id, source_node_id, target_node_id, source_handle, target_handle,
			label, edge_type, color, animated, style_json, deleted_at, created_at, updated_at, sync_state
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'dirty')
		ON CONFLICT(id) DO UPDATE SET
			flow_id = excluded.flow_id,
			source_node_id = excluded.source_node_id,
			target_node_id = excluded.target_node_id,
			source_handle = excluded.source_handle,
			target_handle = excluded.target_handle,
			label = excluded.label,
			edge_type = excluded.edge_type,
			color = excluded.color,
			animated = excluded.animated,
			style_json = excluded.style_json,
			deleted_at = NULL,
			updated_at = excluded.updated_at,
			sync_state = 'dirty'`,
			edgeID, flowID, sourceID, targetID, sourceHandle, targetHandle,
			e.Label, edgeType, e.Color, animated, styleJSON, createdAt, now)
		if err != nil {
			return IdeaFlowGraph{}, fmt.Errorf("salvar aresta %s: %w", edgeID, err)
		}
	}

	if err := softDeleteMissingIdeaItems(tx, "idea_edges", flowID, keptEdgeIDs, now); err != nil {
		return IdeaFlowGraph{}, err
	}

	if err := tx.Commit(); err != nil {
		return IdeaFlowGraph{}, fmt.Errorf("confirmar salvamento do grafo: %w", err)
	}
	return s.GetIdeaFlowGraph(flowID)
}

func softDeleteMissingIdeaItems(tx *sql.Tx, table, flowID string, keptIDs map[string]struct{}, now string) error {
	rows, err := tx.Query(fmt.Sprintf(`SELECT id FROM %s WHERE flow_id = ? AND deleted_at IS NULL`, table), flowID)
	if err != nil {
		return fmt.Errorf("listar %s ativos: %w", table, err)
	}
	var toDelete []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			_ = rows.Close()
			return fmt.Errorf("ler id de %s: %w", table, err)
		}
		if _, ok := keptIDs[id]; !ok {
			toDelete = append(toDelete, id)
		}
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return fmt.Errorf("iterar %s: %w", table, err)
	}
	_ = rows.Close()

	for _, id := range toDelete {
		if _, err := tx.Exec(fmt.Sprintf(`UPDATE %s SET deleted_at = ?, updated_at = ?, sync_state = 'dirty' WHERE id = ?`, table),
			now, now, id); err != nil {
			return fmt.Errorf("remover %s %s: %w", table, id, err)
		}
	}
	return nil
}
