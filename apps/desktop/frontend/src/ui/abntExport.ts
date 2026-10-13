import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  Header,
  PageNumber,
  AlignmentType,
  WidthType,
  BorderStyle,
  Packer,
  type ParagraphChild
} from "docx";
import type { JSONContent } from "@tiptap/react";

/**
 * Dimensões e parâmetros normativos ABNT (NBR 14724 / NBR 6022 / NBR 10520 / NBR 6024 / NBR 6023)
 * Unidade twip: 1 pol = 1440 twips; 1 cm = 567 twips.
 */
const ABNT_CONSTANTS = {
  // Margens: Superior 3cm, Esquerda 3cm, Inferior 2cm, Direita 2cm
  PAGE_MARGIN_TOP: 1701,    // 3.0 cm
  PAGE_MARGIN_LEFT: 1701,   // 3.0 cm
  PAGE_MARGIN_BOTTOM: 1134, // 2.0 cm
  PAGE_MARGIN_RIGHT: 1134,  // 2.0 cm

  // Parágrafos
  PARAGRAPH_INDENT_FIRST_LINE: 708, // 1.25 cm de recuo de primeira linha
  LINE_SPACING_1_5: 360,           // Espaçamento 1,5 linha (240 twips = 1.0)
  LINE_SPACING_SINGLE: 240,        // Espaçamento simples (1.0)

  // Citação Direta Longa (+ de 3 linhas - NBR 10520)
  QUOTE_INDENT_LEFT: 2268,         // 4.0 cm de recuo à esquerda

  // Tipografia (tamanhos em meio-pontos: 1 pt = 2 meio-pontos)
  FONT_FAMILY: "Arial",
  FONT_SIZE_BODY: 24,              // 12 pt
  FONT_SIZE_TITLE: 28,             // 14 pt
  FONT_SIZE_SMALL: 20,             // 10 pt (citações longas, notas, paginação, fontes)
};

/**
 * Converte nós inline do TipTap em TextRuns do docx
 */
function processInlineRuns(content: JSONContent[], defaultSize = ABNT_CONSTANTS.FONT_SIZE_BODY, forceItalic = false): ParagraphChild[] {
  if (!content || !Array.isArray(content)) return [];

  const runs: ParagraphChild[] = [];

  for (const item of content) {
    if (item.type === "text") {
      let isBold = false;
      let isItalic = forceItalic;
      let isStrike = false;
      let isUnderline = false;
      let isCode = false;

      (item.marks || []).forEach((m) => {
        if (m.type === "bold") isBold = true;
        if (m.type === "italic") isItalic = true;
        if (m.type === "strike") isStrike = true;
        if (m.type === "link") isUnderline = true;
        if (m.type === "code") isCode = true;
      });

      runs.push(
        new TextRun({
          text: item.text || "",
          bold: isBold,
          italics: isItalic,
          strike: isStrike,
          underline: isUnderline ? {} : undefined,
          font: isCode ? "Consolas" : ABNT_CONSTANTS.FONT_FAMILY,
          size: isCode ? ABNT_CONSTANTS.FONT_SIZE_SMALL : defaultSize,
          color: "000000"
        })
      );
    } else if (item.type === "mathInline") {
      const latex = (item.attrs?.latex as string) || "";
      runs.push(
        new TextRun({
          text: ` [ ${latex} ] `,
          italics: true,
          font: "Cambria Math",
          size: defaultSize,
          color: "000000"
        })
      );
    } else if (item.type === "calculation") {
      const expr = (item.attrs?.expression as string) || "";
      const res = (item.attrs?.result as string) || "";
      runs.push(
        new TextRun({
          text: `${expr} = ${res}`,
          bold: true,
          font: "Consolas",
          size: defaultSize,
          color: "000000"
        })
      );
    }
  }

  return runs;
}

/**
 * Construtor principal do Documento Word no Padrão ABNT
 */
export async function generateAbntDocxDocument(title: string, bodyJsonString: string): Promise<Document> {
  const cleanTitle = title.trim() || "Trabalho Acadêmico";
  let tiptapDoc: JSONContent = { type: "doc", content: [] };

  try {
    tiptapDoc = JSON.parse(bodyJsonString);
  } catch {
    tiptapDoc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: bodyJsonString }] }]
    };
  }

  const docChildren: (Paragraph | Table)[] = [];
  let figureCounter = 1;
  let tableCounter = 1;
  let inReferencesSection = false;

  // 1. Título do Artigo / Trabalho (Centralizado, Negrito, 14pt, NBR 6022)
  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: {
        before: 120,
        after: 240,
        line: ABNT_CONSTANTS.LINE_SPACING_1_5
      },
      children: [
        new TextRun({
          text: cleanTitle.toUpperCase(),
          bold: true,
          size: ABNT_CONSTANTS.FONT_SIZE_TITLE,
          font: ABNT_CONSTANTS.FONT_FAMILY,
          color: "000000"
        })
      ]
    })
  );

  // 2. Campo de Autoria e Afiliação Institucional (Alinhado à direita, 10pt, simples)
  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: {
        before: 0,
        after: 360,
        line: ABNT_CONSTANTS.LINE_SPACING_SINGLE
      },
      children: [
        new TextRun({
          text: "Nome do(a) Autor(a)",
          bold: true,
          size: ABNT_CONSTANTS.FONT_SIZE_SMALL,
          font: ABNT_CONSTANTS.FONT_FAMILY,
          color: "333333"
        }),
        new TextRun({
          text: "\nInstituição de Ensino Superior ou Pesquisa",
          size: ABNT_CONSTANTS.FONT_SIZE_SMALL,
          font: ABNT_CONSTANTS.FONT_FAMILY,
          color: "555555"
        })
      ]
    })
  );

  const rawBlocks = tiptapDoc.content || [];

  for (const block of rawBlocks) {
    if (!block) continue;

    switch (block.type) {
      case "heading": {
        const level = block.attrs?.level || 1;
        const textContent = (block.content || []).map((c) => c.text || "").join("").trim();
        const upper = textContent.toUpperCase();

        if (upper.includes("REFERÊNCIA") || upper.includes("REFERENCIAS")) {
          inReferencesSection = true;
        } else {
          inReferencesSection = false;
        }

        if (level === 1) {
          // Seção Primária: Negrito, MAIÚSCULAS, 12pt (NBR 6024)
          docChildren.push(
            new Paragraph({
              alignment: AlignmentType.LEFT,
              spacing: {
                before: 360,
                after: 240,
                line: ABNT_CONSTANTS.LINE_SPACING_1_5
              },
              children: [
                new TextRun({
                  text: textContent.toUpperCase(),
                  bold: true,
                  size: ABNT_CONSTANTS.FONT_SIZE_BODY,
                  font: ABNT_CONSTANTS.FONT_FAMILY,
                  color: "000000"
                })
              ]
            })
          );
        } else if (level === 2) {
          // Seção Secundária: Negrito, inicial maiúscula, 12pt
          docChildren.push(
            new Paragraph({
              alignment: AlignmentType.LEFT,
              spacing: {
                before: 300,
                after: 180,
                line: ABNT_CONSTANTS.LINE_SPACING_1_5
              },
              children: [
                new TextRun({
                  text: textContent,
                  bold: true,
                  size: ABNT_CONSTANTS.FONT_SIZE_BODY,
                  font: ABNT_CONSTANTS.FONT_FAMILY,
                  color: "000000"
                })
              ]
            })
          );
        } else {
          // Seção Terciária / Quaternária: Itálico, 12pt
          docChildren.push(
            new Paragraph({
              alignment: AlignmentType.LEFT,
              spacing: {
                before: 240,
                after: 120,
                line: ABNT_CONSTANTS.LINE_SPACING_1_5
              },
              children: [
                new TextRun({
                  text: textContent,
                  italics: true,
                  size: ABNT_CONSTANTS.FONT_SIZE_BODY,
                  font: ABNT_CONSTANTS.FONT_FAMILY,
                  color: "000000"
                })
              ]
            })
          );
        }
        break;
      }

      case "paragraph": {
        const textRuns = processInlineRuns(block.content || []);
        if (textRuns.length === 0) {
          // Linha em branco
          docChildren.push(new Paragraph({ spacing: { after: 120 } }));
          break;
        }

        const rawText = (block.content || []).map((c) => c.text || "").join("").trim();
        const isAbstract = rawText.startsWith("RESUMO:") || rawText.startsWith("ABSTRACT:");

        if (isAbstract) {
          // Resumo: Justificado, espaçamento simples, sem recuo de 1ª linha
          docChildren.push(
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: {
                before: 120,
                after: 240,
                line: ABNT_CONSTANTS.LINE_SPACING_SINGLE
              },
              indent: { firstLine: 0 },
              children: textRuns
            })
          );
        } else if (inReferencesSection) {
          // Referências (NBR 6023): Alinhadas à esquerda, simples, com espaço depois
          docChildren.push(
            new Paragraph({
              alignment: AlignmentType.LEFT,
              spacing: {
                before: 0,
                after: 180,
                line: ABNT_CONSTANTS.LINE_SPACING_SINGLE
              },
              indent: { firstLine: 0 },
              children: textRuns
            })
          );
        } else {
          // Parágrafo Normal ABNT: Justificado, 1,5 linha, recuo 1,25cm
          docChildren.push(
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: {
                before: 0,
                after: 0,
                line: ABNT_CONSTANTS.LINE_SPACING_1_5
              },
              indent: { firstLine: ABNT_CONSTANTS.PARAGRAPH_INDENT_FIRST_LINE },
              children: textRuns
            })
          );
        }
        break;
      }

      case "blockquote": {
        // Citação Direta Longa (+ de 3 linhas - NBR 10520)
        // Recuo de 4cm à esquerda, fonte 10pt, espaçamento simples, sem aspas
        const innerRuns: ParagraphChild[] = [];
        (block.content || []).forEach((p) => {
          if (p.content) {
            innerRuns.push(...processInlineRuns(p.content, ABNT_CONSTANTS.FONT_SIZE_SMALL));
          }
        });

        docChildren.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: {
              before: 180,
              after: 180,
              line: ABNT_CONSTANTS.LINE_SPACING_SINGLE
            },
            indent: {
              left: ABNT_CONSTANTS.QUOTE_INDENT_LEFT,
              firstLine: 0
            },
            children: innerRuns
          })
        );
        break;
      }

      case "table": {
        // Tabela ABNT / Normas do IBGE
        const rows = block.content || [];
        if (rows.length === 0) break;

        // Título no topo da tabela
        docChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 240, after: 120, line: ABNT_CONSTANTS.LINE_SPACING_SINGLE },
            children: [
              new TextRun({
                text: `Tabela ${tableCounter} – Dados e especificações`,
                bold: true,
                size: ABNT_CONSTANTS.FONT_SIZE_SMALL,
                font: ABNT_CONSTANTS.FONT_FAMILY
              })
            ]
          })
        );

        const docxRows: TableRow[] = [];

        rows.forEach((rowNode, rowIdx) => {
          const cells = rowNode.content || [];
          const isHeaderRow = rowIdx === 0;

          const docxCells = cells.map((cellNode) => {
            const cellParagraphs: Paragraph[] = [];
            (cellNode.content || []).forEach((pNode) => {
              cellParagraphs.push(
                new Paragraph({
                  alignment: isHeaderRow ? AlignmentType.CENTER : AlignmentType.LEFT,
                  spacing: { line: ABNT_CONSTANTS.LINE_SPACING_SINGLE },
                  children: processInlineRuns(
                    pNode.content || [],
                    ABNT_CONSTANTS.FONT_SIZE_SMALL,
                    false
                  )
                })
              );
            });

            if (cellParagraphs.length === 0) {
              cellParagraphs.push(new Paragraph({ children: [] }));
            }

            return new TableCell({
              children: cellParagraphs,
              shading: isHeaderRow ? { fill: "F0EFE9" } : undefined
            });
          });

          docxRows.push(
            new TableRow({
              children: docxCells,
              tableHeader: isHeaderRow
            })
          );
        });

        // Estilo IBGE/ABNT: bordas superior e inferior nítidas, sem bordas verticais externas
        const abntTable = new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 12, color: "000000" },
            bottom: { style: BorderStyle.SINGLE, size: 12, color: "000000" },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
            insideVertical: { style: BorderStyle.NONE }
          },
          rows: docxRows
        });

        docChildren.push(abntTable);

        // Fonte no rodapé da tabela
        docChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 80, after: 240, line: ABNT_CONSTANTS.LINE_SPACING_SINGLE },
            children: [
              new TextRun({
                text: "Fonte: Dados da pesquisa ou autoria própria.",
                size: ABNT_CONSTANTS.FONT_SIZE_SMALL,
                font: ABNT_CONSTANTS.FONT_FAMILY,
                color: "555555"
              })
            ]
          })
        );

        tableCounter++;
        break;
      }

      case "mathBlock": {
        // Fórmulas em bloco destacadas com numeração
        const latex = (block.attrs?.latex as string) || "";
        docChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 200, line: ABNT_CONSTANTS.LINE_SPACING_SINGLE },
            children: [
              new TextRun({
                text: latex,
                italics: true,
                font: "Cambria Math",
                size: ABNT_CONSTANTS.FONT_SIZE_BODY
              })
            ]
          })
        );
        break;
      }

      case "mermaid": {
        // Diagrama Mermaid / Figura
        const caption = (block.attrs?.caption as string) || "Diagrama estrutural ou fluxo de processo";
        const code = (block.attrs?.code as string) || "";

        docChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 240, after: 120, line: ABNT_CONSTANTS.LINE_SPACING_SINGLE },
            children: [
              new TextRun({
                text: `Figura ${figureCounter} – ${caption}`,
                bold: true,
                size: ABNT_CONSTANTS.FONT_SIZE_SMALL,
                font: ABNT_CONSTANTS.FONT_FAMILY
              })
            ]
          })
        );

        // Bloco ilustrativo do código do modelo
        docChildren.push(
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 80, after: 80, line: ABNT_CONSTANTS.LINE_SPACING_SINGLE },
            indent: { left: 708, right: 708 },
            border: {
              left: { style: BorderStyle.SINGLE, size: 8, color: "B45309" }
            },
            children: [
              new TextRun({
                text: code,
                font: "Consolas",
                size: ABNT_CONSTANTS.FONT_SIZE_SMALL,
                color: "333333"
              })
            ]
          })
        );

        docChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 60, after: 240, line: ABNT_CONSTANTS.LINE_SPACING_SINGLE },
            children: [
              new TextRun({
                text: "Fonte: Elaborado com Magnetares Notes pelo autor.",
                size: ABNT_CONSTANTS.FONT_SIZE_SMALL,
                font: ABNT_CONSTANTS.FONT_FAMILY,
                color: "555555"
              })
            ]
          })
        );

        figureCounter++;
        break;
      }

      case "callout": {
        // Destaques Acadêmicos (Teoremas, Experimentos, Alertas)
        const type = ((block.attrs?.type as string) || "info").toUpperCase();
        const calloutRuns: ParagraphChild[] = [
          new TextRun({
            text: `[${type}] `,
            bold: true,
            font: ABNT_CONSTANTS.FONT_FAMILY,
            size: ABNT_CONSTANTS.FONT_SIZE_BODY,
            color: "000000"
          })
        ];

        (block.content || []).forEach((p) => {
          if (p.content) {
            calloutRuns.push(...processInlineRuns(p.content));
          }
        });

        docChildren.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { before: 180, after: 180, line: ABNT_CONSTANTS.LINE_SPACING_1_5 },
            indent: { left: 850 },
            border: {
              left: { style: BorderStyle.DOUBLE, size: 16, color: "333333" }
            },
            children: calloutRuns
          })
        );
        break;
      }

      case "toggle": {
        // Blocos Expansíveis (Auto-teste / Estudo Ativo)
        const toggleTitle = (block.attrs?.title as string) || "Tópico de Estudo";
        docChildren.push(
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 180, after: 80, line: ABNT_CONSTANTS.LINE_SPACING_1_5 },
            children: [
              new TextRun({
                text: `▶ ${toggleTitle}`,
                bold: true,
                font: ABNT_CONSTANTS.FONT_FAMILY,
                size: ABNT_CONSTANTS.FONT_SIZE_BODY
              })
            ]
          })
        );

        (block.content || []).forEach((inner) => {
          if (inner.content) {
            docChildren.push(
              new Paragraph({
                alignment: AlignmentType.JUSTIFIED,
                spacing: { before: 0, after: 120, line: ABNT_CONSTANTS.LINE_SPACING_1_5 },
                indent: { firstLine: ABNT_CONSTANTS.PARAGRAPH_INDENT_FIRST_LINE },
                children: processInlineRuns(inner.content)
              })
            );
          }
        });
        break;
      }

      case "bulletList":
      case "orderedList": {
        const isOrdered = block.type === "orderedList";
        const items = block.content || [];

        items.forEach((item, idx) => {
          const itemRuns: ParagraphChild[] = [];
          (item.content || []).forEach((innerP) => {
            if (innerP.content) {
              itemRuns.push(...processInlineRuns(innerP.content));
            }
          });

          docChildren.push(
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { before: 40, after: 40, line: ABNT_CONSTANTS.LINE_SPACING_1_5 },
              indent: { left: ABNT_CONSTANTS.PARAGRAPH_INDENT_FIRST_LINE },
              children: [
                new TextRun({
                  text: isOrdered ? `${idx + 1}. ` : "• ",
                  bold: isOrdered,
                  font: ABNT_CONSTANTS.FONT_FAMILY,
                  size: ABNT_CONSTANTS.FONT_SIZE_BODY
                }),
                ...itemRuns
              ]
            })
          );
        });
        break;
      }

      case "taskList": {
        const items = block.content || [];
        items.forEach((item) => {
          const checked = Boolean(item.attrs?.checked);
          const itemRuns: ParagraphChild[] = [];
          (item.content || []).forEach((innerP) => {
            if (innerP.content) {
              itemRuns.push(...processInlineRuns(innerP.content));
            }
          });

          docChildren.push(
            new Paragraph({
              alignment: AlignmentType.LEFT,
              spacing: { before: 40, after: 40, line: ABNT_CONSTANTS.LINE_SPACING_1_5 },
              indent: { left: ABNT_CONSTANTS.PARAGRAPH_INDENT_FIRST_LINE },
              children: [
                new TextRun({
                  text: checked ? "[ X ] " : "[   ] ",
                  bold: true,
                  font: "Consolas",
                  size: ABNT_CONSTANTS.FONT_SIZE_BODY
                }),
                ...itemRuns
              ]
            })
          );
        });
        break;
      }

      case "codeBlock": {
        const lang = (block.attrs?.language as string) || "Código";
        const codeText = (block.content || []).map((c) => c.text || "").join("");

        docChildren.push(
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 180, after: 180, line: ABNT_CONSTANTS.LINE_SPACING_SINGLE },
            indent: { left: 708, right: 708 },
            border: {
              top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
              left: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
              right: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" }
            },
            children: [
              new TextRun({
                text: `[${lang.toUpperCase()}]\n${codeText}`,
                font: "Consolas",
                size: ABNT_CONSTANTS.FONT_SIZE_SMALL,
                color: "111111"
              })
            ]
          })
        );
        break;
      }

      default:
        break;
    }
  }

  // Criação do Documento DOCX conforme NBR 14724
  const doc = new Document({
    title: cleanTitle,
    description: "Exportado pelo Magnetares Notes no padrão normativo ABNT",
    styles: {
      default: {
        document: {
          run: {
            font: ABNT_CONSTANTS.FONT_FAMILY,
            size: ABNT_CONSTANTS.FONT_SIZE_BODY,
            color: "000000"
          },
          paragraph: {
            spacing: {
              line: ABNT_CONSTANTS.LINE_SPACING_1_5,
              before: 0,
              after: 0
            }
          }
        }
      }
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: ABNT_CONSTANTS.PAGE_MARGIN_TOP,
              left: ABNT_CONSTANTS.PAGE_MARGIN_LEFT,
              bottom: ABNT_CONSTANTS.PAGE_MARGIN_BOTTOM,
              right: ABNT_CONSTANTS.PAGE_MARGIN_RIGHT
            }
          }
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { line: ABNT_CONSTANTS.LINE_SPACING_SINGLE },
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: ABNT_CONSTANTS.FONT_FAMILY,
                    size: ABNT_CONSTANTS.FONT_SIZE_SMALL,
                    color: "555555"
                  })
                ]
              })
            ]
          })
        },
        children: docChildren
      }
    ]
  });

  return doc;
}

/**
 * Exporta a nota diretamente para Base64 (para ser salva via bridge nativo do Wails)
 */
export async function exportToAbntDocxBase64(title: string, bodyJsonString: string): Promise<string> {
  const doc = await generateAbntDocxDocument(title, bodyJsonString);
  return await Packer.toBase64String(doc);
}

/**
 * Exporta a nota para Blob (para download direto no navegador)
 */
export async function exportToAbntDocxBlob(title: string, bodyJsonString: string): Promise<Blob> {
  const doc = await generateAbntDocxDocument(title, bodyJsonString);
  return await Packer.toBlob(doc);
}
