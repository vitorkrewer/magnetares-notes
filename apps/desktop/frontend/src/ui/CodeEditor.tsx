import { useState, useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { Check, Copy, FileCode2, ChevronDown, Search, Eye, FileText } from "lucide-react";
import { CodePreviewModal } from "./CodePreviewModal";

type CodeEditorProps = {
  value: string;
  language: string;
  readOnly: boolean;
  title?: string;
  onChange: (document: string) => void;
  onLanguageChange: (language: string) => void;
  onBlur: () => void;
};

const LANGUAGES = [
  { id: "plaintext", label: "Texto simples", icon: "lucide-file-text" },
  { id: "javascript", label: "JavaScript", icon: "devicon-javascript-plain colored" },
  { id: "typescript", label: "TypeScript", icon: "devicon-typescript-plain colored" },
  { id: "html", label: "HTML", icon: "devicon-html5-plain colored" },
  { id: "css", label: "CSS", icon: "devicon-css3-plain colored" },
  { id: "python", label: "Python", icon: "devicon-python-plain colored" },
  { id: "go", label: "Go", icon: "devicon-go-original-wordmark colored" },
  { id: "json", label: "JSON", icon: "devicon-json-plain colored" },
  { id: "sql", label: "SQL", icon: "devicon-mysql-plain colored" },
  { id: "markdown", label: "Markdown", icon: "devicon-markdown-original" },
  { id: "php", label: "PHP", icon: "devicon-php-plain colored" },
  { id: "shell", label: "Shell/Bash", icon: "devicon-bash-plain colored" },
  { id: "cpp", label: "C++", icon: "devicon-cplusplus-plain colored" },
  { id: "c", label: "C", icon: "devicon-c-plain colored" },
  { id: "csharp", label: "C#", icon: "devicon-csharp-plain colored" },
  { id: "java", label: "Java", icon: "devicon-java-plain colored" },
  { id: "rust", label: "Rust", icon: "devicon-rust-plain" },
  { id: "yaml", label: "YAML", icon: "devicon-yaml-plain colored" },
  { id: "ruby", label: "Ruby", icon: "devicon-ruby-plain colored" },
  { id: "swift", label: "Swift", icon: "devicon-swift-plain colored" },
  { id: "kotlin", label: "Kotlin", icon: "devicon-kotlin-plain colored" },
  { id: "xml", label: "XML", icon: "devicon-xml-plain colored" },
  { id: "dockerfile", label: "Dockerfile", icon: "devicon-docker-plain colored" },
  { id: "graphql", label: "GraphQL", icon: "devicon-graphql-plain colored" },
  { id: "dart", label: "Dart", icon: "devicon-dart-plain colored" },
  { id: "lua", label: "Lua", icon: "devicon-lua-plain colored" },
  { id: "perl", label: "Perl", icon: "devicon-perl-plain colored" },
  { id: "scala", label: "Scala", icon: "devicon-scala-plain colored" }
];

export function CodeEditor({ value, language, readOnly, title, onChange, onLanguageChange, onBlur }: CodeEditorProps) {
  const [copied, setCopied] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [langSearch, setLangSearch] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const editorRef = useRef<any>(null);

  const activeLang = LANGUAGES.find(l => l.id === language);
  const isPreviewSupported = ["html", "xml", "markdown"].includes(language);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Erro ao copiar código", err);
    }
  };

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
    editor.onDidBlurEditorText(() => {
      onBlur();
    });
  };

  return (
    <div className={`structured-editor code-editor-container ${readOnly ? "read-only" : ""}`}>
      {!readOnly && (
        <div className="format-toolbar" role="toolbar" aria-label="Formatação da nota" style={{ overflow: "visible" }}>
          <div className="export-popover-anchor" style={{ position: "relative" }}>
            <button
              type="button"
              className={`format-button ${langOpen ? "active-pin" : ""}`}
              onClick={() => setLangOpen((prev) => !prev)}
              aria-label="Selecionar linguagem"
              style={{ minWidth: "140px", justifyContent: "space-between", padding: "0 10px" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {activeLang?.id === "plaintext" ? (
                  <FileText aria-hidden="true" style={{ width: 16, height: 16, color: "var(--color-text-dim)" }} />
                ) : activeLang?.icon ? (
                  <i className={activeLang.icon} style={{ fontSize: "16px" }} aria-hidden="true" />
                ) : (
                  <FileCode2 aria-hidden="true" style={{ width: 16, height: 16, color: "var(--color-text-dim)" }} />
                )}
                <span>{activeLang?.label || "Linguagem"}</span>
              </div>
              <ChevronDown size={14} style={{ opacity: 0.5 }} />
            </button>
            
            {langOpen && (
              <div 
                className="export-menu" 
                role="menu" 
                style={{ 
                  left: 0, 
                  right: "auto", 
                  width: "220px", 
                  maxHeight: "350px", 
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  padding: "6px"
                }}
              >
                <div style={{ padding: "4px 8px", position: "sticky", top: "-6px", margin: "-6px -6px 4px -6px", zIndex: 2, paddingBottom: "8px", borderBottom: "1px solid var(--color-border-subtle)", background: "var(--color-bg)" }}>
                  <div style={{ display: "flex", alignItems: "center", background: "var(--color-bg-inset)", borderRadius: "4px", padding: "4px 8px", border: "1px solid var(--color-border-subtle)" }}>
                    <Search size={14} style={{ opacity: 0.5, marginRight: "6px" }} />
                    <input 
                      type="text" 
                      placeholder="Buscar linguagem..." 
                      value={langSearch}
                      onChange={(e) => setLangSearch(e.target.value)}
                      style={{ border: "none", background: "transparent", outline: "none", width: "100%", fontSize: "13px", color: "var(--color-text)" }}
                      autoFocus
                    />
                  </div>
                </div>
                {LANGUAGES.filter(l => l.label.toLowerCase().includes(langSearch.toLowerCase())).map(lang => (
                  <button 
                    key={lang.id} 
                    type="button" 
                    onClick={() => {
                      onLanguageChange(lang.id);
                      setLangOpen(false);
                      setLangSearch("");
                    }}
                    style={{ 
                      justifyContent: "flex-start", 
                      background: language === lang.id ? "var(--color-bg-inset)" : "transparent",
                      fontWeight: language === lang.id ? 600 : 400
                    }}
                  >
                    {lang.id === "plaintext" ? (
                      <FileText aria-hidden="true" style={{ width: 16, height: 16, opacity: 0.7 }} />
                    ) : lang.icon ? (
                      <i className={lang.icon} style={{ fontSize: "16px", width: "16px", textAlign: "center" }} aria-hidden="true" />
                    ) : (
                      <span style={{ width: "16px", display: "inline-block" }} />
                    )}
                    {lang.label}
                    {language === lang.id && <Check size={14} style={{ marginLeft: "auto", color: "var(--color-primary)" }} />}
                  </button>
                ))}
                {LANGUAGES.filter(l => l.label.toLowerCase().includes(langSearch.toLowerCase())).length === 0 && (
                  <div style={{ padding: "12px", textAlign: "center", fontSize: "13px", color: "var(--color-text-dim)" }}>
                    Nenhuma linguagem encontrada
                  </div>
                )}
              </div>
            )}
            {langOpen && (
              <div 
                style={{ position: "fixed", inset: 0, zIndex: -1 }} 
                onClick={() => setLangOpen(false)} 
              />
            )}
          </div>
          <span className="toolbar-separator" />
          
          {isPreviewSupported && (
            <>
              <button 
                type="button" 
                className="format-button preview-btn-highlight" 
                onClick={() => setPreviewOpen(true)} 
                title={language === "markdown" ? "Visualizar documento Markdown formatado" : "Apresentar Protótipo / Live Preview"}
                aria-label="Visualizar Protótipo"
                style={{ 
                  width: "auto", 
                  padding: "0 10px", 
                  flex: "none", 
                  color: "var(--accent, #f0bd3b)", 
                  borderColor: "rgba(240, 189, 59, 0.4)",
                  background: "rgba(240, 189, 59, 0.08)",
                  fontWeight: 600
                }}
              >
                <Eye size={15} aria-hidden="true" />
                <span style={{ fontSize: "13px", marginLeft: "6px" }}>
                  {language === "markdown" ? "Visualizar Markdown" : "Visualizar Protótipo"}
                </span>
              </button>
              <span className="toolbar-separator" />
            </>
          )}

          <button 
            type="button" 
            className="format-button" 
            onClick={handleCopy} 
            title="Copiar código"
            aria-label="Copiar código"
            style={{ width: "auto", padding: "0 8px", flex: "none" }}
          >
            {copied ? <Check aria-hidden="true" style={{ color: "var(--color-primary)" }} /> : <Copy aria-hidden="true" />}
            <span style={{ fontSize: "13px", marginLeft: "4px", fontWeight: 500 }}>
              {copied ? "Copiado!" : "Copiar"}
            </span>
          </button>
        </div>
      )}
      
      <div className="code-editor-wrapper" style={{ minHeight: "500px", height: "calc(100vh - 260px)", marginTop: "1rem", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--color-border-subtle)" }}>
        <Editor
          height="100%"
          language={language === "shell" ? "shell" : language}
          value={value}
          theme="vs-dark"
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            wordWrap: "on",
            lineNumbersMinChars: 3,
            scrollBeyondLastLine: false,
            padding: { top: 16, bottom: 16 },
            automaticLayout: true,
          }}
          onChange={(val) => {
            if (val !== undefined) {
              onChange(val);
            }
          }}
          onMount={handleEditorDidMount}
        />
      </div>

      <CodePreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        code={value}
        language={language}
        title={title || "Protótipo / Apresentação"}
      />
    </div>
  );
}
