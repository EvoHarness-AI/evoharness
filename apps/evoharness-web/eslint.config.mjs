import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".claude/**",
      ".next/**",
      ".next-desktop/**",
      "test-results/**",
      "src-tauri/resources/server/**",
      "src-tauri/target/**",
      // demo/ is a separate Next.js project with its own lint config.
      "demo/**",
      // Generated, minified library bundles (scripts/build-preview-runtime.mjs).
      "public/preview-runtime/**",
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      // Newer than the vendored code: the manual useMemo/useCallback patterns
      // upstream shipped predate the React Compiler rules. Restructuring them
      // would be an upstream rewrite; the sibling rules above are disabled for
      // the same reason.
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
];

export default eslintConfig;
