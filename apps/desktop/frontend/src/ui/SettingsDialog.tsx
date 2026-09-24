import { useState, type FormEvent } from "react";
import { Cloud, Eye, EyeOff, HardDrive, Moon, RefreshCw, Settings, Sun, X } from "lucide-react";

export type ThemeOption = "light" | "dark" | "system";

type SettingsDialogProps = {
  theme: ThemeOption;
  onThemeChange: (theme: ThemeOption) => void;
  dbPath?: string;
  onDbPathChange?: (newPath: string) => Promise<void>;
  tursoDatabaseURL?: string;
  syncConfigured?: boolean;
  onSaveSyncConfiguration?: (databaseURL: string, authToken: string) => Promise<void>;
  onSyncNow?: () => Promise<void>;
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
  const [syncMessage, setSyncMessage] = useState("");

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

  const handleSaveCloudSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentTursoURL.trim()) {
      setSyncMessage("Informe a URL do seu banco Turso.");
      return;
    }
    try {
      await onSaveSyncConfiguration?.(currentTursoURL.trim(), currentTursoToken);
      setCurrentTursoToken("");
      setSyncMessage("Turso conectado com segurança neste dispositivo.");
    } catch {
      setSyncMessage("Não foi possível salvar a configuração do Turso.");
    }
  };

  const handleSync = async () => {
    if (!onSyncNow) {
      setSyncMessage("Servidor não configurado ou desconectado.");
      return;
    }
    setSyncing(true);
    setSyncMessage("Sincronizando notas com a nuvem Turso...");
    try {
      await onSyncNow();
      setSyncMessage("Sincronização concluída com sucesso!");
    } catch {
      setSyncMessage("Falha ao sincronizar. Verifique se a API está rodando.");
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
              <p className="settings-desc">O Magnetares armazena suas notas localmente em um banco de dados SQLite de alta performance. Na primeira execução, o banco de dados é criado automaticamente no diretório de dados do usuário (Windows: %LOCALAPPDATA%, Linux: ~/.config, macOS: Library/Application Support).</p>
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
                {dbPathMessage && <p className="sync-status-msg">{dbPathMessage}</p>}
                <small>As alterações no banco são salvas em tempo real com journal WAL e integridade transacional.</small>
              </form>
            </div>
          )}

          {activeTab === "cloud" && (
            <div className="settings-section">
              <h3>Sincronização na nuvem (Opcional)</h3>
              <p className="settings-desc">O Magnetares Notes é <strong>100% local-first e funciona offline</strong> sem precisar de servidor. Ative a nuvem apenas quando quiser trazer suas notas para outros computadores.</p>
              
              <form onSubmit={handleSaveCloudSettings} className="cloud-form">
                <label htmlFor="turso-url-input">URL do seu banco Turso:</label>
                <div className="cloud-input-group">
                  <input
                    id="turso-url-input"
                    value={currentTursoURL}
                    onChange={(e) => setCurrentTursoURL(e.target.value)}
                    placeholder="libsql://seu-banco.turso.io"
                  />
                </div>

                <label htmlFor="turso-token-input">Token de acesso Turso:</label>
                <div className="cloud-input-group">
                  <input
                    id="turso-token-input"
                    type={showToken ? "text" : "password"}
                    value={currentTursoToken}
                    onChange={(e) => setCurrentTursoToken(e.target.value)}
                    placeholder={syncConfigured ? "Token salvo no cofre do sistema" : "Cole o token do seu Turso"}
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
                <small>O token é guardado no cofre de credenciais do sistema e não é incluído no aplicativo. Em outro computador, informe a mesma URL e token para baixar as mesmas notas.</small>

                <div className="save-cloud-btn-row">
                  <button type="submit" className="save-cloud-settings-btn">
                    {syncConfigured ? "Atualizar conexão Turso" : "Conectar Turso"}
                  </button>
                </div>
              </form>

              <div className="sync-actions-box">
                <button type="button" className="sync-now-btn" onClick={() => void handleSync()} disabled={syncing}>
                  <RefreshCw className={syncing ? "spinning" : ""} aria-hidden="true" />
                  {syncing ? "Sincronizando..." : "Sincronizar agora com a Nuvem"}
                </button>
                {syncMessage && <p className="sync-status-msg">{syncMessage}</p>}
              </div>
            </div>
          )}
        </div>

        <footer className="settings-dialog-footer">
          <button type="button" className="settings-close-btn" onClick={onClose}>
            Concluído
          </button>
        </footer>
      </div>
    </div>
  );
}
