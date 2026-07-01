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
  // Bespoke boundary: core part files must not import from bespoke folders.
  // This keeps the main bundle free of client-specific code and prevents
  // accidental coupling between the shared part registry and bespoke parts.
  {
    files: [
      "components/report-sections/*/parts/registry.ts",
      "components/report-sections/*/parts/*.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/parts/bespoke/**"],
              message:
                "Core part files must not import from bespoke/. Merge registries at render time instead.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
