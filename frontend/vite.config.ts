import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules/@xyflow")) return "vendor-flow";
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) return "vendor-react";
        },
      },
    },
  },
});
