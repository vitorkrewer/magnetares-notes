package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCompareSemver(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"2.0.0", "2.0.0", 0},
		{"v2.0.0", "2.0.0", 0},
		{"v2.1.0", "2.0.0", 1},
		{"2.0.1", "v2.0.0", 1},
		{"3.0.0", "v2.9.9", 1},
		{"1.9.0", "v2.0.0", -1},
		{"2.0.0-beta.1", "2.0.0", 0},
	}

	for _, tc := range cases {
		got := compareSemver(tc.a, tc.b)
		if got != tc.want {
			t.Fatalf("compareSemver(%q, %q) = %d; want %d", tc.a, tc.b, got, tc.want)
		}
	}
}

func TestGetAppInfoAndUpdateCheckParsing(t *testing.T) {
	info := currentAppInfo()
	if info.Version == "" || info.BuildDate == "" || info.Author == "" {
		t.Fatalf("AppInfo incompleto: %+v", info)
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(githubLatestReleasePayload{
			TagName:     "v99.0.0",
			Name:        "Magnetares Notes v99.0.0",
			HTMLURL:     "https://github.com/vitorkrewer/magnetares-notes/releases/tag/v99.0.0",
			PublishedAt: "2026-12-01T10:00:00Z",
		})
	}))
	defer srv.Close()

	res, err := fetchLatestReleaseFromURL(srv.URL)
	if err != nil {
		t.Fatalf("fetchLatestReleaseFromURL falhou: %v", err)
	}
	if !res.HasUpdate || res.LatestVersion != "99.0.0" {
		t.Fatalf("resultado inesperado de update: %+v", res)
	}
}

