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
	TursoDatabaseURL        string `json:"tursoDatabaseUrl"`
	AutoSyncIntervalMinutes int    `json:"autoSyncIntervalMinutes"`
	Configured              bool   `json:"configured"`
}

func (a *App) GetSyncConfiguration() SyncConfiguration {
	cfg := loadAppConfig()
	_, err := keyring.Get(syncKeyringService, syncKeyringUser)
	return SyncConfiguration{
		TursoDatabaseURL:        cfg.TursoDatabaseURL,
		AutoSyncIntervalMinutes: cfg.AutoSyncIntervalMinutes,
		Configured:              cfg.TursoDatabaseURL != "" && err == nil,
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
	if canonicalTursoURL(cfg.TursoDatabaseURL) != canonicalTursoURL(databaseURL) {
		// Outro banco: um perfil fixado para o banco anterior não se aplica.
		cfg.SyncProfileID = ""
	}
	cfg.TursoDatabaseURL = databaseURL
	if err := saveAppConfig(cfg); err != nil {
		return SyncConfiguration{}, err
	}
	return a.GetSyncConfiguration(), nil
}

func (a *App) SaveAutoSyncInterval(minutes int) (SyncConfiguration, error) {
	if minutes < 0 || minutes > 24*60 {
		return SyncConfiguration{}, errors.New("intervalo de sincronização inválido")
	}
	cfg := loadAppConfig()
	cfg.AutoSyncIntervalMinutes = minutes
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

// SyncProfileInfo descreve qual partição remota esta máquina usa e por quê.
type SyncProfileInfo struct {
	// ProfileID é o perfil em uso (ou o que será usado se ainda não sincronizou).
	ProfileID string `json:"profileId"`
	// Source: "explicit" (fixado pelo usuário), "remote" (perfil principal do
	// banco remoto), "legacy" (herdado de versão anterior, ainda não confirmado),
	// "derived" (da URL, ainda não confirmado) ou "local".
	Source string `json:"source"`
	// StoredProfileID é o perfil usado na última sincronização deste banco local.
	StoredProfileID string `json:"storedProfileId"`
	CanonicalURL    string `json:"canonicalUrl"`
	// Engine: "direct" (pipeline Turso) ou "api" (API HTTP configurada).
	Engine string `json:"engine"`
	APIURL string `json:"apiUrl"`
	// PendingConfirmation indica que a próxima sincronização vai confirmar o
	// perfil contra o perfil principal do banco remoto (podendo trocá-lo).
	PendingConfirmation bool `json:"pendingConfirmation"`
}

func (a *App) GetSyncProfileInfo() (SyncProfileInfo, error) {
	cfg := loadAppConfig()
	resolution, err := a.store.resolveSyncProfile(cfg.TursoDatabaseURL, cfg.SyncProfileID)
	if err != nil {
		return SyncProfileInfo{}, err
	}
	info := SyncProfileInfo{
		ProfileID:       resolution.ProfileID,
		Source:          resolution.Source,
		StoredProfileID: resolution.StoredProfileID,
		CanonicalURL:    canonicalTursoURL(cfg.TursoDatabaseURL),
		Engine:          "direct",
		APIURL:          strings.TrimSpace(cfg.SyncAPIURL),
		PendingConfirmation: cfg.TursoDatabaseURL != "" &&
			(resolution.Source == syncProfileSourceLegacy || resolution.Source == syncProfileSourceDerived || resolution.Source == syncProfileSourceLocal),
	}
	if info.APIURL != "" {
		info.Engine = "api"
	}
	return info, nil
}

func (a *App) remoteSyncClient() (*TursoClient, error) {
	databaseURL, token, err := a.syncCredentials()
	if err != nil {
		return nil, err
	}
	turso := NewTursoClient(databaseURL, token)
	if turso == nil {
		return nil, errors.New("configuração inválida do Turso")
	}
	if err := turso.InitSchema(); err != nil {
		return nil, fmt.Errorf("falha ao conectar ao Turso: %w", err)
	}
	return turso, nil
}

// ListRemoteSyncProfiles lista as partições existentes no banco remoto,
// indicando o perfil principal e o perfil desta máquina.
func (a *App) ListRemoteSyncProfiles() ([]RemoteSyncProfile, error) {
	turso, err := a.remoteSyncClient()
	if err != nil {
		return nil, err
	}
	info, err := a.GetSyncProfileInfo()
	if err != nil {
		return nil, err
	}
	primary, err := readPrimarySyncProfile(turso)
	if err != nil {
		return nil, err
	}
	profiles, err := listRemoteSyncProfiles(turso, info.ProfileID)
	if err != nil {
		return nil, err
	}
	for index := range profiles {
		profiles[index].Primary = profiles[index].ProfileID == primary
	}
	return profiles, nil
}

// PurgeRemoteSyncProfile incorpora a partição sourceProfileID ao perfil
// principal e remove da origem o que já está garantido no destino. Só deve ser
// usada depois que todas as máquinas estiverem na versão nova.
func (a *App) PurgeRemoteSyncProfile(sourceProfileID string) (string, error) {
	sourceProfileID, err := normalizeSyncProfileID(sourceProfileID)
	if err != nil {
		return "", err
	}
	if sourceProfileID == "" {
		return "", errors.New("informe o perfil a remover")
	}
	turso, err := a.remoteSyncClient()
	if err != nil {
		return "", err
	}
	primary, err := readPrimarySyncProfile(turso)
	if err != nil {
		return "", err
	}
	if primary == "" {
		return "", errors.New("sincronize uma vez antes de remover perfis antigos")
	}
	if sourceProfileID == primary {
		return "", errors.New("o perfil principal não pode ser removido")
	}
	if err := purgeRemoteSyncProfile(turso, sourceProfileID, primary); err != nil {
		return "", err
	}
	return fmt.Sprintf("Perfil %s incorporado a %s e removido da nuvem.", shortProfileID(sourceProfileID), shortProfileID(primary)), nil
}

// SetPrimarySyncProfile troca o perfil principal do banco remoto. Todas as
// máquinas em versão nova passam a usá-lo na próxima sincronização; o perfil
// principal anterior passa a ser incorporado automaticamente ao novo.
func (a *App) SetPrimarySyncProfile(profileID string) (string, error) {
	profileID, err := normalizeSyncProfileID(profileID)
	if err != nil {
		return "", err
	}
	if profileID == "" {
		return "", errors.New("informe o perfil principal")
	}
	turso, err := a.remoteSyncClient()
	if err != nil {
		return "", err
	}
	if err := setPrimarySyncProfile(turso, profileID); err != nil {
		return "", fmt.Errorf("definir perfil principal: %w", err)
	}
	return fmt.Sprintf("Perfil %s definido como principal. Sincronize para aplicar.", shortProfileID(profileID)), nil
}

// SetSyncProfileID fixa explicitamente o perfil desta máquina, ignorando o
// perfil principal do banco remoto. String vazia volta ao automático.
// A troca efetiva acontece na próxima sincronização, com backup e rebase.
func (a *App) SetSyncProfileID(profileID string) error {
	profileID, err := normalizeSyncProfileID(profileID)
	if err != nil {
		return err
	}
	cfg := loadAppConfig()
	cfg.SyncProfileID = profileID
	return saveAppConfig(cfg)
}

func (a *App) GetSyncProfileID() (string, error) {
	info, err := a.GetSyncProfileInfo()
	return info.ProfileID, err
}
