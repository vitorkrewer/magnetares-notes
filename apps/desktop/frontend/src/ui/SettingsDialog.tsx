import { useState, type FormEvent } from "react";
import { CheckCircle2, Cloud, Eye, EyeOff, HardDrive, Info, Moon, RefreshCw, Settings, ShieldCheck, Sun, X, XCircle } from "lucide-react";

export type ThemeOption = "light" | "dark" | "system";

type SettingsDialogProps = {
  theme: ThemeOption;
  onThemeChange: (theme: ThemeOption) => void;
  dbPath?: string;
  onDbPathChange?: (newPath: string) => Promise<void>;
  tursoDatabaseURL?: string;
  syncConfigured?: boolean;
  onSaveSyncConfiguration?: (databaseURL: string, authToken: string) => Promise<void>;
  onSyncNow?: () => Promise<any>;
  onClose: () => void;
};

export function SettingsDialog({
  theme,
  onThemeChange,
  dbPath = "%LOCALAPPDATA%\\Magnetares Notes\\magnetares.db",
  onDbPathChange,
  tursoDatabaseURL = "",
  syncConfigured = false,
  onSaveSyncConfiguration,
  onSyncNow,
  onClose
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<"general" | "storage" | "cloud">("general");
  const [currentDbPath, setCurrentDbPath] = useState(dbPath);
  const [dbPathMessage, setDbPathMessage] = useState("");
  const [currentTursoURL, setCurrentTursoURL] = useState(tursoDatabaseURL);
  const [currentTursoToken, setCurrentTursoToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState("");
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  const handleSaveDbPath = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentDbPath.trim()) return;
    try {
      await onDbPathChange?.(currentDbPath.trim());
      setDbPathMessage("Caminho do banco de dados atualizado com sucesso!");
    } catch {
      setDbPathMessage("Erro ao alterar o caminho do banco.");
    }
  };

  const handleTestConnection = async () => {
    const bridge = window.go?.main?.App;
    if (!currentTursoURL.trim()) {
      setTestStatus("error");
      setTestMessage("Informe a URL do banco Turso para testar a conexão.");
      return;
    }
    if (!currentTursoToken.trim() && !syncConfigured) {
      setTestStatus("error");
      setTestMessage("Informe o token de acesso do Turso para testar.");
      return;
    }

    setTesting(true);
    setTestStatus("testing");
    setTestMessage("Testando conexão com o Turso...");

    try {
      if (bridge?.TestTursoConnection) {
        const msg = await bridge.TestTursoConnection(currentTursoURL.trim(), currentTursoToken.trim());
        setTestStatus("success");
        setTestMessage(msg || "Conexão estabelecida com sucesso!");
      } else {
        setTestStatus("success");
        setTestMessage("Modo web: conexão simulada com sucesso.");
      }
    } catch (err: any) {
      setTestStatus("error");
      setTestMessage(err?.message || err?.toString() || "Falha ao conectar com o Turso.");
    } finally {
      setTesting(false);
    }
  };

  const handleSaveCloudSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentTursoURL.trim()) {
      setTestStatus("error");
      setTestMessage("Informe a URL do seu banco Turso.");
      return;
    }

    setSavingConfig(true);
    try {
      await onSaveSyncConfiguration?.(currentTursoURL.trim(), currentTursoToken);
      setCurrentTursoToken("");
      setTestStatus("success");
      setTestMessage("Configuração salva com sucesso! Token guardado com segurança no cofre do sistema.");
    } catch (err: any) {
      setTestStatus("error");
      setTestMessage(err?.message || "Não foi possível salvar a configuração do Turso.");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSync = async () => {
    if (!onSyncNow) {
      setSyncStatus("error");
      setSyncMessage("Servidor não configurado ou desconectado.");
      return;
    }
    setSyncing(true);
    setSyncStatus("syncing");
    setSyncMessage("Sincronizando notas com o Turso...");
    try {
      const res = await onSyncNow();
      setSyncStatus("success");
      const msg = res?.message || (res?.uploaded !== undefined
        ? `Sincronização concluída: ${res.uploaded} enviadas, ${res.downloaded} recebidas, ${res.conflicts} conflitos.`
        : "Sincronização concluída com sucesso!");
      setSyncMessage(msg);
    } catch (err: any) {
      setSyncStatus("error");
      const errorMsg = err?.message || err?.toString() || "Falha ao sincronizar. Verifique a URL, token e conexão de internet.";
      setSyncMessage(errorMsg);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title">
        <header className="settings-dialog-header">
          <Settings aria-hidden="true" />
          <h2 id="settings-dialog-title">Preferências & Configurações</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" title="Fechar">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="settings-tabs">
          <button
            type="button"
            className={`settings-tab ${activeTab === "general" ? "active" : ""}`}
            onClick={() => setActiveTab("general")}
          >
            <Sun aria-hidden="true" /> Geral & Aparência
          </button>
          <button
            type="button"
            className={`settings-tab ${activeTab === "storage" ? "active" : ""}`}
            onClick={() => setActiveTab("storage")}
          >
            <HardDrive aria-hidden="true" /> Armazenamento
          </button>
          <button
            type="button"
            className={`settings-tab ${activeTab === "cloud" ? "active" : ""}`}
            onClick={() => setActiveTab("cloud")}
          >
            <Cloud aria-hidden="true" /> Nuvem & Turso
          </button>
        </div>

        <div className="settings-content">
          {activeTab === "general" && (
            <div className="settings-section">
              <h3>Aparência do aplicativo</h3>
              <p className="settings-desc">Escolha o tema visual da interface do Magnetares Notes.</p>
              <div className="theme-options">
                <button
                  type="button"
                  className={`theme-card ${theme === "light" ? "selected" : ""}`}
                  onClick={() => onThemeChange("light")}
                >
                  <Sun aria-hidden="true" />
                  <strong>Claro</strong>
                  <span>Aparência limpa e clara</span>
                </button>
                <button
                  type="button"
                  className={`theme-card ${theme === "dark" ? "selected" : ""}`}
                  onClick={() => onThemeChange("dark")}
                >
                  <Moon aria-hidden="true" />
                  <strong>Escuro</strong>
                  <span>Modo noturno para conforto visual</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === "storage" && (
            <div className="settings-section">
              <h3>Local do banco de dados SQLite</h3>
              <p className="settings-desc">O Magnetares armazena suas notas localmente em um banco de dados SQLite de alta performance. Todas as suas notas, pastas e edições são gravadas instantaneamente no seu disco de forma 100% offline.</p>
              <form onSubmit={(e) => void handleSaveDbPath(e)} className="storage-path-box">
                <label htmlFor="db-path-input">Caminho do banco de dados local (.db):</label>
                <div className="cloud-input-group">
                  <input
                    id="db-path-input"
                    value={currentDbPath}
                    onChange={(e) => setCurrentDbPath(e.target.value)}
                  />
                  <button type="submit">Salvar Local</button>
                </div>
                {dbPathMessage && <p className="sync-status-msg success">{dbPathMessage}</p>}
                <small>As alterações no banco são salvas em tempo real com journal WAL e integridade transacional.</small>
              </form>
            </div>
          )}

          {activeTab === "cloud" && (
            <div className="settings-section">
              <div className="cloud-header-status-row">
                <div>
                  <h3>Sincronização na nuvem (Turso / libSQL)</h3>
                  <p className="settings-desc">O Magnetares é <strong>100% local-first</strong>. O salvamento de notas funciona sempre offline. Configure o Turso caso queira sincronizar suas notas entre múltiplos dispositivos.</p>
                </div>
                <span className={`connection-badge ${syncConfigured ? "connected" : "disconnected"}`}>
                  <span className="sync-dot" /> {syncConfigured ? "Conectado" : "Não configurado"}
                </span>
              </div>
              
              <form onSubmit={handleSaveCloudSettings} className="cloud-form">
                <label htmlFor="turso-url-input">URL do seu banco Turso:</label>
                <div className="cloud-input-group">
                  <input
                    id="turso-url-input"
                    value={currentTursoURL}
                    onChange={(e) => setCurrentTursoURL(e.target.value)}
                    placeholder="libsql://seu-banco.turso.io ou https://seu-banco.turso.io"
                  />
                </div>

                <label htmlFor="turso-token-input">Token de autenticação Turso:</label>
                <div className="cloud-input-group">
                  <input
                    id="turso-token-input"
                    type={showToken ? "text" : "password"}
                    value={currentTursoToken}
                    onChange={(e) => setCurrentTursoToken(e.target.value)}
                    placeholder={syncConfigured ? "Token salvo no cofre do sistema (deixe vazio para manter)" : "Cole seu token Turso aqui"}
                  />
                  <button
                    type="button"
                    className="toggle-token-btn"
                    onClick={() => setShowToken((value) => !value)}
                    title={showToken ? "Ocultar token" : "Mostrar token"}
                    aria-label={showToken ? "Ocultar token" : "Mostrar token"}
                  >
                    {showToken ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </button>
                </div>
                <div className="security-notice">
                  <ShieldCheck aria-hidden="true" />
                  <span>O token é protegido no cofre de credenciais nativo do seu sistema operacional.</span>
                </div>

                <div className="save-cloud-btn-row">
                  <button
                    type="button"
                    className="test-connection-btn"
                    onClick={() => void handleTestConnection()}
                    disabled={testing}
                  >
                    {testing ? <RefreshCw className="spinning" aria-hidden="true" /> : <Info aria-hidden="true" />}
                    {testing ? "Testando..." : "Testar Conexão"}
                  </button>

                  <button type="submit" className="save-cloud-settings-btn" disabled={savingConfig}>
                    {syncConfigured ? "Atualizar conexão Turso" : "Conectar Turso"}
                  </button>
                </div>

                {testMessage && (
                  <div className={`status-feedback-box ${testStatus}`}>
                    {testStatus === "success" && <CheckCircle2 aria-hidden="true" />}
                    {testStatus === "error" && <XCircle aria-hidden="true" />}
                    {testStatus === "testing" && <RefreshCw className="spinning" aria-hidden="true" />}
                    <span>{testMessage}</span>
                  </div>
                )}
              </form>

              <div className="sync-actions-box">
                <div className="sync-actions-header">
                  <strong>Ação manual de sincronização:</strong>
                </div>
                <button type="button" className="sync-now-btn" onClick={() => void handleSync()} disabled={syncing}>
                  <RefreshCw className={syncing ? "spinning" : ""} aria-hidden="true" />
                  {syncing ? "Sincronizando com a Nuvem..." : "Sincronizar agora com a Nuvem"}
                </button>
                {syncMessage && (
                  <div className={`status-feedback-box ${syncStatus}`}>
                    {syncStatus === "success" && <CheckCircle2 aria-hidden="true" />}
                    {syncStatus === "error" && <XCircle aria-hidden="true" />}
                    {syncStatus === "syncing" && <RefreshCw className="spinning" aria-hidden="true" />}
                    <span>{syncMessage}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
