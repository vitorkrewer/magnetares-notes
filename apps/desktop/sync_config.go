package main

import (
	"errors"
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
