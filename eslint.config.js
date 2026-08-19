// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Módulos de Node que a engine não pode importar. A regra cobre tanto a forma
 * `node:fs` como a forma nua `fs`.
 */
const NODE_BUILTINS = [
  "assert",
  "buffer",
  "child_process",
  "crypto",
  "events",
  "fs",
  "http",
  "https",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "readline",
  "stream",
  "timers",
  "url",
  "util",
  "worker_threads",
  "zlib",
];

const PUREZA =
  "A engine não importa nada (spec §1.3): sem Node, sem DOM, sem dependências. " +
  "É isso que permite correr exatamente o mesmo código no jogo, no pipeline e nos testes — " +
  "e é daí que vem a impossibilidade de divergência entre gerador e jogo (spec §1.2).";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      ".vs/**",
      "**/*.d.ts",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  /*
   * ── Pureza da engine ───────────────────────────────────────────────────────
   *
   * Estas regras não são estilo. Cada uma protege uma propriedade concreta que
   * a spec exige, e nenhuma se silencia com um comentário sem que isso apareça
   * na revisão.
   */
  {
    files: ["packages/engine/**/*.ts"],
    rules: {
      /*
       * Determinismo (spec §7.1). Sem seed explícita não há reprodutibilidade —
       * e sem reprodutibilidade não há seeds determinísticas, puzzle diário nem
       * leaderboards justos.
       */
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message:
            "A engine é determinística (spec §1.1, §7.1): usar um `Rng` semeado " +
            "(mulberry32) passado por parâmetro, nunca Math.random().",
        },
      ],

      // Apanha também `const { random } = Math` e `Math["random"]`, que a regra
      // acima deixa passar.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.name='Math'][property.value='random']",
          message:
            "A engine é determinística (spec §1.1, §7.1): usar um `Rng` semeado.",
        },
        {
          selector:
            "VariableDeclarator[init.name='Math'] > ObjectPattern > Property[key.name='random']",
          message:
            "A engine é determinística (spec §1.1, §7.1): usar um `Rng` semeado.",
        },
      ],

      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["node:*"], message: PUREZA },
            { group: NODE_BUILTINS, message: PUREZA },
          ],
        },
      ],

      /*
       * `lib`/`types` no tsconfig da engine já tornam estes globais invisíveis
       * ao compilador; a regra existe para dar a mensagem certa em vez de um
       * "Cannot find name".
       */
      "no-restricted-globals": [
        "error",
        { name: "process", message: PUREZA },
        { name: "Buffer", message: PUREZA },
        { name: "require", message: PUREZA },
        { name: "__dirname", message: PUREZA },
        { name: "document", message: PUREZA },
        { name: "window", message: PUREZA },
        { name: "navigator", message: PUREZA },
        { name: "localStorage", message: PUREZA },
        {
          name: "crypto",
          message:
            "Fonte de aleatoriedade não semeada. A engine é determinística (spec §7.1).",
        },
        {
          name: "performance",
          message:
            "A engine não tem relógio (spec §1.1). Orçamentos de tempo passam-se em `Limits`.",
        },
      ],
    },
  },

  /*
   * O `tools` é Node por definição: é ele que paraleliza os playouts com
   * `worker_threads` (spec §7.2) e escreve os level packs.
   */
  {
    files: ["packages/tools/**/*.ts", "test/**/*.ts", "*.config.ts"],
    rules: {
      "no-restricted-imports": "off",
      "no-restricted-globals": "off",
    },
  },
);
