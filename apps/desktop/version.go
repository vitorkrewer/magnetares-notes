package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// AppVersion e AppBuildDate podem ser sobrescritas em tempo de compilação via -ldflags.
var (
	AppVersion   = "2.1.0"
	AppBuildDate = "2026-11-12"
)

const (
	appNameDefault     = "Magnetares Notes"
	appDescDefault     = "Caderno de anotações local-first, rápido e privado com suporte a Markdown rico, fórmulas científicas, tarefas, stickers e mapas mentais."
	appAuthorDefault   = "Vitor Krewer"
	appAuthorURL       = "https://www.linkedin.com/in/vitorkrewer/"
	appRepoURL         = "https://github.com/vitorkrewer/magnetares-notes"
	appWebsiteURL      = "https://vitorkrewer.github.io/magnetares-notes/"
	appDownloadsURL    = "https://vitorkrewer.github.io/magnetares-notes/#downloads"
	appLatestAPIURL    = "https://api.github.com/repos/vitorkrewer/magnetares-notes/releases/latest"
	appLicenseSummary  = "Source-Available (Uso Pessoal Não-Comercial)"
)

// AppInfo reúne metadados de versão e autoria do aplicativo.
type AppInfo struct {
	AppName     string `json:"appName"`
	Version     string `json:"version"`
	BuildDate   string `json:"buildDate"`
	Description string `json:"description"`
	Author      string `json:"author"`
	AuthorURL   string `json:"authorUrl"`
	Repository  string `json:"repository"`
	Website     string `json:"website"`
	License     string `json:"license"`
}

// UpdateCheckResult descreve o resultado da verificação de nova versão.
type UpdateCheckResult struct {
	CurrentVersion string `json:"currentVersion"`
	LatestVersion  string `json:"latestVersion"`
	HasUpdate      bool   `json:"hasUpdate"`
	ReleaseName    string `json:"releaseName"`
	ReleaseNotes   string `json:"releaseNotes"`
	PublishedAt    string `json:"publishedAt"`
	DownloadURL    string `json:"downloadUrl"`
	WebsiteURL     string `json:"websiteUrl"`
}

type githubLatestReleasePayload struct {
	TagName     string `json:"tag_name"`
	Name        string `json:"name"`
	Body        string `json:"body"`
	HTMLURL     string `json:"html_url"`
	PublishedAt string `json:"published_at"`
	Draft       bool   `json:"draft"`
	Prerelease  bool   `json:"prerelease"`
}

func currentAppInfo() AppInfo {
	return AppInfo{
		AppName:     appNameDefault,
		Version:     strings.TrimPrefix(strings.TrimSpace(AppVersion), "v"),
		BuildDate:   strings.TrimSpace(AppBuildDate),
		Description: appDescDefault,
		Author:      appAuthorDefault,
		AuthorURL:   appAuthorURL,
		Repository:  appRepoURL,
		Website:     appWebsiteURL,
		License:     appLicenseSummary,
	}
}

// compareSemver compara duas versões semânticas (ex: "2.1.0" vs "v2.0.0").
// Retorna >0 se a > b, <0 se a < b, ou 0 se equivalentes.
func compareSemver(a, b string) int {
	pa := parseSemverParts(a)
	pb := parseSemverParts(b)
	for i := 0; i < 3; i++ {
		if pa[i] > pb[i] {
			return 1
		}
		if pa[i] < pb[i] {
			return -1
		}
	}
	return 0
}

func parseSemverParts(raw string) [3]int {
	clean := strings.TrimSpace(raw)
	clean = strings.TrimPrefix(clean, "v")
	clean = strings.TrimPrefix(clean, "V")
	if idx := strings.IndexAny(clean, "-+"); idx >= 0 {
		clean = clean[:idx]
	}
	segments := strings.Split(clean, ".")
	var parts [3]int
	for i := 0; i < 3 && i < len(segments); i++ {
		val, err := strconv.Atoi(strings.TrimSpace(segments[i]))
		if err == nil && val >= 0 {
			parts[i] = val
		}
	}
	return parts
}

func fetchLatestReleaseFromURL(endpoint string) (UpdateCheckResult, error) {
	info := currentAppInfo()
	result := UpdateCheckResult{
		CurrentVersion: info.Version,
		LatestVersion:  info.Version,
		HasUpdate:      false,
		DownloadURL:    appRepoURL + "/releases/latest",
		WebsiteURL:     appDownloadsURL,
	}

	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return result, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "Magnetares-Notes/"+info.Version)

	client := &http.Client{Timeout: 6 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return result, fmt.Errorf("não foi possível consultar atualizações: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return result, fmt.Errorf("resposta inesperada ao verificar atualizações (%d)", resp.StatusCode)
	}

	var payload githubLatestReleasePayload
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return result, fmt.Errorf("erro ao ler metadados da release: %w", err)
	}

	latestClean := strings.TrimPrefix(strings.TrimSpace(payload.TagName), "v")
	if latestClean == "" {
		return result, nil
	}

	result.LatestVersion = latestClean
	result.ReleaseName = strings.TrimSpace(payload.Name)
	result.ReleaseNotes = strings.TrimSpace(payload.Body)
	result.PublishedAt = strings.TrimSpace(payload.PublishedAt)
	if strings.TrimSpace(payload.HTMLURL) != "" {
		result.DownloadURL = strings.TrimSpace(payload.HTMLURL)
	}
	result.HasUpdate = !payload.Draft && !payload.Prerelease && compareSemver(latestClean, info.Version) > 0
	return result, nil
}

