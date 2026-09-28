package tests

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

const (
	testProfile = "five-computers-profile"
	noteID      = "note-five-computers"
)

type pipelineValue struct {
	Type  string `json:"type"`
	Value string `json:"value,omitempty"`
}

type pipelineStatement struct {
	SQL  string          `json:"sql"`
	Args []pipelineValue `json:"args,omitempty"`
}

type pipelineRequest struct {
	Type string             `json:"type"`
	Stmt *pipelineStatement `json:"stmt,omitempty"`
}

type pipelineBody struct {
	Requests []pipelineRequest `json:"requests"`
}

type pipelineColumn struct {
	Name string `json:"name"`
}

type pipelineResultData struct {
	Cols             []pipelineColumn  `json:"cols"`
	Rows             [][]pipelineValue `json:"rows"`
	AffectedRowCount int64             `json:"affected_row_count"`
}

type pipelineResponse struct {
	Type   string             `json:"type"`
	Result pipelineResultData `json:"result"`
}

type pipelineResult struct {
	Type     string           `json:"type"`
	Response pipelineResponse `json:"response"`
	Error    json.RawMessage  `json:"error,omitempty"`
}

type pipelineEnvelope struct {
	Results []pipelineResult `json:"results"`
}

type fakeTurso struct {
	db *sql.DB
}

func newFakeTurso(t *testing.T) *fakeTurso {
	t.Helper()
	db, err := sql.Open("sqlite", "file:five-computers?mode=memory&cache=shared")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = db.Close() })
	return &fakeTurso{db: db}
}

func (f *fakeTurso) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	var body pipelineBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var tx *sql.Tx
	results := make([]pipelineResult, 0, len(body.Requests))
	for _, request := range body.Requests {
		if request.Type == "close" {
			results = append(results, pipelineResult{Type: "ok"})
			continue
		}
		if request.Type != "execute" || request.Stmt == nil {
			results = append(results, pipelineError("unsupported pipeline request"))
			break
		}

		result, nextTx, err := f.execute(tx, request.Stmt)
		if err != nil {
			if tx != nil {
				_ = tx.Rollback()
			}
			results = append(results, pipelineError(err.Error()))
			break
		}
		tx = nextTx
		results = append(results, result)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(pipelineEnvelope{Results: results})
}

func pipelineError(message string) pipelineResult {
	encoded, _ := json.Marshal(message)
	return pipelineResult{Type: "error", Error: encoded}
}

func (f *fakeTurso) execute(tx *sql.Tx, statement *pipelineStatement) (pipelineResult, *sql.Tx, error) {
	sqlText := strings.TrimSpace(statement.SQL)
	upper := strings.ToUpper(sqlText)
	if upper == "BEGIN" {
		if tx != nil {
			return pipelineResult{}, tx, fmt.Errorf("nested transaction")
		}
		next, err := f.db.Begin()
		return pipelineResult{Type: "ok"}, next, err
	}
	if upper == "COMMIT" {
		if tx == nil {
			return pipelineResult{}, nil, fmt.Errorf("commit without transaction")
		}
		return pipelineResult{Type: "ok"}, nil, tx.Commit()
	}
	if upper == "ROLLBACK" {
		if tx == nil {
			return pipelineResult{Type: "ok"}, nil, nil
		}
		return pipelineResult{Type: "ok"}, nil, tx.Rollback()
	}

	args := make([]any, len(statement.Args))
	for index, arg := range statement.Args {
		if arg.Type == "null" {
			args[index] = nil
		} else if arg.Type == "integer" {
			value, err := strconv.ParseInt(arg.Value, 10, 64)
			if err != nil {
				return pipelineResult{}, tx, err
			}
			args[index] = value
		} else if arg.Type == "float" {
			value, err := strconv.ParseFloat(arg.Value, 64)
			if err != nil {
				return pipelineResult{}, tx, err
			}
			args[index] = value
		} else {
			args[index] = arg.Value
		}
	}

	if isQuery(upper) {
		var rows *sql.Rows
		var err error
		if tx != nil {
			rows, err = tx.Query(sqlText, args...)
		} else {
			rows, err = f.db.Query(sqlText, args...)
		}
		if err != nil {
			return pipelineResult{}, tx, err
		}
		defer rows.Close()
		columns, err := rows.Columns()
		if err != nil {
			return pipelineResult{}, tx, err
		}
		result := pipelineResult{Type: "ok"}
		for _, column := range columns {
			result.Response.Result.Cols = append(result.Response.Result.Cols, pipelineColumn{Name: column})
		}
		for rows.Next() {
			values := make([]any, len(columns))
			destinations := make([]any, len(columns))
			for index := range values {
				destinations[index] = &values[index]
			}
			if err := rows.Scan(destinations...); err != nil {
				return pipelineResult{}, tx, err
			}
			encoded := make([]pipelineValue, len(values))
			for index, value := range values {
				encoded[index] = encodePipelineValue(value)
			}
			result.Response.Result.Rows = append(result.Response.Result.Rows, encoded)
		}
		return result, tx, rows.Err()
	}

	var result sql.Result
	var err error
	if tx != nil {
		result, err = tx.Exec(sqlText, args...)
	} else {
		result, err = f.db.Exec(sqlText, args...)
	}
	if err != nil {
		return pipelineResult{}, tx, err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return pipelineResult{}, tx, err
	}
	return pipelineResult{
		Type:     "ok",
		Response: pipelineResponse{Result: pipelineResultData{AffectedRowCount: affected}},
	}, tx, nil
}

func isQuery(sqlText string) bool {
	return strings.HasPrefix(sqlText, "SELECT") || strings.HasPrefix(sqlText, "PRAGMA") || strings.HasPrefix(sqlText, "WITH")
}

func encodePipelineValue(value any) pipelineValue {
	switch typed := value.(type) {
	case nil:
		return pipelineValue{Type: "null"}
	case int64:
		return pipelineValue{Type: "integer", Value: strconv.FormatInt(typed, 10)}
	case float64:
		return pipelineValue{Type: "float", Value: strconv.FormatFloat(typed, 'g', -1, 64)}
	case []byte:
		return pipelineValue{Type: "text", Value: string(typed)}
	default:
		return pipelineValue{Type: "text", Value: fmt.Sprint(typed)}
	}
}

type apiProcess struct {
	baseURL string
	cmd     *exec.Cmd
}

func startAPI(t *testing.T, tursoURL string) *apiProcess {
	t.Helper()
	root := repositoryRoot(t)
	port := freePort(t)
	apiDir := filepath.Join(root, "apps", "api")
	binaryPath := filepath.Join(t.TempDir(), "magnetares-api")
	if runtime.GOOS == "windows" {
		binaryPath += ".exe"
	}
	build := exec.Command("go", "build", "-o", binaryPath, ".")
	build.Dir = apiDir
	if output, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build API for integration test: %v\n%s", err, output)
	}

	cmd := exec.Command(binaryPath)
	cmd.Dir = apiDir
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	cmd.Env = filteredEnvironment("TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "PORT")
	cmd.Env = append(cmd.Env,
		"TURSO_DATABASE_URL="+tursoURL,
		"TURSO_AUTH_TOKEN=test-token",
		"PORT="+strconv.Itoa(port),
	)
	if err := cmd.Start(); err != nil {
		t.Fatalf("start API: %v", err)
	}
	process := &apiProcess{baseURL: fmt.Sprintf("http://127.0.0.1:%d", port), cmd: cmd}
	t.Cleanup(func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		finished := make(chan struct{})
		go func() {
			_ = cmd.Wait()
			close(finished)
		}()
		select {
		case <-finished:
		case <-time.After(5 * time.Second):
		}
	})
	waitForAPI(t, process.baseURL)
	return process
}

func waitForAPI(t *testing.T, baseURL string) {
	t.Helper()
	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		response, err := http.Get(baseURL + "/healthz")
		if err == nil {
			_ = response.Body.Close()
			if response.StatusCode == http.StatusNoContent {
				return
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("API did not become ready at %s", baseURL)
}

func repositoryRoot(t *testing.T) string {
	t.Helper()
	workingDirectory, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for current := workingDirectory; current != filepath.Dir(current); current = filepath.Dir(current) {
		if _, err := os.Stat(filepath.Join(current, "apps", "api", "go.mod")); err == nil {
			return current
		}
	}
	t.Fatalf("repository root not found from %s", workingDirectory)
	return ""
}

func freePort(t *testing.T) int {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	return listener.Addr().(*net.TCPAddr).Port
}

func filteredEnvironment(names ...string) []string {
	blocked := make(map[string]bool, len(names))
	for _, name := range names {
		blocked[name] = true
	}
	result := make([]string, 0)
	for _, entry := range os.Environ() {
		name, _, found := strings.Cut(entry, "=")
		if !found || !blocked[name] {
			result = append(result, entry)
		}
	}
	return result
}

type remoteNote struct {
	ID             string     `json:"id"`
	Title          string     `json:"title"`
	Body           string     `json:"body"`
	BodyText       string     `json:"bodyText"`
	Folder         string     `json:"folder"`
	FolderID       string     `json:"folderId"`
	Revision       int64      `json:"revision"`
	Tags           []string   `json:"tags"`
	ChecklistTotal int64      `json:"checklistTotal"`
	ChecklistOpen  int64      `json:"checklistOpen"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
	DeletedAt      *time.Time `json:"deletedAt"`
}

type mutationResponse struct {
	Note   remoteNote `json:"note"`
	Cursor string     `json:"cursor"`
}

type conflictResponse struct {
	Code   string     `json:"code"`
	Note   remoteNote `json:"note"`
	Cursor string     `json:"cursor"`
}

type change struct {
	Cursor string     `json:"cursor"`
	Note   remoteNote `json:"note"`
}

type changesPage struct {
	Changes    []change `json:"changes"`
	NextCursor string   `json:"nextCursor"`
	HasMore    bool     `json:"hasMore"`
}

type computer struct {
	name       string
	cursor     string
	revision   int64
	localTitle string
	localBody  string
	mutationID string
}

type mutationOutcome struct {
	computer *computer
	status   int
	result   mutationResponse
	conflict conflictResponse
	err      error
}

func TestFiveComputersConcurrentEdits(t *testing.T) {
	fake := newFakeTurso(t)
	tursoServer := httptest.NewServer(fake)
	defer tursoServer.Close()
	api := startAPI(t, tursoServer.URL)

	computers := make([]*computer, 5)
	for index := range computers {
		computers[index] = &computer{name: fmt.Sprintf("computer-%d", index+1), cursor: "0"}
	}

	initial := computers[0]
	initial.mutationID = "mutation-initial"
	status, created, _, err := putNote(api.baseURL, initial, initial.mutationID, 0, "Baseline", "baseline body")
	if err != nil {
		t.Fatal(err)
	}
	if status != http.StatusOK || created.Note.Revision != 1 {
		t.Fatalf("initial write: status=%d result=%#v", status, created)
	}
	t.Logf("bootstrap: revision=%d cursor=%s", created.Note.Revision, created.Cursor)

	for _, client := range computers {
		page, err := pullChanges(api.baseURL, client.cursor)
		if err != nil {
			t.Fatalf("%s initial pull: %v", client.name, err)
		}
		if len(page.Changes) != 1 {
			t.Fatalf("%s expected one bootstrap change, got %d", client.name, len(page.Changes))
		}
		client.cursor = page.NextCursor
		client.revision = page.Changes[0].Note.Revision
		client.localTitle = page.Changes[0].Note.Title
		client.localBody = page.Changes[0].Note.BodyText
		t.Logf("%s pull: revision=%d cursor=%s", client.name, client.revision, client.cursor)
	}

	start := make(chan struct{})
	outcomes := make(chan mutationOutcome, len(computers))
	var group sync.WaitGroup
	for index, client := range computers {
		client.mutationID = fmt.Sprintf("mutation-computer-%d", index+1)
		client.localTitle = fmt.Sprintf("Edit by %s", client.name)
		client.localBody = fmt.Sprintf("body from %s", client.name)
		group.Add(1)
		go func(client *computer, index int) {
			defer group.Done()
			<-start
			status, result, conflict, err := putNote(api.baseURL, client, client.mutationID, client.revision,
				client.localTitle, client.localBody)
			outcomes <- mutationOutcome{computer: client, status: status, result: result, conflict: conflict, err: err}
		}(client, index)
	}
	close(start)
	group.Wait()
	close(outcomes)

	accepted := 0
	conflicted := 0
	var winner mutationOutcome
	var loser *computer
	for outcome := range outcomes {
		if outcome.err != nil {
			t.Fatalf("%s request: %v", outcome.computer.name, outcome.err)
		}
		switch outcome.status {
		case http.StatusOK:
			accepted++
			winner = outcome
			outcome.computer.revision = outcome.result.Note.Revision
			outcome.computer.cursor = outcome.result.Cursor
			outcome.computer.localTitle = outcome.result.Note.Title
			outcome.computer.localBody = outcome.result.Note.BodyText
			t.Logf("%s accepted: revision=%d cursor=%s", outcome.computer.name, outcome.result.Note.Revision, outcome.result.Cursor)
		case http.StatusConflict:
			conflicted++
			if loser == nil {
				loser = outcome.computer
			}
			if outcome.conflict.Note.Revision != 2 {
				t.Fatalf("%s conflict points to revision %d, want 2", outcome.computer.name, outcome.conflict.Note.Revision)
			}
			t.Logf("%s conflict: remote revision=%d cursor=%s; local remains %q", outcome.computer.name, outcome.conflict.Note.Revision, outcome.conflict.Cursor, outcome.computer.localTitle)
		default:
			t.Fatalf("%s unexpected status %d", outcome.computer.name, outcome.status)
		}
	}
	if accepted != 1 || conflicted != 4 {
		t.Fatalf("concurrent result: accepted=%d conflicts=%d, want 1/4", accepted, conflicted)
	}
	if loser == nil {
		t.Fatal("no losing computer captured")
	}

	status, retried, _, err := putNote(api.baseURL, &computer{name: "retry", cursor: "1"}, winner.computer.mutationID, 1, winner.result.Note.Title, winner.result.Note.BodyText)
	if err != nil {
		t.Fatal(err)
	}
	if status != http.StatusOK || retried.Note.Revision != winner.result.Note.Revision || retried.Cursor != winner.result.Cursor {
		t.Fatalf("idempotent retry changed result: status=%d retry=%#v winner=%#v", status, retried, winner.result)
	}
	t.Logf("retry %s: same revision=%d cursor=%s", winner.computer.name, retried.Note.Revision, retried.Cursor)

	page, err := pullChanges(api.baseURL, "0")
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Changes) != 2 || page.Changes[0].Note.Revision != 1 || page.Changes[1].Note.Revision != 2 {
		t.Fatalf("history revisions: %#v", page.Changes)
	}
	if page.Changes[0].Note.BodyText == page.Changes[1].Note.BodyText {
		t.Fatalf("history snapshots collapsed: %#v", page.Changes)
	}
	t.Logf("history: revisions=%d,%d cursors=%s,%s", page.Changes[0].Note.Revision, page.Changes[1].Note.Revision, page.Changes[0].Cursor, page.Changes[1].Cursor)

	for _, client := range computers {
		remotePage, err := pullChanges(api.baseURL, "1")
		if err != nil {
			t.Fatalf("%s conflict pull: %v", client.name, err)
		}
		if len(remotePage.Changes) != 1 || remotePage.Changes[0].Note.Revision != 2 {
			t.Fatalf("%s expected revision 2 after cursor 1: %#v", client.name, remotePage.Changes)
		}
		if client != winner.computer && client.localBody != remotePage.Changes[0].Note.BodyText {
			t.Logf("%s kept local body after conflict: %q", client.name, client.localBody)
		}
	}

	loser.mutationID = "mutation-resolution-computer"
	status, resolved, _, err := putNote(api.baseURL, loser, loser.mutationID, 2, loser.localTitle, loser.localBody)
	if err != nil {
		t.Fatal(err)
	}
	if status != http.StatusOK || resolved.Note.Revision != 3 {
		t.Fatalf("resolved loser write: status=%d result=%#v", status, resolved)
	}
	t.Logf("%s resolved on top of revision 2: revision=%d cursor=%s", loser.name, resolved.Note.Revision, resolved.Cursor)

	finalPage, err := pullChanges(api.baseURL, "0")
	if err != nil {
		t.Fatal(err)
	}
	if len(finalPage.Changes) != 3 {
		t.Fatalf("final history has %d changes, want 3", len(finalPage.Changes))
	}
	last := finalPage.Changes[2].Note
	if last.Revision != 3 || last.BodyText != loser.localBody {
		t.Fatalf("final snapshot does not contain resolved local version: %#v", last)
	}
	t.Logf("final canonical state: revision=%d title=%q body=%q", last.Revision, last.Title, last.BodyText)
}

func putNote(baseURL string, client *computer, mutationID string, baseRevision int64, title, body string) (int, mutationResponse, conflictResponse, error) {
	payload := map[string]any{
		"baseRevision": baseRevision,
		"mutationId":   mutationID,
		"note": map[string]any{
			"title":          title,
			"body":           `{"type":"doc"}`,
			"bodyText":       body,
			"folder":         "Notas",
			"folderId":       "folder-default",
			"tags":           []string{},
			"checklistTotal": 0,
			"checklistOpen":  0,
		},
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return 0, mutationResponse{}, conflictResponse{}, err
	}
	request, err := http.NewRequest(http.MethodPut, baseURL+"/v1/notes/"+noteID, strings.NewReader(string(encoded)))
	if err != nil {
		return 0, mutationResponse{}, conflictResponse{}, err
	}
	setSyncHeaders(request)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return 0, mutationResponse{}, conflictResponse{}, err
	}
	defer response.Body.Close()
	bodyBytes, err := io.ReadAll(response.Body)
	if err != nil {
		return 0, mutationResponse{}, conflictResponse{}, err
	}
	if response.StatusCode == http.StatusOK {
		var result mutationResponse
		return response.StatusCode, result, conflictResponse{}, json.Unmarshal(bodyBytes, &result)
	}
	if response.StatusCode == http.StatusConflict {
		var result conflictResponse
		return response.StatusCode, mutationResponse{}, result, json.Unmarshal(bodyBytes, &result)
	}
	return response.StatusCode, mutationResponse{}, conflictResponse{}, fmt.Errorf("unexpected API response %d: %s", response.StatusCode, string(bodyBytes))
}

func pullChanges(baseURL, cursor string) (changesPage, error) {
	request, err := http.NewRequest(http.MethodGet, baseURL+"/v1/changes?cursor="+cursor+"&limit=200", nil)
	if err != nil {
		return changesPage{}, err
	}
	setSyncHeaders(request)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return changesPage{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		return changesPage{}, fmt.Errorf("pull failed with status %d: %s", response.StatusCode, string(body))
	}
	var page changesPage
	return page, json.NewDecoder(response.Body).Decode(&page)
}

func setSyncHeaders(request *http.Request) {
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Magnetares-Profile", testProfile)
	request.Header.Set("X-Magnetares-Turso-URL", "")
	request.Header.Set("X-Magnetares-Turso-Token", "")
}
