import { useCallback, useEffect, useState } from "react";
import { Check, CheckCircle2, Copy, Crown, Fingerprint, RefreshCw, Trash2, Undo2, XCircle } from "lucide-react";
import type { RemoteSyncProfile, SyncProfileInfo } from "./types";

type SyncProfilePanelProps = {
  // Muda quando a configuração da nuvem é salva, para recarregar o perfil.
  refreshKey?: string;
};

const sourceLabels: Record<SyncProfileInfo["source"], string> = {
  remote: "Perfil principal do banco na nuvem",
  explicit: "Fixado manualmente neste dispositivo",
  legacy: "Herdado da versão anterior (será confirmado na próxima sincronização)",
  derived: "Derivado da URL (será confirmado na próxima sincronização)",
  local: "Local (nuvem ainda não configurada)"
};

function shortId(id: string) {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
}

export function SyncProfilePanel({ refreshKey = "" }: SyncProfilePanelProps) {
  const [info, setInfo] = useState<SyncProfileInfo | null>(null);
  const [profiles, setProfiles] = useState<RemoteSyncProfile[] | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const loadInfo = useCallback(async () => {
    const bridge = window.go?.main?.App;
    if (!bridge?.GetSyncProfileInfo) return;
    try {
      setInfo(await bridge.GetSyncProfileInfo());
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || String(err) });
    }
  }, []);

  useEffect(() => {
    void loadInfo();
    setProfiles(null);
  }, [loadInfo, refreshKey]);

  const run = async (key: string, action: () => Promise<string | void>) => {
    setBusy(key);
    setFeedback(null);
    try {
      const message = await action();
      if (message) setFeedback({ type: "success", message });
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || String(err) });
    } finally {
      setBusy("");
    }
  };

  const reloadProfiles = async () => {
    const bridge = window.go?.main?.App;
    if (!bridge?.ListRemoteSyncProfiles) throw new Error("Disponível apenas no aplicativo desktop.");
    const list = await bridge.ListRemoteSyncProfiles();
    setProfiles(list);
    return list;
  };

  const handleScan = () =>
    run("scan", async () => {
      const list = await reloadProfiles();
      const others = list.filter((profile) => !profile.primary).length;
      if (!list.some((profile) => profile.primary)) {
        return "O perfil principal ainda não foi registrado. Sincronize uma vez para defini-lo.";
      }
      return others > 0
        ? `${others} perfil(is) antigo(s) neste banco. Os dados deles são incorporados automaticamente ao perfil principal a cada sincronização.`
        : "Todos os dados deste banco estão no perfil principal.";
    });

  const handleMakePrimary = (profileId: string) => {
    const confirmed = window.confirm(
      `Tornar o perfil ${shortId(profileId)} o principal deste banco?\n\n` +
        "Todas as máquinas atualizadas passam a usá-lo na próxima sincronização. O principal atual será incorporado a ele automaticamente; um backup local é feito em cada máquina antes da troca."
    );
    if (!confirmed) return;
    void run(`primary-${profileId}`, async () => {
      const bridge = window.go?.main?.App;
      if (!bridge?.SetPrimarySyncProfile) throw new Error("Disponível apenas no aplicativo desktop.");
      const message = await bridge.SetPrimarySyncProfile(profileId);
      await reloadProfiles();
      return message;
    });
  };

  const handlePurge = (profile: RemoteSyncProfile) => {
    const confirmed = window.confirm(
      `Remover da nuvem o perfil antigo ${shortId(profile.profileId)}?\n\n` +
        "Os dados são incorporados ao perfil principal antes da remoção. Só faça isso depois de atualizar todas as máquinas: uma máquina na versão antiga que ainda use esse perfil deixará de receber as notas dele."
    );
    if (!confirmed) return;
    void run(`purge-${profile.profileId}`, async () => {
      const bridge = window.go?.main?.App;
      if (!bridge?.PurgeRemoteSyncProfile) throw new Error("Disponível apenas no aplicativo desktop.");
      const message = await bridge.PurgeRemoteSyncProfile(profile.profileId);
      await reloadProfiles();
      return message;
    });
  };

  const handleReset = () =>
    run("reset", async () => {
      const bridge = window.go?.main?.App;
      if (!bridge?.SetSyncProfileID) throw new Error("Disponível apenas no aplicativo desktop.");
      await bridge.SetSyncProfileID("");
      await loadInfo();
      setProfiles(null);
      return "Perfil automático restaurado. Sincronize agora para aplicar.";
    });

  const handleCopy = async () => {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.profileId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setFeedback({ type: "error", message: "Não foi possível copiar o identificador." });
    }
  };

  if (!info) return null;

  const switchPending = info.source === "explicit" && info.storedProfileId !== "" && info.storedProfileId !== info.profileId;

  return (
    <section className="sync-profile-panel" aria-labelledby="sync-profile-title">
      <header className="sync-profile-header">
        <Fingerprint aria-hidden="true" />
        <div>
          <strong id="sync-profile-title">Perfil de sincronização</strong>
          <small>O perfil é definido pelo banco na nuvem: todas as máquinas atualizadas usam o mesmo.</small>
        </div>
      </header>

      <dl className="sync-profile-facts">
        <dt>Perfil</dt>
        <dd>
          <code title={info.profileId}>{info.profileId}</code>
          <button type="button" id="sync-profile-copy" className="sync-profile-icon-btn" onClick={() => void handleCopy()} title="Copiar identificador" aria-label="Copiar identificador do perfil">
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          </button>
        </dd>
        <dt>Origem</dt>
        <dd>{sourceLabels[info.source] ?? info.source}</dd>
        <dt>Motor</dt>
        <dd>{info.engine === "api" ? `API HTTP (${info.apiUrl})` : "Conexão direta com o banco"}</dd>
        {info.canonicalUrl && (
          <>
            <dt>Banco</dt>
            <dd><code>{info.canonicalUrl}</code></dd>
          </>
        )}
      </dl>

      {info.pendingConfirmation && (
        <p className="sync-profile-note">
          Na próxima sincronização este dispositivo adota o perfil principal do banco. Se ele for diferente do atual, um backup local é criado e as notas são comparadas com a nuvem: conteúdo idêntico converge e divergências viram conflitos para você decidir.
        </p>
      )}
      {switchPending && (
        <p className="sync-profile-note">
          A última sincronização usou o perfil <code>{shortId(info.storedProfileId)}</code>. A troca será aplicada na próxima sincronização.
        </p>
      )}

      <div className="sync-profile-actions">
        <button type="button" id="sync-profile-scan" className="test-connection-btn" onClick={() => void handleScan()} disabled={busy !== ""}>
          <RefreshCw className={busy === "scan" ? "spinning" : ""} aria-hidden="true" />
          {busy === "scan" ? "Verificando..." : "Verificar perfis na nuvem"}
        </button>
        {info.source === "explicit" && (
          <button type="button" id="sync-profile-reset" className="test-connection-btn" onClick={() => void handleReset()} disabled={busy !== ""}>
            <Undo2 aria-hidden="true" />
            Voltar ao perfil automático
          </button>
        )}
      </div>

      {profiles && profiles.length > 0 && (
        <ul className="sync-profile-list">
          {profiles.map((profile) => (
            <li key={profile.profileId} className={profile.primary ? "current" : ""}>
              <div className="sync-profile-list-copy">
                <span className="sync-profile-list-title">
                  <code title={profile.profileId}>{shortId(profile.profileId)}</code>
                  {profile.primary && <span className="sync-profile-badge">Principal</span>}
                  {profile.current && <span className="sync-profile-badge">Este dispositivo</span>}
                  {!profile.primary && <span className="sync-profile-badge muted">Antigo · incorporado</span>}
                </span>
                <small>
                  {profile.notes} notas · {profile.folders} pastas · {profile.tags} etiquetas · {profile.stickers} stickers · atualizado em {formatDate(profile.lastUpdatedAt)}
                </small>
              </div>
              {!profile.primary && (
                <div className="sync-profile-list-actions">
                  <button type="button" id={`sync-profile-primary-${profile.profileId}`} className="test-connection-btn" onClick={() => handleMakePrimary(profile.profileId)} disabled={busy !== ""} title="Fazer todas as máquinas usarem este perfil">
                    <Crown className={busy === `primary-${profile.profileId}` ? "spinning" : ""} aria-hidden="true" />
                    Tornar principal
                  </button>
                  <button type="button" id={`sync-profile-purge-${profile.profileId}`} className="test-connection-btn" onClick={() => handlePurge(profile)} disabled={busy !== ""} title="Incorporar ao principal e remover da nuvem">
                    <Trash2 className={busy === `purge-${profile.profileId}` ? "spinning" : ""} aria-hidden="true" />
                    Remover
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {feedback && (
        <div className={`status-feedback-box ${feedback.type}`} role="status">
          {feedback.type === "success" ? <CheckCircle2 aria-hidden="true" /> : <XCircle aria-hidden="true" />}
          <span>{feedback.message}</span>
        </div>
      )}
    </section>
  );
}
