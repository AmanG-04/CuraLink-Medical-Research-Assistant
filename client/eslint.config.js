import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import react from "eslint-plugin-react";

export default [
  {
    ignores: ["dist/**", "node_modules/**"]
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: "module"
      }
    },
    plugins: {
      react,
      "react-hooks": reactHooks
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-vars": "error",
      "react/prop-types": "off",
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
    },
    settings: {
      react: { version: "detect" }
    }
  }
];
