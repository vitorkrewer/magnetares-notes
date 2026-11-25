import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react-dom") || id.includes("/react/")) {
            return "vendor-react";
          }
          if (id.includes("@tiptap") || id.includes("prosemirror") || id.includes("lowlight")) {
            return "vendor-tiptap";
          }
          if (id.includes("katex")) {
            return "vendor-katex";
          }
          if (id.includes("mathjs")) {
            return "vendor-mathjs";
          }
          if (id.includes("docx")) {
            return "vendor-docx";
          }
          if (id.includes("@monaco-editor")) {
            return "vendor-monaco";
          }
          return undefined;
        },
      },
    },
  },
});
