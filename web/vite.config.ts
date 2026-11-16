import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    // In development the Go sync server runs next to Vite on port 8080.
    proxy: { "/ws": { target: "ws://localhost:8080", ws: true } },
  },
  test: { environment: "node" },
});
