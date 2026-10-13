import { useState } from "react";
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { Lightbulb, GraduationCap, FlaskConical, AlertTriangle, Zap, Trash2, ChevronDown } from "lucide-react";

export type CalloutType = "info" | "theorem" | "experiment" | "warning" | "example";

export const CALLOUT_CONFIG: Record<CalloutType, { label: string; icon: typeof Lightbulb; color: string; border: string; bg: string }> = {
  info: {
    label: "Nota / Informação",
    icon: Lightbulb,
    color: "#2563eb",
    border: "#3b82f6",
    bg: "rgba(59, 130, 246, 0.07)"
  },
  theorem: {
    label: "Teorema / Definição",
    icon: GraduationCap,
    color: "#b45309",
    border: "#d97706",
    bg: "rgba(217, 119, 6, 0.08)"
  },
  experiment: {
    label: "Experimento / Laboratório",
    icon: FlaskConical,
    color: "#059669",
    border: "#10b981",
    bg: "rgba(16, 185, 129, 0.08)"
  },
  warning: {
    label: "Atenção / Alerta Clínico",
    icon: AlertTriangle,
    color: "#dc2626",
    border: "#ef4444",
    bg: "rgba(239, 68, 68, 0.08)"
  },
  example: {
    label: "Exemplo Prático",
    icon: Zap,
    color: "#7c3aed",
    border: "#8b5cf6",
    bg: "rgba(139, 92, 246, 0.08)"
  }
};

function CalloutView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const currentType = (node.attrs.type as CalloutType) || "info";
  const config = CALLOUT_CONFIG[currentType] || CALLOUT_CONFIG.info;
  const IconComponent = config.icon;

  const selectType = (type: CalloutType) => {
    updateAttributes({ type });
    setDropdownOpen(false);
  };

  return (
    <NodeViewWrapper
      as="div"
      className={`academic-callout callout-${currentType} ${selected ? "selected" : ""}`}
      data-callout=""
      data-callout-type={currentType}
    >
      <div className="callout-header" contentEditable={false}>
        <div className="callout-type-badge-container">
          <button
            type="button"
            className="callout-type-btn"
            onClick={() => setDropdownOpen((prev) => !prev)}
            title="Alterar tipo de destaque acadêmico"
          >
            <IconComponent size={16} className="callout-icon" />
            <span className="callout-label">{config.label}</span>
            <ChevronDown size={12} className="callout-chevron" />
          </button>

          {dropdownOpen && (
            <div className="callout-dropdown-menu">
              {(Object.keys(CALLOUT_CONFIG) as CalloutType[]).map((typeKey) => {
                const item = CALLOUT_CONFIG[typeKey];
                const ItemIcon = item.icon;
                return (
                  <button
                    key={typeKey}
                    type="button"
                    className={`callout-dropdown-item ${currentType === typeKey ? "active" : ""}`}
                    onClick={() => selectType(typeKey)}
                  >
                    <ItemIcon size={14} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          className="callout-delete-btn"
          onClick={deleteNode}
          title="Remover caixa de destaque"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div className="callout-content">
        <NodeViewContent className="callout-editable-area" />
      </div>
    </NodeViewWrapper>
  );
}

export const CalloutNode = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  selectable: true,

  addAttributes() {
    return {
      type: {
        default: "info",
        parseHTML: (el) => el.getAttribute("data-callout-type") || "info",
        renderHTML: (attrs) => ({
          "data-callout-type": attrs.type || "info",
          "data-callout": ""
        })
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-callout]"
      },
      {
        tag: "div[data-type='callout']"
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-callout": "" }),
      0
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  }
});
