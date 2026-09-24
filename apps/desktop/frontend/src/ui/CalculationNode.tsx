import { useState, type FormEvent } from "react";
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { Check, X } from "lucide-react";
import { evaluate, format } from "mathjs";

export type CalculationAttributes = {
  expression: string;
  result: string;
};

const allowedIdentifiers = new Set([
  "abs", "acos", "asin", "atan", "ceil", "cos", "e", "exp", "floor",
  "log", "log10", "max", "min", "mod", "pi", "round", "sin", "sqrt", "tan"
]);

export function calculateExpression(expression: string): CalculationAttributes {
  const normalized = expression.trim();
  if (!normalized || normalized.length > 160) {
    throw new Error("A expressão deve ter entre 1 e 160 caracteres.");
  }
  if (!/^[0-9A-Za-z_+\-*/%^().,\s]+$/.test(normalized)) {
    throw new Error("A expressão contém caracteres não permitidos.");
  }

  const identifiers = normalized.match(/[A-Za-z_]+/g) ?? [];
  const unsupported = identifiers.find((identifier) => !allowedIdentifiers.has(identifier.toLocaleLowerCase()));
  if (unsupported) {
    throw new Error(`Função ou constante não permitida: ${unsupported}`);
  }

  const value = evaluate(normalized);
  if (value === undefined || typeof value === "function") {
    throw new Error("A expressão não produziu um resultado.");
  }
  const result = format(value, { precision: 14 });
  if (result.length > 120) {
    throw new Error("O resultado é grande demais para uma nota.");
  }
  return { expression: normalized, result };
}

function CalculationView({ node, selected, updateAttributes }: NodeViewProps) {
  const [editing, setEditing] = useState(false);
  const [expression, setExpression] = useState(node.attrs.expression as string);
  const [error, setError] = useState("");

  const saveCalculation = (event: FormEvent) => {
    event.preventDefault();
    try {
      updateAttributes(calculateExpression(expression));
      setError("");
      setEditing(false);
    } catch (calculationError) {
      setError(calculationError instanceof Error ? calculationError.message : "Expressão inválida.");
    }
  };

  return (
    <NodeViewWrapper as="span" className={`calculation ${selected ? "selected" : ""} ${editing ? "editing" : ""}`} data-calculation="" onDoubleClick={() => setEditing(true)} title="Duplo clique para editar o cálculo">
      {editing ? (
        <form className="calculation-inline-form" onSubmit={saveCalculation}>
          <input autoFocus value={expression} onChange={(event) => setExpression(event.target.value)} onKeyDown={(event) => event.key === "Escape" && setEditing(false)} aria-label="Editar expressão matemática" aria-invalid={Boolean(error)} />
          <button type="submit" aria-label="Salvar cálculo" title="Salvar cálculo"><Check aria-hidden="true" /></button>
          <button type="button" onClick={() => setEditing(false)} aria-label="Cancelar edição" title="Cancelar"><X aria-hidden="true" /></button>
          {error && <span className="calculation-error" role="alert">{error}</span>}
        </form>
      ) : (
        <>
          <span className="calculation-expression">{node.attrs.expression as string}</span>
          <span aria-hidden="true"> = </span>
          <strong>{node.attrs.result as string}</strong>
        </>
      )}
    </NodeViewWrapper>
  );
}

export const CalculationNode = Node.create({
  name: "calculation",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      expression: { default: "" },
      result: { default: "" }
    };
  },

  parseHTML() {
    return [{ tag: "span[data-calculation]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-calculation": "" }),
      `${HTMLAttributes.expression} = ${HTMLAttributes.result}`
    ];
  },

  renderText({ node }) {
    return `${node.attrs.expression} = ${node.attrs.result}`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalculationView);
  }
});