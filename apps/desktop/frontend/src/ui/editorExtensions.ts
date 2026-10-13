import Highlight from "@tiptap/extension-highlight";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { LineHeight } from "./LineHeightExtension";
import { common, createLowlight } from "lowlight";
import { CalculationNode } from "./CalculationNode";
import { MathInlineNode, MathBlockNode } from "./MathNodes";
import { CalloutNode } from "./CalloutNode";
import { ToggleNode } from "./ToggleNode";

export const editorExtensions = [
  StarterKit.configure({ codeBlock: false }),
  CodeBlockLowlight.configure({ lowlight: createLowlight(common), defaultLanguage: "plaintext" }),
  Highlight,
  Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  TaskList,
  TaskItem.configure({ nested: true }),
  CalculationNode,
  MathInlineNode,
  MathBlockNode,
  CalloutNode,
  ToggleNode,
  Placeholder.configure({ placeholder: "Comece a escrever" }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  TextStyle,
  Color,
  LineHeight
];
