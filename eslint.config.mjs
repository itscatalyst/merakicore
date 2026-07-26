import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/coverage/**"] },
  eslint.configs.recommended,
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: globals.node }
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts"],
    languageOptions: {
      ...config.languageOptions,
      parserOptions: {
        projectService: { allowDefaultProject: ["vitest.config.ts"] },
        tsconfigRootDir: import.meta.dirname
      }
    }
  })),
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: { allowDefaultProject: ["vitest.config.ts"] },
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@meraki/*/src", "@meraki/*/src/**"],
              message: "Import another workspace through its public package export."
            },
            {
              group: ["apps/*", "apps/**"],
              message: "Workspace packages must never depend on application internals."
            }
          ]
        }
      ]
    }
  },
  {
    // Vitest asymmetric matchers (expect.any, expect.stringContaining, ...) are typed as `any`,
    // so the unsafe-value rules fire on every assertion rather than on real type holes.
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off"
    }
  }
);
