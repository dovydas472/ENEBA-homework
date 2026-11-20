// ESLint flat config (same set of plugins as Vite's React + TypeScript template).
// It lints the frontend only (TypeScript files); the Go code has its own checks in CI.
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  // Build output and installed packages are never linted.
  globalIgnores(["dist", "node_modules"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended, // core JavaScript mistakes (unused vars, undefined names, ...)
      tseslint.configs.recommended, // TypeScript-specific mistakes
      reactHooks.configs.flat.recommended, // rules of hooks + exhaustive effect dependencies
      reactRefresh.configs.vite, // keeps Vite's fast refresh working (components-only exports)
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
  },
]);
