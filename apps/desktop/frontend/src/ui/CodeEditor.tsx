import { useState, useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { Check, Copy, FileCode2 } from "lucide-react";

type CodeEditorProps = {
  value: string;
  language: string;
  readOnly: boolean;
  onChange: (document: string) => void;
  onLanguageChange: (language: string) => void;
  onBlur: () => void;
};

const LANGUAGES = [
  { id: "plaintext", label: "Texto simples" },
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "python", label: "Python" },
  { id: "go", label: "Go" },
  { id: "json", label: "JSON" },
  { id: "sql", label: "SQL" },
  { id: "markdown", label: "Markdown" },
  { id: "php", label: "PHP"},
  { id: "shell", label: "Shell/Bash" },
  { id: "cpp", label: "C++" },
  { id: "java", label: "Java" },
  { id: "rust", label: "Rust" },
  { id: "yaml", label: "YAML" }
];

export function CodeEditor({ value, language, readOnly, onChange, onLanguageChange, onBlur }: CodeEditorProps) {
  const [copied, setCopied] = useState(false);
  const editorRef = useRef<any>(null);

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
        <div className="format-toolbar" role="toolbar" aria-label="Formatação da nota">
          <FileCode2 aria-hidden="true" style={{ width: 16, height: 16, color: "var(--color-text-dim)" }} />
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            aria-label="Linguagem de programação"
            title="Linguagem de programação"
          >
            {LANGUAGES.map(lang => (
              <option key={lang.id} value={lang.id}>{lang.label}</option>
            ))}
          </select>
          <span className="toolbar-separator" />
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
    </div>
  );
}
