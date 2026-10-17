import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // /api/* goes to the Python recommender server (python server.py at the repo root).
    proxy: { "/api": "http://localhost:8000" },
    // Allow importing the plate component from ../plate-visualizer.
    fs: { allow: [".."] },
  },
});
