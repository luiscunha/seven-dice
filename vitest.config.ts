import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "test/**/*.test.ts"],
    // Fase 0: só existem os testes de higiene. As fases 1+ enchem isto.
    passWithNoTests: true,
    // A engine e o pipeline são Node puro. Quando a UI web chegar (fase 8),
    // separar em `projects` e dar ao `game` um ambiente jsdom.
    environment: "node",
  },
});
