package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealthz(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) })

	mux.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected status 204, got %d", w.Code)
	}
}

func TestSyncProfileRequirement(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/v1/changes?cursor=0", nil)
	w := httptest.NewRecorder()

	s := &syncService{turso: &TursoClient{}}
	s.handleChanges(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 when missing profile header, got %d", w.Code)
	}

	var errResp map[string]string
	_ = json.Unmarshal(w.Body.Bytes(), &errResp)
	if errResp["error"] != "header X-Magnetares-Profile é obrigatório" {
		t.Fatalf("unexpected error message: %s", errResp["error"])
	}
}
