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
  ]),
  {
    rules: {
      // セルの値はスプレッドシート由来の異種混在(string|number|boolean|エラー|null)で、
      // workbook-model.json も未型付け。計算エンジン層では any を意図的に許容する。
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
