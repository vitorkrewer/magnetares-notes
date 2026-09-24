package main

import (
	"errors"
	"fmt"
	"strings"

	keyring "github.com/zalando/go-keyring"
)

const (
	syncKeyringService = "magnetares-notes"
	syncKeyringUser    = "turso-auth-token"
)

type SyncConfiguration struct {
	TursoDatabaseURL string `json:"tursoDatabaseUrl"`
	Configured       bool   `json:"configured"`
}

func (a *App) GetSyncConfiguration() SyncConfiguration {
	cfg := loadAppConfig()
	_, err := keyring.Get(syncKeyringService, syncKeyringUser)
	return SyncConfiguration{
		TursoDatabaseURL: cfg.TursoDatabaseURL,
		Configured:       cfg.TursoDatabaseURL != "" && err == nil,
	}
}

func (a *App) SaveSyncConfiguration(databaseURL, authToken string) (SyncConfiguration, error) {
	databaseURL = strings.TrimSpace(databaseURL)
	authToken = strings.TrimSpace(authToken)
	if databaseURL == "" {
		return SyncConfiguration{}, errors.New("informe a URL do banco Turso")
	}
	if !strings.HasPrefix(databaseURL, "libsql://") && !strings.HasPrefix(databaseURL, "https://") {
		return SyncConfiguration{}, errors.New("a URL do Turso deve iniciar com libsql:// ou https://")
	}
	if authToken != "" {
		if err := keyring.Set(syncKeyringService, syncKeyringUser, authToken); err != nil {
			return SyncConfiguration{}, err
		}
	} else if _, err := keyring.Get(syncKeyringService, syncKeyringUser); err != nil {
		return SyncConfiguration{}, errors.New("informe o token Turso na primeira configuração")
	}

	cfg := loadAppConfig()
	cfg.TursoDatabaseURL = databaseURL
	if err := saveAppConfig(cfg); err != nil {
		return SyncConfiguration{}, err
	}
	return a.GetSyncConfiguration(), nil
}

func (a *App) TestTursoConnection(databaseURL, authToken string) (string, error) {
	databaseURL = strings.TrimSpace(databaseURL)
	authToken = strings.TrimSpace(authToken)

	if databaseURL == "" {
		cfg := loadAppConfig()
		databaseURL = cfg.TursoDatabaseURL
	}
	if databaseURL == "" {
		return "", errors.New("informe a URL do banco Turso")
	}

	if authToken == "" {
		savedToken, err := keyring.Get(syncKeyringService, syncKeyringUser)
		if err == nil {
			authToken = savedToken
		}
	}
	if authToken == "" {
		return "", errors.New("informe o token de acesso do Turso")
	}

	client := NewTursoClient(databaseURL, authToken)
	if client == nil {
		return "", errors.New("não foi possível inicializar cliente Turso")
	}

	latency, err := client.Ping()
	if err != nil {
		return "", fmt.Errorf("falha ao conectar: %w", err)
	}

	return fmt.Sprintf("Conexão estabelecida com sucesso! (Latência: %d ms)", latency.Milliseconds()), nil
}

func (a *App) syncCredentials() (string, string, error) {
	cfg := loadAppConfig()
	if cfg.TursoDatabaseURL == "" {
		return "", "", errors.New("sincronização em nuvem não configurada")
	}
	token, err := keyring.Get(syncKeyringService, syncKeyringUser)
	if err != nil {
		return "", "", errors.New("token Turso não encontrado no cofre do sistema")
	}
	return cfg.TursoDatabaseURL, token, nil
}
