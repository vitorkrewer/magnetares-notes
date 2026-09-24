import type { JSONContent } from "@tiptap/react";

export function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToMarkdown(title: string, body: string, bodyText?: string): string {
  let markdownBody = "";

  try {
    const json = JSON.parse(body) as JSONContent;
    if (json.type === "doc" && Array.isArray(json.content)) {
      markdownBody = json.content.map(nodeToMarkdown).join("\n\n");
    }
  } catch {
    markdownBody = bodyText || body;
  }

  const cleanTitle = title.trim() || "Sem título";
  return `# ${cleanTitle}\n\n${markdownBody}`.trim();
}

function nodeToMarkdown(node: JSONContent): string {
  if (!node) return "";

  switch (node.type) {
    case "paragraph":
      return (node.content || []).map(inlineToMarkdown).join("");

    case "heading": {
      const level = node.attrs?.level === 2 ? "## " : "# ";
      const text = (node.content || []).map(inlineToMarkdown).join("");
      return `${level}${text}`;
    }

    case "bulletList":
      return (node.content || [])
        .map((item) => `- ${(item.content || []).map(nodeToMarkdown).join(" ").trim()}`)
        .join("\n");

    case "orderedList":
      return (node.content || [])
        .map((item, idx) => `${idx + 1}. ${(item.content || []).map(nodeToMarkdown).join(" ").trim()}`)
        .join("\n");

    case "taskList":
      return (node.content || [])
        .map((item) => {
          const check = item.attrs?.checked ? "[x]" : "[ ]";
          const text = (item.content || []).map(nodeToMarkdown).join(" ").trim();
          return `- ${check} ${text}`;
        })
        .join("\n");

    case "blockquote":
      return (node.content || [])
        .map(nodeToMarkdown)
        .map((line) => `> ${line}`)
        .join("\n");

    case "calculation":
      return `${node.attrs?.expression || ""} = ${node.attrs?.result || ""}`;

    case "table": {
      const rows = node.content || [];
      if (rows.length === 0) return "";
      const tableLines: string[] = [];

      rows.forEach((row, rowIdx) => {
        const cells = (row.content || []).map((cell) => {
          const text = (cell.content || []).map(nodeToMarkdown).join(" ").trim();
          return text.replace(/\|/g, "\\|");
        });
        tableLines.push(`| ${cells.join(" | ")} |`);

        if (rowIdx === 0) {
          const separator = cells.map(() => "---").join(" | ");
          tableLines.push(`| ${separator} |`);
        }
      });
      return tableLines.join("\n");
    }

    default:
      if (node.content) {
        return node.content.map(nodeToMarkdown).join("");
      }
      return "";
  }
}

function inlineToMarkdown(node: JSONContent): string {
  if (node.type === "calculation") {
    return `${node.attrs?.expression || ""} = ${node.attrs?.result || ""}`;
  }

  let text = node.text || "";
  if (!text) return "";

  const marks = node.marks || [];
  marks.forEach((mark) => {
    if (mark.type === "bold") text = `**${text}**`;
    else if (mark.type === "italic") text = `*${text}*`;
    else if (mark.type === "highlight") text = `==${text}==`;
  });

  return text;
}

export function exportToHTML(title: string, body: string, bodyText?: string): string {
  const cleanTitle = title.trim() || "Sem título";
  let contentHtml = "";

  try {
    const json = JSON.parse(body) as JSONContent;
    contentHtml = jsonToHTML(json);
  } catch {
    contentHtml = `<p>${(bodyText || body).replace(/\n/g, "<br/>")}</p>`;
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${cleanTitle}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 760px; margin: 40px auto; padding: 0 20px; color: #252522; line-height: 1.6; }
    h1 { font-size: 28px; margin-bottom: 24px; border-bottom: 1px solid #e0ded7; padding-bottom: 12px; }
    h2 { font-size: 20px; margin-top: 24px; }
    blockquote { border-left: 3px solid #e3b541; margin: 16px 0; padding-left: 16px; color: #66645d; }
    mark { background: #f7df73; padding: 2px 4px; border-radius: 2px; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    th, td { border: 1px solid #d8d5cc; padding: 8px 12px; text-align: left; }
    th { background: #f1efe8; }
    ul[data-type="taskList"] { list-style: none; padding-left: 0; }
    ul[data-type="taskList"] li { display: flex; gap: 8px; align-items: baseline; }
    .calc { background: #f1efe7; border: 1px solid #ddd8c9; padding: 2px 6px; border-radius: 4px; font-weight: bold; color: #705000; }
  </style>
</head>
<body>
  <h1>${cleanTitle}</h1>
  ${contentHtml}
</body>
</html>`;
}

function jsonToHTML(node: JSONContent): string {
  if (!node) return "";

  switch (node.type) {
    case "doc":
      return (node.content || []).map(jsonToHTML).join("\n");

    case "paragraph": {
      const inner = (node.content || []).map(inlineToHTML).join("");
      return `<p>${inner}</p>`;
    }

    case "heading": {
      const level = node.attrs?.level === 2 ? 2 : 1;
      const inner = (node.content || []).map(inlineToHTML).join("");
      return `<h${level}>${inner}</h${level}>`;
    }

    case "bulletList":
      return `<ul>${(node.content || []).map((i) => `<li>${(i.content || []).map(jsonToHTML).join("")}</li>`).join("")}</ul>`;

    case "orderedList":
      return `<ol>${(node.content || []).map((i) => `<li>${(i.content || []).map(jsonToHTML).join("")}</li>`).join("")}</ol>`;

    case "taskList":
      return `<ul data-type="taskList">${(node.content || [])
        .map((i) => {
          const checked = i.attrs?.checked ? 'checked disabled' : 'disabled';
          const inner = (i.content || []).map(jsonToHTML).join("");
          return `<li><input type="checkbox" ${checked} /> ${inner}</li>`;
        })
        .join("")}</ul>`;

    case "blockquote":
      return `<blockquote>${(node.content || []).map(jsonToHTML).join("")}</blockquote>`;

    case "calculation":
      return `<span class="calc">${node.attrs?.expression || ""} = ${node.attrs?.result || ""}</span>`;

    case "table": {
      const rows = (node.content || []).map((row, idx) => {
        const tag = idx === 0 ? "th" : "td";
        const cells = (row.content || [])
          .map((cell) => `<${tag}>${(cell.content || []).map(jsonToHTML).join("")}</${tag}>`)
          .join("");
        return `<tr>${cells}</tr>`;
      });
      return `<table>${rows.join("")}</table>`;
    }

    default:
      if (node.content) return node.content.map(jsonToHTML).join("");
      return "";
  }
}

function inlineToHTML(node: JSONContent): string {
  if (node.type === "calculation") {
    return `<span class="calc">${node.attrs?.expression || ""} = ${node.attrs?.result || ""}</span>`;
  }

  let text = node.text || "";
  if (!text) return "";

  const marks = node.marks || [];
  marks.forEach((mark) => {
    if (mark.type === "bold") text = `<strong>${text}</strong>`;
    else if (mark.type === "italic") text = `<em>${text}</em>`;
    else if (mark.type === "highlight") text = `<mark>${text}</mark>`;
  });

  return text;
}

export function parseImportedFile(filename: string, content: string): { title: string; body: string; bodyText: string } {
  const cleanName = filename.replace(/\.(md|markdown|txt)$/i, "").trim();
  const lines = content.split(/\r?\n/);

  let title = cleanName;
  let bodyLines = lines;

  // If first non-empty line starts with # Title
  const firstLineIdx = lines.findIndex((l) => l.trim().length > 0);
  if (firstLineIdx !== -1) {
    const firstLine = lines[firstLineIdx].trim();
    if (/^#\s+/.test(firstLine)) {
      title = firstLine.replace(/^#\s+/, "").trim();
      bodyLines = lines.slice(firstLineIdx + 1);
    }
  }

  const plainText = bodyLines.join("\n").trim();
  const tiptapJson: JSONContent = {
    type: "doc",
    content: bodyLines.map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : undefined
    }))
  };

  return {
    title: title || "Nota importada",
    body: JSON.stringify(tiptapJson),
    bodyText: plainText
  };
}
