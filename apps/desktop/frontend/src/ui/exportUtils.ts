import { generateJSON, type JSONContent } from "@tiptap/react";
import { marked } from "marked";
import katex from "katex";
import "katex/contrib/mhchem";
import { editorExtensions } from "./editorExtensions";

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
      const hashes = "#".repeat(node.attrs?.level || 1);
      const text = (node.content || []).map(inlineToMarkdown).join("");
      return `${hashes} ${text}`;
    }

    case "codeBlock": {
      const lang = node.attrs?.language || "";
      const text = (node.content || []).map((c) => c.text || "").join("");
      return `\`\`\`${lang}\n${text}\n\`\`\``;
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

    case "mathBlock":
      return `$$\n${node.attrs?.latex || ""}\n$$`;

    case "callout": {
      const type = (node.attrs?.type || "info").toUpperCase();
      const content = (node.content || [])
        .map(nodeToMarkdown)
        .join("\n")
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
      return `> [!${type}]\n${content}`;
    }

    case "toggle": {
      const title = node.attrs?.title || "Pergunta / Tópico";
      const inner = (node.content || []).map(nodeToMarkdown).join("\n\n");
      return `<details>\n<summary>${title}</summary>\n\n${inner}\n</details>`;
    }

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
  if (node.type === "mathInline") {
    return `$${node.attrs?.latex || ""}$`;
  }

  let text = node.text || "";
  if (!text) return "";

  const marks = node.marks || [];
  marks.forEach((mark) => {
    if (mark.type === "bold") text = `**${text}**`;
    else if (mark.type === "italic") text = `*${text}*`;
    else if (mark.type === "strike") text = `~~${text}~~`;
    else if (mark.type === "code") text = `\`${text}\``;
    else if (mark.type === "highlight") text = `==${text}==`;
    else if (mark.type === "link") text = `[${text}](${mark.attrs?.href || ""})`;
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
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
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
    pre { background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 6px; overflow-x: auto; }
    code { font-family: monospace; }
    .calc { background: #f1efe7; border: 1px solid #ddd8c9; padding: 2px 6px; border-radius: 4px; font-weight: bold; color: #705000; }
    .math-block { margin: 18px 0; text-align: center; overflow-x: auto; padding: 8px 0; }
    .math-inline { display: inline-block; vertical-align: middle; margin: 0 2px; }
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
      const level = node.attrs?.level || 1;
      const inner = (node.content || []).map(inlineToHTML).join("");
      return `<h${level}>${inner}</h${level}>`;
    }

    case "codeBlock": {
      const lang = node.attrs?.language || "plaintext";
      const code = (node.content || []).map((c) => c.text || "").join("");
      return `<pre><code class="language-${lang}">${code}</code></pre>`;
    }

    case "bulletList":
      return `<ul>${(node.content || []).map((i) => `<li>${(i.content || []).map(jsonToHTML).join("")}</li>`).join("")}</ul>`;

    case "orderedList":
      return `<ol>${(node.content || []).map((i) => `<li>${(i.content || []).map(jsonToHTML).join("")}</li>`).join("")}</ol>`;

    case "taskList":
      return `<ul data-type="taskList">${(node.content || [])
        .map((i) => {
          const checked = i.attrs?.checked ? "checked disabled" : "disabled";
          const inner = (i.content || []).map(jsonToHTML).join("");
          return `<li data-type="taskItem"><input type="checkbox" ${checked} /> ${inner}</li>`;
        })
        .join("")}</ul>`;

    case "blockquote":
      return `<blockquote>${(node.content || []).map(jsonToHTML).join("")}</blockquote>`;

    case "calculation":
      return `<span class="calc">${node.attrs?.expression || ""} = ${node.attrs?.result || ""}</span>`;

    case "mathBlock": {
      const latex = node.attrs?.latex || "";
      const mathHtml = katex.renderToString(latex, { displayMode: true, throwOnError: false });
      return `<div class="math-block" data-latex="${encodeURIComponent(latex)}">${mathHtml}</div>`;
    }

    case "callout": {
      const type = node.attrs?.type || "info";
      const inner = (node.content || []).map(jsonToHTML).join("");
      return `<div class="academic-callout callout-${type}" data-callout="" data-callout-type="${type}"><div class="callout-content">${inner}</div></div>`;
    }

    case "toggle": {
      const title = node.attrs?.title || "Pergunta / Tópico";
      const inner = (node.content || []).map(jsonToHTML).join("");
      return `<details class="study-toggle" ${node.attrs?.open ? "open" : ""} data-toggle="" data-title="${encodeURIComponent(title)}"><summary>${title}</summary><div class="study-toggle-content">${inner}</div></details>`;
    }

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
  if (node.type === "mathInline") {
    const latex = node.attrs?.latex || "";
    const mathHtml = katex.renderToString(latex, { displayMode: false, throwOnError: false });
    return `<span class="math-inline" data-latex="${encodeURIComponent(latex)}">${mathHtml}</span>`;
  }

  let text = node.text || "";
  if (!text) return "";

  const marks = node.marks || [];
  marks.forEach((mark) => {
    if (mark.type === "bold") text = `<strong>${text}</strong>`;
    else if (mark.type === "italic") text = `<em>${text}</em>`;
    else if (mark.type === "strike") text = `<del>${text}</del>`;
    else if (mark.type === "code") text = `<code>${text}</code>`;
    else if (mark.type === "highlight") text = `<mark>${text}</mark>`;
    else if (mark.type === "link") text = `<a href="${mark.attrs?.href || ""}">${text}</a>`;
  });

  return text;
}

export function tiptapJsonToPlainText(node: JSONContent): string {
  if (!node) return "";
  if (node.text) return node.text;
  if (node.type === "calculation") {
    return `${node.attrs?.expression || ""} = ${node.attrs?.result || ""}`;
  }
  if (node.type === "mathBlock") {
    return `$$${node.attrs?.latex || ""}$$`;
  }
  if (node.type === "mathInline") {
    return `$${node.attrs?.latex || ""}$`;
  }
  if (node.type === "toggle") {
    const title = node.attrs?.title || "";
    const inner = (node.content || []).map(tiptapJsonToPlainText).filter(Boolean).join("\n");
    return `▶ ${title}\n${inner}`;
  }
  if (!node.content || !Array.isArray(node.content)) return "";

  if (node.type === "doc") {
    return node.content
      .map(tiptapJsonToPlainText)
      .filter((s) => s.length > 0)
      .join("\n\n")
      .trim();
  }

  if (node.type === "taskList" || node.type === "bulletList" || node.type === "orderedList") {
    return node.content
      .map(tiptapJsonToPlainText)
      .filter((s) => s.length > 0)
      .join("\n");
  }

  if (node.type === "table") {
    return node.content
      .map(tiptapJsonToPlainText)
      .filter((s) => s.length > 0)
      .join("\n");
  }

  if (node.type === "tableRow") {
    return node.content
      .map(tiptapJsonToPlainText)
      .join(" | ");
  }

  if (node.type === "taskItem") {
    const check = node.attrs?.checked ? "[x] " : "[ ] ";
    const text = node.content.map(tiptapJsonToPlainText).join(" ").trim();
    return `${check}${text}`;
  }

  if (node.type === "listItem") {
    const text = node.content.map(tiptapJsonToPlainText).join(" ").trim();
    return `• ${text}`;
  }

  return node.content.map(tiptapJsonToPlainText).join("");
}

function preprocessMarkdown(markdown: string): string {
  // Convert ==highlight==, display math $$...$$ and inline math $...$, skipping code blocks and inline code
  const parts = markdown.split(/(```[\s\S]*?```|`[^`\r\n]+`)/g);
  return parts
    .map((part) => {
      if (part.startsWith("`")) {
        return part;
      }

      // Convert display math $$...$$
      let text = part.replace(/\$\$([\s\S]*?)\$\$/g, (_m, latex) => {
        const clean = latex.trim().replace(/"/g, "&quot;");
        return `\n\n<div data-math-block="" data-latex="${clean}"></div>\n\n`;
      });

      // Convert inline math $...$
      text = text.replace(/(^|[^\\])\$([^\$\r\n]+?)\$/g, (_m, prefix, latex) => {
        const clean = latex.trim().replace(/"/g, "&quot;");
        return `${prefix}<span data-math-inline="" data-latex="${clean}"></span>`;
      });

      // Convert callouts > [!TYPE]
      text = text.replace(/>\s*\[!(NOTE|INFO|TIP|THEOREM|EXPERIMENT|WARNING|CAUTION|EXAMPLE)\]\s*\r?\n((?:>.*(?:\r?\n|$))*)/gi, (_m, rawType, rawBody) => {
        let type = "info";
        const upper = rawType.toUpperCase();
        if (upper === "THEOREM" || upper === "DEF") type = "theorem";
        else if (upper === "EXPERIMENT" || upper === "LAB") type = "experiment";
        else if (upper === "WARNING" || upper === "CAUTION") type = "warning";
        else if (upper === "EXAMPLE" || upper === "TIP") type = "example";

        const cleanBody = rawBody
          .split(/\r?\n/)
          .map((l: string) => l.replace(/^>\s?/, "").trim())
          .filter(Boolean)
          .join("<br>");
        return `\n\n<div data-callout="" data-callout-type="${type}"><p>${cleanBody}</p></div>\n\n`;
      });

      // Convert details / summary
      text = text.replace(/<details(?:\s+[^>]*)?>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi, (_m, rawSummary, rawBody) => {
        const cleanTitle = rawSummary.trim().replace(/"/g, "&quot;");
        return `\n\n<details data-toggle="" data-title="${cleanTitle}">${rawBody}</details>\n\n`;
      });

      // Convert highlight ==...==
      return text.replace(/==([^=\r\n]+)==/g, "<mark>$1</mark>");
    })
    .join("");
}

function preprocessDOMForTiptap(doc: Document): void {
  // 1. Transform task list checkboxes into Tiptap taskList / taskItem structure
  const checkboxes = Array.from(doc.querySelectorAll('li > input[type="checkbox"]'));
  for (const checkbox of checkboxes) {
    const li = checkbox.parentElement;
    if (!li) continue;

    const isChecked = (checkbox as HTMLInputElement).checked || checkbox.hasAttribute("checked");
    li.setAttribute("data-type", "taskItem");
    li.setAttribute("data-checked", isChecked ? "true" : "false");

    const parentUl = li.parentElement;
    if (parentUl && parentUl.tagName.toLowerCase() === "ul") {
      parentUl.setAttribute("data-type", "taskList");
    }

    checkbox.remove();

    // In Tiptap schema, TaskItem expects its content to be inside a paragraph (content: "paragraph block*")
    const childNodes = Array.from(li.childNodes);
    const inlineNodes: Node[] = [];
    const blockNodes: Node[] = [];

    for (const child of childNodes) {
      if (
        child.nodeType === Node.ELEMENT_NODE &&
        ["P", "UL", "OL", "BLOCKQUOTE", "TABLE", "PRE", "DIV"].includes((child as Element).tagName)
      ) {
        blockNodes.push(child);
      } else {
        inlineNodes.push(child);
      }
    }

    const hasMeaningfulInline = inlineNodes.some(
      (n) => n.textContent && n.textContent.trim().length > 0
    );

    if (hasMeaningfulInline) {
      const p = doc.createElement("p");
      inlineNodes.forEach((n) => p.appendChild(n));
      if (blockNodes.length > 0) {
        li.insertBefore(p, blockNodes[0]);
      } else {
        li.appendChild(p);
      }
    } else {
      inlineNodes.forEach((n) => n.parentElement?.removeChild(n));
      const existingP = li.querySelector("p");
      if (!existingP) {
        const p = doc.createElement("p");
        if (blockNodes.length > 0) {
          li.insertBefore(p, blockNodes[0]);
        } else {
          li.appendChild(p);
        }
      }
    }
  }

  // 2. Ensure table cells (th, td) have wrapping <p> for block+ content schema
  const cells = Array.from(doc.querySelectorAll("th, td"));
  for (const cell of cells) {
    if (!cell.querySelector("p") && cell.textContent) {
      const p = doc.createElement("p");
      while (cell.firstChild) {
        p.appendChild(cell.firstChild);
      }
      cell.appendChild(p);
    }
  }
}

export function markdownToTiptap(markdown: string): { body: string; bodyText: string } {
  if (!markdown || !markdown.trim()) {
    const emptyDoc: JSONContent = {
      type: "doc",
      content: [{ type: "paragraph" }]
    };
    return {
      body: JSON.stringify(emptyDoc),
      bodyText: ""
    };
  }

  try {
    const processedMarkdown = preprocessMarkdown(markdown);
    const rawHtml = marked.parse(processedMarkdown, { gfm: true, breaks: true }) as string;

    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, "text/html");
    preprocessDOMForTiptap(doc);

    let tiptapJson = generateJSON(doc.body.innerHTML, editorExtensions);

    if (
      !tiptapJson ||
      tiptapJson.type !== "doc" ||
      !Array.isArray(tiptapJson.content) ||
      tiptapJson.content.length === 0
    ) {
      tiptapJson = {
        type: "doc",
        content: [{ type: "paragraph" }]
      };
    }

    const bodyText = tiptapJsonToPlainText(tiptapJson).trim();

    return {
      body: JSON.stringify(tiptapJson),
      bodyText
    };
  } catch {
    const fallbackLines = markdown.split(/\r?\n/);
    const tiptapJson: JSONContent = {
      type: "doc",
      content: fallbackLines.map((line) => ({
        type: "paragraph",
        content: line ? [{ type: "text", text: line }] : undefined
      }))
    };
    return {
      body: JSON.stringify(tiptapJson),
      bodyText: markdown.trim()
    };
  }
}

export function parseImportedFile(filename: string, content: string): { title: string; body: string; bodyText: string } {
  const cleanName = filename.replace(/\.(md|markdown|txt)$/i, "").trim();
  let workingContent = content;
  let title = cleanName;

  // 1. Check for YAML frontmatter with title
  const frontmatterMatch = workingContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (frontmatterMatch) {
    const fm = frontmatterMatch[1];
    const titleMatch = fm.match(/^title:\s*["']?(.*?)["']?$/m);
    if (titleMatch && titleMatch[1].trim()) {
      title = titleMatch[1].trim();
    }
    workingContent = workingContent.slice(frontmatterMatch[0].length);
  }

  // 2. Check if the first non-empty line starts with # Title
  const lines = workingContent.split(/\r?\n/);
  const firstLineIdx = lines.findIndex((l) => l.trim().length > 0);
  if (firstLineIdx !== -1) {
    const firstLine = lines[firstLineIdx].trim();
    if (/^#\s+/.test(firstLine)) {
      title = firstLine.replace(/^#\s+/, "").trim();
      lines.splice(firstLineIdx, 1);
      workingContent = lines.join("\n");
    }
  }

  const { body, bodyText } = markdownToTiptap(workingContent);

  return {
    title: title || "Nota importada",
    body,
    bodyText
  };
}
