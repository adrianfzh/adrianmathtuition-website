import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Not our code / retired code:
    "public/pdf.worker.min.mjs", // vendored pdfjs build artifact
    "_old/**", // pre-App-Router legacy, kept for reference only
    "_backups/**",
    // Session config/skills, not app code — peers committing .claude/skills/*
    // put 17k+ eslint errors on the 0-errors CI gate (2026-08-27).
    ".claude/**",
  ]),
  {
    // Same glob as eslint-config-next's own `next` object — the only place the
    // react-hooks plugin is registered. Unscoped, this object also reached `.cjs`
    // files, where that plugin is not loaded, so ESLint refused to start
    // ("could not find plugin react-hooks") once scripts/leak-test/leaktest.cjs
    // landed (5 Sep 2026).
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      // ~730 pre-existing `any`s — keep them visible as warnings instead of a
      // permanent red wall; new code should still prefer real types.
      "@typescript-eslint/no-explicit-any": "warn",
      // React-Compiler-prep rules (new in react-hooks v6) flag long-standing
      // working patterns; fix opportunistically rather than gate CI on them.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/error-boundaries": "warn",
    },
  },
  {
    // Node CommonJS utility scripts — require() is correct there.
    files: ["scripts/**/*.{js,cjs}"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
