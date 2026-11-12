import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowRight, Calendar, CheckCircle2, Cloud, Code2, Database, Download, ExternalLink, Eye, EyeOff, FolderOpen, Globe, HardDrive, Info, Moon, RefreshCw, RotateCcw, Scale, Settings, ShieldCheck, Sparkles, Sun, Trash2, User, X, XCircle } from "lucide-react";
import { SyncProfilePanel } from "./SyncProfilePanel";
import { CustomSelect } from "./CustomSelect";
import type { AppInfoRecord, DatabaseMigrationMode, DatabaseTargetInfoRecord, UpdateCheckResultRecord } from "./types";

export type ThemeOption = "light" | "dark" | "system";
export type SettingsTab = "general" | "storage" | "cloud" | "about";

function formatBuildDate(raw?: string): string {
  if (!raw) return "—";
  const trimmed = raw.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return trimmed;
}

type SettingsDialogProps = {
  theme: ThemeOption;
  onThemeChange: (theme: ThemeOption) => void;
  dbPath?: string;
  onDbPathChange?: (newPath: string, mode?: DatabaseMigrationMode, isReset?: boolean) => Promise<void>;
  tursoDatabaseURL?: string;
  autoSyncIntervalMinutes?: number;
  syncConfigured?: boolean;
  onSaveSyncConfiguration?: (databaseURL: string, authToken: string) => Promise<void>;
  onAutoSyncIntervalChange?: (minutes: number) => Promise<void>;
  onSyncNow?: () => Promise<any>;
  initialTab?: SettingsTab;
  appInfo?: AppInfoRecord | null;
  updateInfo?: UpdateCheckResultRecord | null;
  checkingUpdates?: boolean;
  updateCheckError?: string;
  onCheckForUpdates?: () => Promise<void>;
  onOpenExternalURL?: (url: string) => void;
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
  initialTab = "general",
  appInfo,
  updateInfo,
  checkingUpdates = false,
  updateCheckError = "",
  onCheckForUpdates,
  onOpenExternalURL,
  onClose
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [currentDbPath, setCurrentDbPath] = useState(dbPath);
  const [dbPathMessage, setDbPathMessage] = useState("");
  const [dbPathError, setDbPathError] = useState(false);
  const [browsingDbDir, setBrowsingDbDir] = useState(false);
  const [inspectingDbPath, setInspectingDbPath] = useState(false);
  const [migratingDbPath, setMigratingDbPath] = useState(false);
  const [dbMigrationDialog, setDbMigrationDialog] = useState<{
    info: DatabaseTargetInfoRecord;
    isReset: boolean;
  } | null>(null);
  const [selectedMigrationMode, setSelectedMigrationMode] = useState<DatabaseMigrationMode>("copy");
  const [currentTursoURL, setCurrentTursoURL] = useState(tursoDatabaseURL);
  const [currentTursoToken, setCurrentTursoToken] = useState("");
  const [currentAutoSyncInterval, setCurrentAutoSyncInterval] = useState(autoSyncIntervalMinutes);
  const [autoSyncMessage, setAutoSyncMessage] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState("");
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  const [runningCompliance, setRunningCompliance] = useState(false);
  const [complianceReport, setComplianceReport] = useState<any>(null);

  useEffect(() => {
    setCurrentDbPath(dbPath);
  }, [dbPath]);

  useEffect(() => {
    setCurrentAutoSyncInterval(autoSyncIntervalMinutes);
  }, [autoSyncIntervalMinutes]);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const openExternal = (url: string) => {
    if (onOpenExternalURL) {
      onOpenExternalURL(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

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

  const handleRestoreFromCloud = () => {
    setConfirmRestoreOpen(true);
  };

  const executeRestoreFromCloud = async () => {
    setConfirmRestoreOpen(false);
    const bridge = window.go?.main?.App;
    if (!bridge?.RestoreFromCloud) return;
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

  const handleBrowseDbDirectory = async () => {
    const bridge = window.go?.main?.App;
    if (!bridge?.BrowseDatabaseDirectory) {
      setDbPathError(true);
      setDbPathMessage("Seleção nativa de pasta disponível apenas no aplicativo desktop.");
      return;
    }
    setBrowsingDbDir(true);
    setDbPathMessage("");
    setDbPathError(false);
    try {
      const selected = await bridge.BrowseDatabaseDirectory();
      if (selected) {
        setCurrentDbPath(selected);
      }
    } catch (err: any) {
      setDbPathError(true);
      setDbPathMessage(`Erro ao selecionar pasta: ${err?.message || err}`);
    } finally {
      setBrowsingDbDir(false);
    }
  };

  const openDbMigrationDialog = (info: DatabaseTargetInfoRecord, isReset: boolean) => {
    if (info.sameLocation) {
      setDbPathError(false);
      setDbPathMessage(
        isReset
          ? "O banco de dados já está utilizando o local padrão."
          : "O banco de dados já está utilizando esse local."
      );
      return;
    }
    setSelectedMigrationMode(info.targetExists ? "use_existing" : "copy");
    setDbMigrationDialog({ info, isReset });
  };

  const handleSaveDbPath = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = currentDbPath.trim();
    if (!trimmed) {
      setDbPathError(true);
      setDbPathMessage("Informe um caminho válido para o banco de dados.");
      return;
    }
    const bridge = window.go?.main?.App;
    setDbPathMessage("");
    setDbPathError(false);

    if (!bridge?.InspectDatabasePathTarget) {
      try {
        await onDbPathChange?.(trimmed, "copy", false);
        setDbPathMessage("Caminho do banco de dados atualizado com sucesso!");
      } catch (err: any) {
        setDbPathError(true);
        setDbPathMessage(`Erro ao alterar o caminho do banco: ${err?.message || err}`);
      }
      return;
    }

    setInspectingDbPath(true);
    try {
      const info = await bridge.InspectDatabasePathTarget(trimmed);
      openDbMigrationDialog(info, false);
    } catch (err: any) {
      setDbPathError(true);
      setDbPathMessage(`Não foi possível validar o destino: ${err?.message || err}`);
    } finally {
      setInspectingDbPath(false);
    }
  };

  const handleInspectDefaultDbPath = async () => {
    const bridge = window.go?.main?.App;
    setDbPathMessage("");
    setDbPathError(false);

    if (!bridge?.InspectDatabasePathTarget) {
      try {
        await onDbPathChange?.("", "copy", true);
        setDbPathMessage("Local padrão restaurado com sucesso!");
      } catch (err: any) {
        setDbPathError(true);
        setDbPathMessage(`Erro ao restaurar local padrão: ${err?.message || err}`);
      }
      return;
    }

    setInspectingDbPath(true);
    try {
      const probe = await bridge.InspectDatabasePathTarget(currentDbPath.trim() || dbPath);
      const targetDefault = probe.defaultPath || dbPath;
      const defaultInfo =
        probe.resolvedPath === targetDefault
          ? probe
          : await bridge.InspectDatabasePathTarget(targetDefault);
      openDbMigrationDialog(defaultInfo, true);
    } catch (err: any) {
      setDbPathError(true);
      setDbPathMessage(`Não foi possível inspecionar o local padrão: ${err?.message || err}`);
    } finally {
      setInspectingDbPath(false);
    }
  };

  const handleConfirmDbMigration = async () => {
    if (!dbMigrationDialog) return;
    setMigratingDbPath(true);
    setDbPathMessage("");
    setDbPathError(false);
    try {
      const targetPath = dbMigrationDialog.info.resolvedPath;
      await onDbPathChange?.(targetPath, selectedMigrationMode, dbMigrationDialog.isReset);
      setCurrentDbPath(targetPath);
      setDbMigrationDialog(null);
      setDbPathError(false);
      setDbPathMessage(
        dbMigrationDialog.isReset
          ? "Banco restaurado para o local padrão com sucesso!"
          : "Local do banco de dados atualizado com sucesso!"
      );
    } catch (err: any) {
      setDbPathError(true);
      setDbPathMessage(`Erro ao migrar banco de dados: ${err?.message || err}`);
    } finally {
      setMigratingDbPath(false);
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
            <Sun aria-hidden="true" /> Geral
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
            <Cloud aria-hidden="true" /> Sincronização
          </button>
          <button
            type="button"
            className={`settings-tab ${activeTab === "about" ? "active" : ""}`}
            onClick={() => setActiveTab("about")}
          >
            <Info aria-hidden="true" /> Sobre
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
                <div className="cloud-input-group db-path-input-group">
                  <input
                    id="db-path-input"
                    value={currentDbPath}
                    onChange={(e) => setCurrentDbPath(e.target.value)}
                  />
                  <button
                    type="button"
                    className="test-connection-btn db-browse-btn"
                    onClick={() => void handleBrowseDbDirectory()}
                    disabled={browsingDbDir || inspectingDbPath || migratingDbPath}
                  >
                    <FolderOpen size={15} aria-hidden="true" />
                    {browsingDbDir ? "Abrindo..." : "Procurar..."}
                  </button>
                  <button
                    type="submit"
                    className="test-connection-btn"
                    style={{ height: 38, padding: "0 16px" }}
                    disabled={inspectingDbPath || migratingDbPath}
                  >
                    {inspectingDbPath ? "Verificando..." : "Salvar Local"}
                  </button>
                </div>
                <div className="db-path-actions-row">
                  <button
                    type="button"
                    className="db-reset-link-btn"
                    onClick={() => void handleInspectDefaultDbPath()}
                    disabled={inspectingDbPath || migratingDbPath}
                  >
                    <RotateCcw size={13} aria-hidden="true" />
                    Restaurar local padrão
                  </button>
                </div>
                {dbPathMessage && (
                  <p className={`sync-status-msg ${dbPathError ? "error" : "success"}`}>
                    {dbPathMessage}
                  </p>
                )}
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
                <CustomSelect
                  id="auto-sync-interval"
                  className="auto-sync-select"
                  value={String(currentAutoSyncInterval)}
                  disabled={!syncConfigured || !onAutoSyncIntervalChange}
                  ariaLabel="Frequência de sincronização automática"
                  options={[
                    { value: "0", label: "Desativada" },
                    { value: "5", label: "A cada 5 minutos" },
                    { value: "15", label: "A cada 15 minutos" },
                    { value: "30", label: "A cada 30 minutos" },
                    { value: "60", label: "A cada hora" },
                  ]}
                  onChange={(val) => void handleAutoSyncIntervalChange(Number(val))}
                />
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

          {activeTab === "about" && (() => {
            const appName = appInfo?.appName || "Magnetares Notes";
            const version = appInfo?.version || "2.0.0";
            const buildDateLabel = formatBuildDate(appInfo?.buildDate || "2026-11-12");
            const description =
              appInfo?.description ||
              "Caderno de anotações local-first, rápido e privado com suporte a Markdown rico, fórmulas científicas, tarefas, stickers e mapas mentais.";
            const author = appInfo?.author || "Vitor Krewer";
            const authorUrl = appInfo?.authorUrl || "https://www.linkedin.com/in/vitorkrewer/";
            const repository = appInfo?.repository || "https://github.com/vitorkrewer/magnetares-notes";
            const website = appInfo?.website || "https://vitorkrewer.github.io/magnetares-notes/";
            const license = appInfo?.license || "Source-Available (Uso Pessoal Não-Comercial)";
            const changelogUrl = `${repository.replace(/\/+$/, "")}/releases`;

            return (
              <div className="settings-section about-settings">
                <div className="about-hero-card">
                  <div className="about-hero-top">
                    <div>
                      <h3>{appName}</h3>
                      <p className="about-slogan">Onde pensamentos ganham gravidade própria.</p>
                    </div>
                    <div className="about-badges">
                      <span className="about-version-badge">v{version}</span>
                      <span className="about-date-badge">
                        <Calendar aria-hidden="true" /> {buildDateLabel}
                      </span>
                    </div>
                  </div>
                  <p className="about-description">{description}</p>
                </div>

                <div className="about-update-box">
                  <div className="about-update-header">
                    <div>
                      <h4>Atualizações</h4>
                      <p className="settings-desc" style={{ margin: 0 }}>
                        Verifique se há uma versão mais recente disponível para download.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="about-check-btn"
                      onClick={() => void onCheckForUpdates?.()}
                      disabled={checkingUpdates || !onCheckForUpdates}
                    >
                      <RefreshCw className={checkingUpdates ? "spinning" : ""} aria-hidden="true" />
                      {checkingUpdates ? "Verificando..." : "Verificar atualizações"}
                    </button>
                  </div>

                  {updateCheckError ? (
                    <div className="status-feedback-box error">
                      <XCircle aria-hidden="true" />
                      <span>{updateCheckError}</span>
                    </div>
                  ) : updateInfo?.hasUpdate ? (
                    <div className="about-update-available">
                      <div className="about-update-available-info">
                        <Sparkles aria-hidden="true" />
                        <div>
                          <strong>Nova versão disponível: v{updateInfo.latestVersion}</strong>
                          <span>
                            Versão atual: v{updateInfo.currentVersion}
                            {updateInfo.releaseName ? ` · ${updateInfo.releaseName}` : ""}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="about-download-btn"
                        onClick={() => openExternal(updateInfo.websiteUrl || updateInfo.downloadUrl || website)}
                      >
                        <Download aria-hidden="true" /> Baixar atualização
                      </button>
                    </div>
                  ) : updateInfo ? (
                    <div className="status-feedback-box success">
                      <CheckCircle2 aria-hidden="true" />
                      <span>Você está na versão mais recente (v{updateInfo.currentVersion}).</span>
                    </div>
                  ) : (
                    <p className="about-update-hint">
                      Clique em &ldquo;Verificar atualizações&rdquo; para consultar a versão mais recente.
                    </p>
                  )}
                </div>

                <div className="about-dev-section">
                  <h4>Desenvolvedor &amp; Informações</h4>
                  <div className="about-meta-grid">
                    <div className="about-meta-item">
                      <span className="about-meta-label">
                        <User aria-hidden="true" /> Desenvolvedor
                      </span>
                      <strong>{author}</strong>
                    </div>
                    <div className="about-meta-item">
                      <span className="about-meta-label">
                        <Scale aria-hidden="true" /> Licença
                      </span>
                      <strong>{license}</strong>
                    </div>
                  </div>

                  <div className="about-links-row">
                    <button type="button" className="about-link-btn" onClick={() => openExternal(website)}>
                      <Globe aria-hidden="true" /> Site Oficial
                    </button>
                    <button type="button" className="about-link-btn" onClick={() => openExternal(repository)}>
                      <Code2 aria-hidden="true" /> GitHub
                    </button>
                    <button type="button" className="about-link-btn" onClick={() => openExternal(authorUrl)}>
                      <ExternalLink aria-hidden="true" /> LinkedIn
                    </button>
                    <button type="button" className="about-link-btn" onClick={() => openExternal(changelogUrl)}>
                      <Sparkles aria-hidden="true" /> Changelog / Releases
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {dbMigrationDialog && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !migratingDbPath) {
              setDbMigrationDialog(null);
            }
          }}
        >
          <div
            className="organization-dialog db-migration-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="db-migration-dialog-title"
          >
            <header>
              <Database aria-hidden="true" />
              <h2 id="db-migration-dialog-title">
                {dbMigrationDialog.isReset
                  ? "Restaurar local padrão do banco"
                  : "Confirmar troca de local do banco"}
              </h2>
              <button
                type="button"
                onClick={() => !migratingDbPath && setDbMigrationDialog(null)}
                disabled={migratingDbPath}
                aria-label="Fechar"
                title="Fechar"
              >
                <X aria-hidden="true" />
              </button>
            </header>

            <div className="db-migration-summary">
              <div className="db-migration-path-block">
                <span className="db-migration-path-label">
                  Origem atual ({dbMigrationDialog.info.currentNotes}{" "}
                  {dbMigrationDialog.info.currentNotes === 1 ? "nota" : "notas"})
                </span>
                <code className="db-migration-path-value" title={dbMigrationDialog.info.currentPath}>
                  {dbMigrationDialog.info.currentPath}
                </code>
              </div>

              <div className="db-migration-arrow" aria-hidden="true">
                <ArrowRight size={16} />
              </div>

              <div className="db-migration-path-block">
                <span className="db-migration-path-label">Novo destino</span>
                <code className="db-migration-path-value" title={dbMigrationDialog.info.resolvedPath}>
                  {dbMigrationDialog.info.resolvedPath}
                </code>
              </div>
            </div>

            <div className="db-migration-safety-note">
              <ShieldCheck size={16} aria-hidden="true" />
              <span>
                Um backup automático de segurança do banco atual será criado antes de qualquer alteração.
              </span>
            </div>

            {dbMigrationDialog.info.targetExists && (
              <div className="db-migration-target-alert">
                <AlertTriangle size={16} aria-hidden="true" />
                <span>
                  Já existe um arquivo <code>.db</code> no destino com{" "}
                  <strong>
                    {dbMigrationDialog.info.targetNotes}{" "}
                    {dbMigrationDialog.info.targetNotes === 1 ? "nota" : "notas"}
                  </strong>
                  . Escolha como deseja prosseguir:
                </span>
              </div>
            )}

            <div className="db-migration-options" role="radiogroup" aria-label="Modo de migração do banco de dados">
              {dbMigrationDialog.info.targetExists ? (
                <>
                  <label
                    className={`db-migration-option${
                      selectedMigrationMode === "use_existing" ? " is-selected" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="db-migration-mode"
                      value="use_existing"
                      checked={selectedMigrationMode === "use_existing"}
                      onChange={() => setSelectedMigrationMode("use_existing")}
                      disabled={migratingDbPath}
                    />
                    <div className="db-migration-option-content">
                      <div className="db-migration-option-title">
                        <strong>Usar banco existente no destino</strong>
                        <span className="db-migration-badge">Preserva destino</span>
                      </div>
                      <p>
                        Abre imediatamente o banco já existente no destino ({dbMigrationDialog.info.targetNotes}{" "}
                        {dbMigrationDialog.info.targetNotes === 1 ? "nota" : "notas"}). Seus dados atuais
                        continuam salvos na pasta anterior.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`db-migration-option${
                      selectedMigrationMode === "copy" ? " is-selected" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="db-migration-mode"
                      value="copy"
                      checked={selectedMigrationMode === "copy"}
                      onChange={() => setSelectedMigrationMode("copy")}
                      disabled={migratingDbPath}
                    />
                    <div className="db-migration-option-content">
                      <div className="db-migration-option-title">
                        <strong>Substituir pelos meus dados atuais</strong>
                      </div>
                      <p>
                        Copia todas as suas notas atuais para o destino e preserva automaticamente uma cópia{" "}
                        <code>.bak</code> do arquivo anterior encontrado lá.
                      </p>
                    </div>
                  </label>
                </>
              ) : (
                <>
                  <label
                    className={`db-migration-option${
                      selectedMigrationMode === "copy" ? " is-selected" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="db-migration-mode"
                      value="copy"
                      checked={selectedMigrationMode === "copy"}
                      onChange={() => setSelectedMigrationMode("copy")}
                      disabled={migratingDbPath}
                    />
                    <div className="db-migration-option-content">
                      <div className="db-migration-option-title">
                        <strong>Copiar todos os meus dados atuais para o novo local</strong>
                        <span className="db-migration-badge recommended">Recomendado</span>
                      </div>
                      <p>
                        Cria uma cópia íntegra das suas notas, pastas, tarefas, stickers e fluxos no novo
                        caminho selecionado.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`db-migration-option${
                      selectedMigrationMode === "fresh" ? " is-selected" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="db-migration-mode"
                      value="fresh"
                      checked={selectedMigrationMode === "fresh"}
                      onChange={() => setSelectedMigrationMode("fresh")}
                      disabled={migratingDbPath}
                    />
                    <div className="db-migration-option-content">
                      <div className="db-migration-option-title">
                        <strong>Iniciar um banco limpo no novo local</strong>
                      </div>
                      <p>
                        Cria um novo banco vazio no destino, mantendo o banco anterior intacto no local
                        original.
                      </p>
                    </div>
                  </label>
                </>
              )}
            </div>

            {dbPathMessage && dbPathError && (
              <p className="sync-status-msg error" style={{ marginTop: 10 }}>
                {dbPathMessage}
              </p>
            )}

            <footer>
              <button
                type="button"
                className="ghost"
                onClick={() => setDbMigrationDialog(null)}
                disabled={migratingDbPath}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="db-migration-confirm-btn"
                onClick={() => void handleConfirmDbMigration()}
                disabled={migratingDbPath}
              >
                {migratingDbPath ? "Migrando dados..." : "Confirmar Troca"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {confirmRestoreOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setConfirmRestoreOpen(false)}>
          <div className="organization-dialog" role="dialog" aria-modal="true" aria-labelledby="restore-confirm-dialog-title" style={{ maxWidth: 440 }}>
            <header>
              <Trash2 aria-hidden="true" style={{ color: "#ef4444" }} />
              <h2 id="restore-confirm-dialog-title">Restaurar da Nuvem</h2>
              <button type="button" onClick={() => setConfirmRestoreOpen(false)} aria-label="Fechar" title="Fechar"><X aria-hidden="true" /></button>
            </header>
            <p style={{ marginTop: 12, marginBottom: 20, color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
              Isso apagará o banco local atual e fará o download completo da nuvem. Um backup de segurança será gerado automaticamente. Deseja continuar?
            </p>
            <footer>
              <button type="button" className="ghost" onClick={() => setConfirmRestoreOpen(false)}>Cancelar</button>
              <button
                type="button"
                style={{ background: "#dc2626", color: "#ffffff", borderColor: "#b91c1c" }}
                onClick={() => void executeRestoreFromCloud()}
              >
                Apagar e Restaurar
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
