package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

type TursoClient struct {
	httpEndpoint string
	authToken    string
	client       *http.Client
}

func NewTursoClient(dbURL, authToken string) *TursoClient {
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
		client:       &http.Client{Timeout: 10 * time.Second},
	}
}

func NewTursoClientFromEnv() *TursoClient {
	dbURL := os.Getenv("TURSO_DATABASE_URL")
	authToken := os.Getenv("TURSO_AUTH_TOKEN")
	return NewTursoClient(dbURL, authToken)
}

type TursoStmt struct {
	SQL  string       `json:"sql"`
	Args []TursoValue `json:"args,omitempty"`
}

type TursoValue struct {
	Type  string `json:"type"`
	Value string `json:"value,omitempty"`
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
		return TursoPipelineResult{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return TursoPipelineResult{}, fmt.Errorf("turso error %d: %s", resp.StatusCode, string(respBody))
	}

	var response TursoPipelineResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return TursoPipelineResult{}, fmt.Errorf("decode Turso response: %w", err)
	}
	if len(response.Results) == 0 {
		return TursoPipelineResult{}, errors.New("empty Turso response")
	}
	result := response.Results[0]
	if result.Type != "ok" {
		return TursoPipelineResult{}, fmt.Errorf("turso pipeline error: %s", string(result.Error))
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
		case int:
			typedArgs = append(typedArgs, TursoValue{Type: "integer", Value: fmt.Sprintf("%d", value)})
		case int64:
			typedArgs = append(typedArgs, TursoValue{Type: "integer", Value: fmt.Sprintf("%d", value)})
		case int32:
			typedArgs = append(typedArgs, TursoValue{Type: "integer", Value: fmt.Sprintf("%d", value)})
		case float64:
			typedArgs = append(typedArgs, TursoValue{Type: "float", Value: fmt.Sprintf("%g", value)})
		default:
			return nil, fmt.Errorf("unsupported Turso argument type %T", arg)
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
			revision INTEGER NOT NULL DEFAULT 1,
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
	return nil
}
