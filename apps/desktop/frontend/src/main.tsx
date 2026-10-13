import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
import "./styles.css";
import { App } from "./ui/App";
import { FocusStandaloneWindow } from "./ui/FocusStandaloneWindow";

function Root() {
  const [focusNoteId, setFocusNoteId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // 1. Verifica se foi lançado pelo Wails com a flag --focus-note=<id>
    const bridge = window.go?.main?.App;
    if (bridge?.GetFocusNoteID) {
      bridge
        .GetFocusNoteID()
        .then((id) => {
          if (id) {
            setFocusNoteId(id);
          } else {
            // Checa parâmetro de URL (fallback dev)
            const params = new URLSearchParams(window.location.search);
            const urlId = params.get("focusNote");
            if (urlId) setFocusNoteId(urlId);
          }
          setReady(true);
        })
        .catch(() => {
          setReady(true);
        });
    } else {
      // Ambiente web / vite dev puro sem bridge Wails carregada
      const params = new URLSearchParams(window.location.search);
      const urlId = params.get("focusNote");
      if (urlId) setFocusNoteId(urlId);
      setReady(true);
    }
  }, []);

  if (!ready) {
    return null;
  }

  if (focusNoteId) {
    return <FocusStandaloneWindow noteId={focusNoteId} />;
  }

  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
