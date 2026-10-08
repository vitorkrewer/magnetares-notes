import { useState, useMemo, useEffect } from "react";
import { 
  X, 
  Maximize2, 
  Minimize2, 
  RotateCw, 
  Monitor, 
  Tablet, 
  Smartphone, 
  Sparkles,
  ExternalLink
} from "lucide-react";
import { marked } from "marked";
import DOMPurify from "dompurify";

type CodePreviewModalProps = {
  isOpen: boolean;
  onClose: () => void;
  code: string;
  language: string;
  title?: string;
};

type ViewportMode = "responsive" | "desktop" | "tablet" | "mobile";

export function CodePreviewModal({
  isOpen,
  onClose,
  code,
  language,
  title = "Visualização de Protótipo"
}: CodePreviewModalProps) {
  const [viewport, setViewport] = useState<ViewportMode>("desktop");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Fechar com a tecla ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isFullscreen, onClose]);

  // Processamento de conteúdo seguro
  const renderedContent = useMemo(() => {
    if (language === "markdown") {
      const rawHtml = marked.parse(code || "", { async: false }) as string;
      return DOMPurify.sanitize(rawHtml);
    }
    return code;
  }, [code, language]);

  if (!isOpen) return null;

  const isMarkdown = language === "markdown";
  const isHtml = language === "html" || language === "xml";

  // Determinar largura simulada para apresentação responsiva
  const getViewportWidth = () => {
    switch (viewport) {
      case "mobile":
        return "375px";
      case "tablet":
        return "768px";
      case "desktop":
      case "responsive":
      default:
        return "100%";
    }
  };

  // Preparar documento HTML com estilos limpos para Markdown ou protótipo HTML
  const srcDoc = isMarkdown
    ? `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root {
      color-scheme: light dark;
      --bg: #ffffff;
      --text: #1a1a1a;
      --border: #e1e4e8;
      --code-bg: #f6f8fa;
      --accent: #d97706;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #141412;
        --text: #e6e5df;
        --border: #33322e;
        --code-bg: #1c1c1a;
        --accent: #f0bd3b;
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 32px 24px;
      background: var(--bg);
      color: var(--text);
      line-height: 1.65;
      font-size: 15px;
      word-wrap: break-word;
    }
    h1, h2, h3, h4, h5, h6 {
      color: var(--text);
      font-weight: 700;
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      line-height: 1.25;
    }
    h1 { font-size: 2em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
    p { margin-top: 0; margin-bottom: 16px; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    code {
      font-family: "JetBrains Mono", Consolas, monospace;
      font-size: 0.9em;
      background: var(--code-bg);
      padding: 0.2em 0.4em;
      border-radius: 4px;
      border: 1px solid var(--border);
    }
    pre {
      background: var(--code-bg);
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      border: 1px solid var(--border);
    }
    pre code { background: transparent; padding: 0; border: none; }
    blockquote {
      margin: 0 0 16px 0;
      padding: 0 1em;
      color: #797871;
      border-left: 0.25em solid var(--accent);
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 16px;
    }
    th, td {
      border: 1px solid var(--border);
      padding: 8px 12px;
      text-align: left;
    }
    th { background: var(--code-bg); font-weight: 600; }
    img { max-width: 100%; height: auto; border-radius: 6px; }
    ul, ol { padding-left: 2em; margin-bottom: 16px; }
    li { margin-bottom: 4px; }
    hr { height: 1px; background: var(--border); border: none; margin: 24px 0; }
  </style>
</head>
<body>
  ${renderedContent}
</body>
</html>`
    : (code || "<div style='font-family:sans-serif;padding:20px;color:#888;'>Protótipo vazio</div>");

  const openInNewWindow = () => {
    const win = window.open("", "_blank");
    if (win) {
      win.document.open();
      win.document.write(srcDoc);
      win.document.close();
    }
  };

  return (
    <div 
      className={`preview-modal-backdrop ${isFullscreen ? "fullscreen" : ""}`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: isFullscreen ? "0" : "20px",
        transition: "all 0.2s ease"
      }}
    >
      <div 
        className="preview-modal-container"
        style={{
          width: isFullscreen ? "100vw" : "94vw",
          height: isFullscreen ? "100vh" : "90vh",
          maxWidth: isFullscreen ? "none" : "1400px",
          background: "var(--paper, #141412)",
          border: isFullscreen ? "none" : "1px solid var(--border, #33322e)",
          borderRadius: isFullscreen ? "0" : "14px",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.45)",
          overflow: "hidden"
        }}
      >
        {/* Top Header / Toolbar de Apresentação */}
        <header 
          style={{
            height: "50px",
            background: "var(--panel, #1c1c1a)",
            borderBottom: "1px solid var(--border, #33322e)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            userSelect: "none"
          }}
        >
          {/* Identificação e Título */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center", 
              width: "28px", 
              height: "28px", 
              borderRadius: "6px", 
              background: "rgba(240, 189, 59, 0.15)",
              color: "var(--accent, #f0bd3b)" 
            }}>
              <Sparkles size={16} />
            </span>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 650, color: "var(--text, #fff)", lineHeight: 1.2 }}>
                {title}
              </div>
              <div style={{ fontSize: "11px", color: "var(--muted, #888)", display: "flex", gap: "6px" }}>
                <span style={{ textTransform: "uppercase", fontWeight: 600 }}>{language}</span>
                <span>•</span>
                <span>Modo Apresentação</span>
              </div>
            </div>
          </div>

          {/* Alternador de Viewport (Desktop / Tablet / Mobile) */}
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            background: "var(--color-bg-inset, rgba(0,0,0,0.25))", 
            padding: "3px", 
            borderRadius: "8px", 
            gap: "2px",
            border: "1px solid var(--border, #33322e)"
          }}>
            <button
              type="button"
              onClick={() => setViewport("desktop")}
              title="Visualização Desktop (100%)"
              style={{
                background: viewport === "desktop" ? "var(--paper, #22221f)" : "transparent",
                color: viewport === "desktop" ? "var(--accent, #f0bd3b)" : "var(--muted, #888)",
                border: "none",
                borderRadius: "5px",
                padding: "5px 8px",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 500,
                transition: "all 0.15s ease"
              }}
            >
              <Monitor size={14} />
              <span>Desktop</span>
            </button>

            <button
              type="button"
              onClick={() => setViewport("tablet")}
              title="Visualização Tablet (768px)"
              style={{
                background: viewport === "tablet" ? "var(--paper, #22221f)" : "transparent",
                color: viewport === "tablet" ? "var(--accent, #f0bd3b)" : "var(--muted, #888)",
                border: "none",
                borderRadius: "5px",
                padding: "5px 8px",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 500,
                transition: "all 0.15s ease"
              }}
            >
              <Tablet size={14} />
              <span>Tablet</span>
            </button>

            <button
              type="button"
              onClick={() => setViewport("mobile")}
              title="Visualização Mobile (375px)"
              style={{
                background: viewport === "mobile" ? "var(--paper, #22221f)" : "transparent",
                color: viewport === "mobile" ? "var(--accent, #f0bd3b)" : "var(--muted, #888)",
                border: "none",
                borderRadius: "5px",
                padding: "5px 8px",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 500,
                transition: "all 0.15s ease"
              }}
            >
              <Smartphone size={14} />
              <span>Mobile</span>
            </button>
          </div>

          {/* Ações da Janela */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <button
              type="button"
              onClick={() => setReloadKey(k => k + 1)}
              title="Recarregar protótipo"
              style={{
                background: "transparent",
                color: "var(--muted, #888)",
                border: "none",
                borderRadius: "6px",
                padding: "6px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center"
              }}
            >
              <RotateCw size={16} />
            </button>

            <button
              type="button"
              onClick={openInNewWindow}
              title="Abrir em nova aba"
              style={{
                background: "transparent",
                color: "var(--muted, #888)",
                border: "none",
                borderRadius: "6px",
                padding: "6px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center"
              }}
            >
              <ExternalLink size={16} />
            </button>

            <button
              type="button"
              onClick={() => setIsFullscreen(f => !f)}
              title={isFullscreen ? "Restaurar janela" : "Tela cheia para apresentação"}
              style={{
                background: isFullscreen ? "rgba(240, 189, 59, 0.15)" : "transparent",
                color: isFullscreen ? "var(--accent, #f0bd3b)" : "var(--muted, #888)",
                border: "none",
                borderRadius: "6px",
                padding: "6px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center"
              }}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            <div style={{ width: "1px", height: "18px", background: "var(--border, #33322e)", margin: "0 4px" }} />

            <button
              type="button"
              onClick={onClose}
              title="Fechar (Esc)"
              style={{
                background: "transparent",
                color: "var(--text, #fff)",
                border: "none",
                borderRadius: "6px",
                padding: "6px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center"
              }}
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Palco do Protótipo (Com fundo neutro para simulação de viewport) */}
        <div 
          style={{
            flex: 1,
            background: viewport !== "desktop" ? "rgba(0,0,0,0.3)" : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            position: "relative",
            padding: viewport !== "desktop" ? "20px 0" : "0"
          }}
        >
          <div
            style={{
              width: getViewportWidth(),
              height: "100%",
              maxWidth: "100%",
              background: "#ffffff",
              borderRadius: viewport !== "desktop" ? "12px" : "0",
              boxShadow: viewport !== "desktop" ? "0 10px 40px rgba(0,0,0,0.4)" : "none",
              border: viewport !== "desktop" ? "1px solid var(--border, #444)" : "none",
              overflow: "hidden",
              transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              display: "flex",
              flexDirection: "column"
            }}
          >
            <iframe
              key={reloadKey}
              title="Live Prototype Preview"
              srcDoc={srcDoc}
              sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
              style={{
                width: "100%",
                height: "100%",
                border: "none",
                background: "#ffffff"
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
