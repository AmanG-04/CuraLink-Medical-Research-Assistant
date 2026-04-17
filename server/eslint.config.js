import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**"]
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.node,
      sourceType: "module"
    },
    rules: {
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
    }
  }
];
