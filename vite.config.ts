import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev proxy: the browser calls /api/... on the Vite port, Vite forwards it to
// the local Go server (cmd/local) so there are no CORS issues in development.
// Everything local listens on 127.0.0.1 only (CLAUDE.md). The proxy target is 127.0.0.1, not "localhost":
// Node may resolve "localhost" to the IPv6 ::1, where cmd/local does not listen.
//
// The object form (not the string shorthand) on purpose (Task 14): the shorthand turns on `changeOrigin`,
// which rewrites the Host header to 127.0.0.1:8080. The API's CSRF check compares the browser's Origin
// (127.0.0.1:5173) with the host, so every POST (sign in, sign out...) would get 403. Here the Host header is
// kept and `xfwd` adds X-Forwarded-Host - the same header Vercel's proxy sends in production.
// `vite preview` uses the same proxy (preview.proxy defaults to server.proxy).
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": { target: "http://127.0.0.1:8080", xfwd: true },
    },
  },
  preview: {
    host: "127.0.0.1",
  },
});
