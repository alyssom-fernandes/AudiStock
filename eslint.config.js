import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/", "playwright-report/", "test-results/", "supabase/functions/**/*.ts"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser },
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }], // catch vazio é intencional (storage/DOM best-effort)
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["testes/**/*.mjs", "playwright.config.mjs", "supabase/functions/**/*.js"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["sw.js"],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
];
