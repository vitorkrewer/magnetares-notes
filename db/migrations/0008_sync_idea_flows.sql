-- Tabelas de sincronização do módulo Fluxo de Ideias (Turso libSQL).
-- Estratégia Last-Write-Wins (LWW) por updated_at na ordem referencial:
-- sync_idea_flows -> sync_idea_nodes -> sync_idea_edges.

CREATE TABLE IF NOT EXISTS sync_idea_flows (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
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
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS sync_idea_nodes (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  flow_id TEXT NOT NULL,
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
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS sync_idea_edges (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  flow_id TEXT NOT NULL,
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
  PRIMARY KEY (user_id, id)
);
