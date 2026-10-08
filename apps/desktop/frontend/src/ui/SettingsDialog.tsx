import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Cloud, Eye, EyeOff, HardDrive, Info, Moon, RefreshCw, Settings, ShieldCheck, Sun, X, XCircle } from "lucide-react";
import { SyncProfilePanel } from "./SyncProfilePanel";

export type ThemeOption = "light" | "dark" | "system";

type SettingsDialogProps = {
  theme: ThemeOption;
  onThemeChange: (theme: ThemeOption) => void;
  dbPath?: string;
  onDbPathChange?: (newPath: string) => Promise<void>;
  tursoDatabaseURL?: string;
  autoSyncIntervalMinutes?: number;
  syncConfigured?: boolean;
  onSaveSyncConfiguration?: (databaseURL: string, authToken: string) => Promise<void>;
  onAutoSyncIntervalChange?: (minutes: number) => Promise<void>;
  onSyncNow?: () => Promise<any>;
  onClose: () => void;
};

export function SettingsDialog({
  theme,
  onThemeChange,
  dbPath = "%LOCALAPPDATA%\\Magnetares Notes\\magnetares.db",
  onDbPathChange,
  tursoDatabaseURL = "",
  autoSyncIntervalMinutes = 0,
  syncConfigured = false,
  onSaveSyncConfiguration,
  onAutoSyncIntervalChange,
  onSyncNow,
  onClose
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<"general" | "storage" | "cloud">("general");
  const [currentDbPath, setCurrentDbPath] = useState(dbPath);
  const [dbPathMessage, setDbPathMessage] = useState("");
  const [currentTursoURL, setCurrentTursoURL] = useState(tursoDatabaseURL);
  const [currentTursoToken, setCurrentTursoToken] = useState("");
  const [currentAutoSyncInterval, setCurrentAutoSyncInterval] = useState(autoSyncIntervalMinutes);
  const [autoSyncMessage, setAutoSyncMessage] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState("");
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  const [runningCompliance, setRunningCompliance] = useState(false);
  const [complianceReport, setComplianceReport] = useState<any>(null);

  useEffect(() => {
    setCurrentAutoSyncInterval(autoSyncIntervalMinutes);
  }, [autoSyncIntervalMinutes]);

  const handleRunCompliance = async () => {
    const bridge = window.go?.main?.App;
    setRunningCompliance(true);
    setComplianceReport(null);
    try {
      if (bridge?.RunComplianceAudit) {
        const report = await bridge.RunComplianceAudit();
        setComplianceReport(report);
      } else {
        setComplianceReport({
          passed: true,
          details: ["Modo web: banco simulado em conformidade total."]
        });
      }
    } catch (err: any) {
      setComplianceReport({
        passed: false,
        details: [err?.message || "Erro ao executar auditoria."]
      });
    } finally {
      setRunningCompliance(false);
    }
  };

  const handleCreateBackup = async () => {
    const bridge = window.go?.main?.App;
    if (!bridge?.CreateDatabaseBackup) return;
    try {
      const path = await bridge.CreateDatabaseBackup();
      if (path) {
        setDbPathMessage(`Backup criado com sucesso em: ${path}`);
      }
    } catch (err: any) {
      setDbPathMessage(`Erro ao criar backup: ${err?.message || err}`);
    }
  };

  const handleRestoreBackup = async () => {
    const bridge = window.go?.main?.App;
    if (!bridge?.RestoreDatabaseBackup) return;
    try {
      const path = await bridge.RestoreDatabaseBackup();
      if (path) {
        setDbPathMessage(`Backup restaurado com sucesso! A aplicação será recarregada.`);
        setTimeout(() => window.location.reload(), 2000);
      }
    } catch (err: any) {
      setDbPathMessage(`Erro ao restaurar backup: ${err?.message || err}`);
    }
  };

  const handleRestoreFromCloud = async () => {
    const bridge = window.go?.main?.App;
    if (!bridge?.RestoreFromCloud) return;
    if (!confirm("Isso apagará o banco local atual e fará o download completo da nuvem. Um backup de segurança será gerado. Deseja continuar?")) return;
    try {
      setSyncing(true);
      setSyncStatus("syncing");
      setSyncMessage("Restaurando banco da nuvem...");
      const result = await bridge.RestoreFromCloud();
      setSyncStatus("success");
      setSyncMessage(result.message || "");
      setTimeout(() => window.location.reload(), 3000);
    } catch (err: any) {
      setSyncStatus("error");
      setSyncMessage(`Erro ao restaurar da nuvem: ${err?.message || err}`);
    } finally {
      setSyncing(false);
    }
  };

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
      setTestMessage("Informe a URL do banco de dados na nuvem para testar a conexão.");
      return;
    }
    if (!currentTursoToken.trim() && !syncConfigured) {
      setTestStatus("error");
      setTestMessage("Informe o token de acesso da nuvem para testar.");
      return;
    }

    setTesting(true);
    setTestStatus("testing");
    setTestMessage("Testando conexão com a nuvem...");

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
      setTestMessage(err?.message || err?.toString() || "Falha ao conectar com a nuvem.");
    } finally {
      setTesting(false);
    }
  };

  const handleSaveCloudSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentTursoURL.trim()) {
      setTestStatus("error");
      setTestMessage("Informe a URL do seu banco na nuvem.");
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
      setTestMessage(err?.message || "Não foi possível salvar a configuração da nuvem.");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleAutoSyncIntervalChange = async (minutes: number) => {
    setCurrentAutoSyncInterval(minutes);
    setAutoSyncMessage("");
    try {
      await onAutoSyncIntervalChange?.(minutes);
      setAutoSyncMessage(minutes === 0 ? "Sincronização automática desativada." : "Intervalo automático atualizado.");
    } catch (err: any) {
      setCurrentAutoSyncInterval(autoSyncIntervalMinutes);
      setAutoSyncMessage(err?.message || "Não foi possível salvar o intervalo automático.");
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
    setSyncMessage("Sincronizando notas com a nuvem...");
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
            <Cloud aria-hidden="true" /> Sincronização em Nuvem
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
                  <button type="submit" className="test-connection-btn" style={{ height: 38, padding: "0 16px" }}>Salvar Local</button>
                </div>
                {dbPathMessage && <p className="sync-status-msg success">{dbPathMessage}</p>}
                <small>As alterações no banco são salvas em tempo real com journal WAL e integridade transacional.</small>
              </form>

              <div className="sync-actions-box" style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--border)" }}>
                <div className="sync-actions-header">
                  <strong>Backup & Restauração:</strong>
                  <p className="settings-desc" style={{ margin: "4px 0 10px" }}>
                    Crie cópias de segurança do seu banco local ou restaure a partir de um backup existente. A versão Portable se beneficia muito de backups periódicos em mídias externas.
                  </p>
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button type="button" className="test-connection-btn" style={{ height: 38, padding: "0 16px" }} onClick={() => void handleCreateBackup()}>
                    <HardDrive size={16} /> Fazer Backup Local
                  </button>
                  <button type="button" className="test-connection-btn" style={{ height: 38, padding: "0 16px" }} onClick={() => void handleRestoreBackup()}>
                    <RefreshCw size={16} /> Restaurar de Backup
                  </button>
                </div>
              </div>

              <div className="sync-actions-box" style={{ marginTop: 24, paddingTop: 18 }}>
                <div className="sync-actions-header">
                  <strong>Integridade & Compliance de Dados:</strong>
                  <p className="settings-desc" style={{ margin: "4px 0 10px" }}>
                    Executa uma varredura transacional de conformidade: reatribui notas órfãs para a pasta padrão ('Notas'), repara hierarquias de pastas legadas e recalcula metadados.
                  </p>
                </div>
                <button
                  type="button"
                  className="test-connection-btn"
                  onClick={() => void handleRunCompliance()}
                  disabled={runningCompliance}
                  style={{ height: 38, width: "fit-content", padding: "0 16px" }}
                >
                  <ShieldCheck aria-hidden="true" />
                  {runningCompliance ? "Analisando conformidade..." : "Executar Auditoria de Compliance"}
                </button>
                {complianceReport && (
                  <div className={`status-feedback-box ${complianceReport.passed ? "success" : "error"}`} style={{ flexDirection: "column", alignItems: "flex-start", width: "100%" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                      <ShieldCheck aria-hidden="true" />
                      <span>Relatório de Compliance ({complianceReport.auditedAt || "Agora"})</span>
                    </div>
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12, lineHeight: 1.5 }}>
                      {(complianceReport.details || []).map((detail: string, idx: number) => (
                        <li key={idx}>{detail}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "cloud" && (
            <div className="settings-section">
              <div className="cloud-header-status-row">
                <div>
                  <h3>Sincronização na Nuvem</h3>
                  <p className="settings-desc">O Magnetares é <strong>100% local-first</strong>. O salvamento de notas funciona sempre offline. Configure a nuvem caso queira sincronizar suas notas entre múltiplos dispositivos.</p>
                </div>
                <span className={`connection-badge ${syncConfigured ? "connected" : "disconnected"}`}>
                  <span className="sync-dot" /> {syncConfigured ? "Conectado" : "Não configurado"}
                </span>
              </div>
              
              <form onSubmit={handleSaveCloudSettings} className="cloud-form">
                <label htmlFor="turso-url-input">URL do banco de dados na nuvem:</label>
                <div className="cloud-input-group">
                  <input
                    id="turso-url-input"
                    value={currentTursoURL}
                    onChange={(e) => setCurrentTursoURL(e.target.value)}
                    placeholder="libsql://seu-banco.nuvem.io ou https://seu-banco.nuvem.io"
                  />
                </div>

                <label htmlFor="turso-token-input">Token de autenticação da nuvem:</label>
                <div className="cloud-input-group">
                  <input
                    id="turso-token-input"
                    type={showToken ? "text" : "password"}
                    value={currentTursoToken}
                    onChange={(e) => setCurrentTursoToken(e.target.value)}
                    placeholder={syncConfigured ? "Token salvo no cofre do sistema (deixe vazio para manter)" : "Cole seu token de autenticação aqui"}
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
                    {syncConfigured ? "Atualizar conexão da Nuvem" : "Conectar Nuvem"}
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

              <div className="auto-sync-settings">
                <div className="auto-sync-settings-copy">
                  <strong>Sincronização automática</strong>
                  <small>Quando a nuvem estiver conectada, verifica alterações em segundo plano.</small>
                </div>
                <label htmlFor="auto-sync-interval">Frequência</label>
                <select
                  id="auto-sync-interval"
                  value={currentAutoSyncInterval}
                  disabled={!syncConfigured || !onAutoSyncIntervalChange}
                  onChange={(event) => void handleAutoSyncIntervalChange(Number(event.target.value))}
                >
                  <option value={0}>Desativada</option>
                  <option value={5}>A cada 5 minutos</option>
                  <option value={15}>A cada 15 minutos</option>
                  <option value={30}>A cada 30 minutos</option>
                  <option value={60}>A cada hora</option>
                </select>
                {autoSyncMessage && <small className="auto-sync-message">{autoSyncMessage}</small>}
              </div>

              {syncConfigured && <SyncProfilePanel refreshKey={`${tursoDatabaseURL}|${syncConfigured}`} />}

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

              {syncConfigured && (
                <div className="sync-actions-box" style={{ marginTop: 32, borderTop: "1px solid var(--border)", paddingTop: 24 }}>
                  <div className="sync-actions-header">
                    <strong>Restauração de Emergência:</strong>
                    <p className="settings-desc" style={{ margin: "4px 0 10px" }}>
                      Em caso de corrupção ou necessidade de baixar o banco de dados inteiro da nuvem do zero, você pode forçar uma restauração completa. O banco local será recriado.
                    </p>
                  </div>
                  <button type="button" className="test-connection-btn" style={{ height: 38, padding: "0 16px" }} onClick={() => void handleRestoreFromCloud()} disabled={syncing}>
                    <Cloud size={16} /> Apagar Banco Local e Restaurar da Nuvem
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
