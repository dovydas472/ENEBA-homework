import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev proxy: the browser calls /api/... on the Vite port, Vite forwards it to
// the local Go server (cmd/local) so there are no CORS issues in development.
// Everything local listens on 127.0.0.1 only (CLAUDE.md). The proxy target is 127.0.0.1, not "localhost":
// Node may resolve "localhost" to the IPv6 ::1, where cmd/local does not listen.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": "http://127.0.0.1:8080",
    },
  },
  preview: {
    host: "127.0.0.1",
  },
});
