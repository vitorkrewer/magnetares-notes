-- 0015_idea_flows.sql: Suporte ao módulo Fluxo de Ideias (mapas mentais e diagramas de nós).

CREATE TABLE IF NOT EXISTS idea_flows (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#4b75ff',
    icon TEXT NOT NULL DEFAULT 'git-branch',
    viewport_x REAL NOT NULL DEFAULT 0,
    viewport_y REAL NOT NULL DEFAULT 0,
    viewport_zoom REAL NOT NULL DEFAULT 1,
    position INTEGER NOT NULL DEFAULT 0,
    deleted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sync_state TEXT NOT NULL DEFAULT 'dirty'
);

CREATE INDEX IF NOT EXISTS idx_idea_flows_deleted_at
    ON idea_flows(deleted_at);

CREATE INDEX IF NOT EXISTS idx_idea_flows_position
    ON idea_flows(position, created_at);

CREATE INDEX IF NOT EXISTS idx_idea_flows_sync_state
    ON idea_flows(sync_state);

CREATE TABLE IF NOT EXISTS idea_nodes (
    id TEXT PRIMARY KEY,
    flow_id TEXT NOT NULL REFERENCES idea_flows(id) ON DELETE CASCADE,
    node_type TEXT NOT NULL DEFAULT 'idea',
    label TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    x REAL NOT NULL DEFAULT 0,
    y REAL NOT NULL DEFAULT 0,
    width REAL NOT NULL DEFAULT 220,
    height REAL NOT NULL DEFAULT 96,
    color TEXT NOT NULL DEFAULT '',
    linked_kind TEXT NOT NULL DEFAULT '',
    linked_id TEXT NOT NULL DEFAULT '',
    linked_label TEXT NOT NULL DEFAULT '',
    style_json TEXT NOT NULL DEFAULT '{}',
    deleted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sync_state TEXT NOT NULL DEFAULT 'dirty'
);

CREATE INDEX IF NOT EXISTS idx_idea_nodes_flow_id
    ON idea_nodes(flow_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_idea_nodes_deleted_at
    ON idea_nodes(deleted_at);

CREATE INDEX IF NOT EXISTS idx_idea_nodes_sync_state
    ON idea_nodes(sync_state);

CREATE TABLE IF NOT EXISTS idea_edges (
    id TEXT PRIMARY KEY,
    flow_id TEXT NOT NULL REFERENCES idea_flows(id) ON DELETE CASCADE,
    source_node_id TEXT NOT NULL,
    target_node_id TEXT NOT NULL,
    source_handle TEXT NOT NULL DEFAULT 'right',
    target_handle TEXT NOT NULL DEFAULT 'left',
    label TEXT NOT NULL DEFAULT '',
    edge_type TEXT NOT NULL DEFAULT 'bezier',
    color TEXT NOT NULL DEFAULT '',
    animated INTEGER NOT NULL DEFAULT 0,
    style_json TEXT NOT NULL DEFAULT '{}',
    deleted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sync_state TEXT NOT NULL DEFAULT 'dirty'
);

CREATE INDEX IF NOT EXISTS idx_idea_edges_flow_id
    ON idea_edges(flow_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_idea_edges_deleted_at
    ON idea_edges(deleted_at);

CREATE INDEX IF NOT EXISTS idx_idea_edges_sync_state
    ON idea_edges(sync_state);
