import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev proxy: the browser calls /api/... on the Vite port, Vite forwards it to
// the local Go server (cmd/local) so there are no CORS issues in development.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8080",
    },
  },
});
