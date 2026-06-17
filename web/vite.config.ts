import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  envDir: "..",
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    rollupOptions: {
      output: {
        // Split the heavy, rarely-changing vendors into their own long-lived
        // cache chunks so the app shell stays small and updates ship less code.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("@tanstack")) return "query";
          if (id.includes("@dnd-kit")) return "dnd";
          if (id.includes("react-router") || id.includes("react-dom") ||
              /node_modules\/(react|scheduler)\//.test(id)) return "react";
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
