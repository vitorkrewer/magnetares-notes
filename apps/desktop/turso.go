package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type TursoClient struct {
	httpEndpoint string
	authToken    string
	client       *http.Client
}

func NewTursoClient(dbURL, authToken string) *TursoClient {
	dbURL = strings.TrimSpace(dbURL)
	authToken = strings.TrimSpace(authToken)
	if dbURL == "" || authToken == "" {
		return nil
	}

	endpoint := strings.Replace(dbURL, "libsql://", "https://", 1)
	if !strings.HasSuffix(endpoint, "/v2/pipeline") {
		endpoint = strings.TrimSuffix(endpoint, "/") + "/v2/pipeline"
	}

	return &TursoClient{
		httpEndpoint: endpoint,
		authToken:    authToken,
		client:       &http.Client{Timeout: 8 * time.Second},
	}
}

type TursoStmt struct {
	SQL  string       `json:"sql"`
	Args []TursoValue `json:"args,omitempty"`
}

type TursoValue struct {
	Type  string `json:"type"`
	Value string `json:"value,omitempty"`
}

func (v TursoValue) MarshalJSON() ([]byte, error) {
	if v.Type == "null" {
		return []byte(`{"type":"null"}`), nil
	}
	type Alias TursoValue
	return json.Marshal(&struct {
		Alias
		Value string `json:"value"`
	}{
		Alias: Alias(v),
		Value: v.Value,
	})
}

type TursoRequest struct {
	Type string     `json:"type"`
	Stmt *TursoStmt `json:"stmt,omitempty"`
}

type TursoPipelineBody struct {
	Requests []TursoRequest `json:"requests"`
}

type TursoPipelineResponse struct {
	Results []TursoPipelineResult `json:"results"`
}

type TursoPipelineResult struct {
	Type     string `json:"type"`
	Response struct {
		Type   string `json:"type"`
		Result struct {
			Cols             []TursoColumn   `json:"cols"`
			Rows             [][]TursoValue  `json:"rows"`
			AffectedRowCount int64           `json:"affected_row_count"`
			LastInsertRowID  json.RawMessage `json:"last_insert_rowid"`
		} `json:"result"`
	} `json:"response"`
	Error json.RawMessage `json:"error"`
}

type TursoColumn struct {
	Name string `json:"name"`
}

func (t *TursoClient) Ping() (time.Duration, error) {
	start := time.Now()
	_, _, err := t.Query("SELECT 1")
	if err != nil {
		return 0, err
	}
	return time.Since(start), nil
}

func (t *TursoClient) Execute(sql string, args ...any) error {
	_, err := t.run(sql, args...)
	return err
}

func (t *TursoClient) Query(sql string, args ...any) ([]string, [][]TursoValue, error) {
	result, err := t.run(sql, args...)
	if err != nil {
		return nil, nil, err
	}
	columns := make([]string, len(result.Response.Result.Cols))
	for i, column := range result.Response.Result.Cols {
		columns[i] = column.Name
	}
	return columns, result.Response.Result.Rows, nil
}

func (t *TursoClient) run(sql string, args ...any) (TursoPipelineResult, error) {
	typedArgs, err := tursoArguments(args)
	if err != nil {
		return TursoPipelineResult{}, err
	}
	body := TursoPipelineBody{
		Requests: []TursoRequest{
			{Type: "execute", Stmt: &TursoStmt{SQL: sql, Args: typedArgs}},
			{Type: "close"},
		},
	}

	jsonBytes, err := json.Marshal(body)
	if err != nil {
		return TursoPipelineResult{}, err
	}

	req, err := http.NewRequest("POST", t.httpEndpoint, bytes.NewReader(jsonBytes))
	if err != nil {
		return TursoPipelineResult{}, err
	}
	req.Header.Set("Authorization", "Bearer "+t.authToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := t.client.Do(req)
	if err != nil {
		if strings.Contains(err.Error(), "no such host") || strings.Contains(err.Error(), "connectex") {
			return TursoPipelineResult{}, fmt.Errorf("não foi possível alcançar o servidor Turso (%w). Verifique sua URL e conexão com a internet", err)
		}
		return TursoPipelineResult{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return TursoPipelineResult{}, errors.New("token Turso inválido ou expirado (HTTP 401/403)")
	}

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return TursoPipelineResult{}, fmt.Errorf("turso HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	var response TursoPipelineResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return TursoPipelineResult{}, fmt.Errorf("decodificar resposta do Turso: %w", err)
	}
	if len(response.Results) == 0 {
		return TursoPipelineResult{}, errors.New("resposta vazia do Turso")
	}
	result := response.Results[0]
	if result.Type != "ok" {
		return TursoPipelineResult{}, fmt.Errorf("turso pipeline erro: %s", string(result.Error))
	}
	return result, nil
}

func tursoArguments(args []any) ([]TursoValue, error) {
	typedArgs := make([]TursoValue, 0, len(args))
	for _, arg := range args {
		switch value := arg.(type) {
		case nil:
			typedArgs = append(typedArgs, TursoValue{Type: "null"})
		case string:
			typedArgs = append(typedArgs, TursoValue{Type: "text", Value: value})
		case *string:
			if value == nil {
				typedArgs = append(typedArgs, TursoValue{Type: "null"})
			} else {
				typedArgs = append(typedArgs, TursoValue{Type: "text", Value: *value})
			}
		case int:
			typedArgs = append(typedArgs, TursoValue{Type: "integer", Value: fmt.Sprintf("%d", value)})
		case int64:
			typedArgs = append(typedArgs, TursoValue{Type: "integer", Value: fmt.Sprintf("%d", value)})
		case *int64:
			if value == nil {
				typedArgs = append(typedArgs, TursoValue{Type: "null"})
			} else {
				typedArgs = append(typedArgs, TursoValue{Type: "integer", Value: fmt.Sprintf("%d", *value)})
			}
		case int32:
			typedArgs = append(typedArgs, TursoValue{Type: "integer", Value: fmt.Sprintf("%d", value)})
		case uint, uint64, uint32:
			typedArgs = append(typedArgs, TursoValue{Type: "integer", Value: fmt.Sprintf("%d", value)})
		case float64:
			typedArgs = append(typedArgs, TursoValue{Type: "float", Value: fmt.Sprintf("%g", value)})
		case bool:
			intVal := "0"
			if value {
				intVal = "1"
			}
			typedArgs = append(typedArgs, TursoValue{Type: "integer", Value: intVal})
		case time.Time:
			typedArgs = append(typedArgs, TursoValue{Type: "integer", Value: fmt.Sprintf("%d", value.UTC().UnixMilli())})
		case *time.Time:
			if value == nil {
				typedArgs = append(typedArgs, TursoValue{Type: "null"})
			} else {
				typedArgs = append(typedArgs, TursoValue{Type: "integer", Value: fmt.Sprintf("%d", value.UTC().UnixMilli())})
			}
		default:
			return nil, fmt.Errorf("tipo de argumento Turso não suportado %T", arg)
		}
	}
	return typedArgs, nil
}

func (t *TursoClient) InitSchema() error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS sync_notes (
			user_id TEXT NOT NULL,
			id TEXT NOT NULL,
			title TEXT NOT NULL DEFAULT '',
			body TEXT NOT NULL DEFAULT '',
			body_text TEXT NOT NULL DEFAULT '',
			folder_id TEXT NOT NULL DEFAULT 'folder-default',
			folder TEXT NOT NULL DEFAULT 'Notas',
			pinned_at INTEGER,
			checklist_total INTEGER NOT NULL DEFAULT 0,
			checklist_open INTEGER NOT NULL DEFAULT 0,
			tags TEXT NOT NULL DEFAULT '[]',
			revision INTEGER NOT NULL DEFAULT 1,
			deleted_at INTEGER,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			PRIMARY KEY (user_id, id)
		)`,
		`CREATE TABLE IF NOT EXISTS sync_folders (
			user_id TEXT NOT NULL,
			id TEXT NOT NULL,
			name TEXT NOT NULL DEFAULT '',
			parent_id TEXT,
			color TEXT NOT NULL DEFAULT '',
			icon TEXT NOT NULL DEFAULT '',
			deleted_at INTEGER,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			PRIMARY KEY (user_id, id)
		)`,
		`CREATE TABLE IF NOT EXISTS sync_note_changes (
			cursor INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id TEXT NOT NULL,
			note_id TEXT NOT NULL,
			revision INTEGER NOT NULL,
			changed_at INTEGER NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS sync_note_changes_by_user_cursor
			ON sync_note_changes(user_id, cursor)`,
		`CREATE TABLE IF NOT EXISTS sync_mutations (
			user_id TEXT NOT NULL,
			mutation_id TEXT NOT NULL,
			note_id TEXT NOT NULL,
			revision INTEGER NOT NULL,
			cursor INTEGER NOT NULL,
			PRIMARY KEY (user_id, mutation_id)
		)`,
	}
	for _, statement := range statements {
		if err := t.Execute(statement); err != nil {
			return err
		}
	}

	alterStatements := []string{
		`ALTER TABLE sync_notes ADD COLUMN folder_id TEXT NOT NULL DEFAULT 'folder-default'`,
		`ALTER TABLE sync_notes ADD COLUMN folder TEXT NOT NULL DEFAULT 'Notas'`,
		`ALTER TABLE sync_notes ADD COLUMN pinned_at INTEGER`,
		`ALTER TABLE sync_notes ADD COLUMN checklist_total INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE sync_notes ADD COLUMN checklist_open INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE sync_notes ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'`,
		`ALTER TABLE sync_folders ADD COLUMN color TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE sync_folders ADD COLUMN icon TEXT NOT NULL DEFAULT ''`,
	}
	for _, statement := range alterStatements {
		_ = t.Execute(statement)
	}

	complianceStatements := []string{
		`UPDATE sync_notes SET folder_id = 'folder-default', folder = 'Notas' WHERE folder_id IS NULL OR folder_id = ''`,
		`UPDATE sync_folders SET color = '#6366f1' WHERE color IS NULL OR color = ''`,
		`UPDATE sync_folders SET icon = 'folder' WHERE icon IS NULL OR icon = ''`,
	}
	for _, statement := range complianceStatements {
		_ = t.Execute(statement)
	}

	return nil
}

func tursoInt(value TursoValue) (int64, error) {
	if value.Type == "null" || value.Value == "" {
		return 0, nil
	}
	return strconv.ParseInt(value.Value, 10, 64)
}

func tursoTime(value TursoValue) (time.Time, error) {
	milli, err := tursoInt(value)
	if err != nil {
		return time.Time{}, err
	}
	return time.UnixMilli(milli).UTC(), nil
}
