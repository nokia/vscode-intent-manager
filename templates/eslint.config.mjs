import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [...compat.extends("eslint:recommended"), {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
        globals: {
            Java: "readonly",
            mds: "readonly",
            logger: "readonly",
            utilityService: "readonly",
            topologyFactory: "readonly",
            restClient: "readonly",
            resourceProvider: "readonly"
        },
        ecmaVersion: 12,
        sourceType: "module",
        parserOptions: {
            ecmaVersion: 2021,
            sourceType: "module",
        },
    },
    rules: {
        semi: [2, "always"],
        "no-undef": "error",
        "no-unused-vars": ["error", {args: "none"},],
    },
}];