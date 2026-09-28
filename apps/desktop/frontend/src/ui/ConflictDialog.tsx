import { Cloud, Laptop, RefreshCw, X } from "lucide-react";
import { SyncConflict } from "./types";

type ConflictDialogProps = {
  conflicts: SyncConflict[];
  onResolve: (noteId: string, resolution: "local" | "remote") => Promise<void>;
  onClose: () => void;
};

export function ConflictDialog({ conflicts, onResolve, onClose }: ConflictDialogProps) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-dialog-title">
        <header className="conflict-dialog-header">
          <div>
            <span className="eyebrow">Sincronização</span>
            <h2 id="conflict-dialog-title">Revisar conflitos</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar" title="Fechar">
            <X aria-hidden="true" />
          </button>
        </header>
        <p className="conflict-dialog-intro">Sua versão local foi preservada. Escolha qual versão deve continuar.</p>
        <div className="conflict-list">
          {conflicts.map((conflict) => (
            <article className="conflict-card" key={conflict.noteId}>
              <h3>{conflict.localTitle || conflict.remoteTitle || "Nota sem título"}</h3>
              <div className="conflict-versions">
                <section>
                  <div className="conflict-version-title"><Laptop aria-hidden="true" /> Este dispositivo</div>
                  <p>{conflict.localBodyText || "Sem texto"}</p>
                  <button type="button" onClick={() => void onResolve(conflict.noteId, "local")}>
                    Manter minha versão
                  </button>
                </section>
                <section>
                  <div className="conflict-version-title"><Cloud aria-hidden="true" /> Nuvem · revisão {conflict.remoteRevision}</div>
                  <p>{conflict.remoteBodyText || "Sem texto"}</p>
                  <button type="button" className="primary" onClick={() => void onResolve(conflict.noteId, "remote")}>
                    Usar versão da nuvem
                  </button>
                </section>
              </div>
            </article>
          ))}
        </div>
        <footer className="conflict-dialog-footer">
          <RefreshCw aria-hidden="true" />
          <span>A escolha será registrada e sincronizada na próxima atualização.</span>
        </footer>
      </div>
    </div>
  );
}
