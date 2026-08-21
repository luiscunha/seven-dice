/**
 * O único passo de build do monorepo.
 *
 * `engine` e `tools` continuam a correr por código-fonte, sem build — é o que
 * garante que a mesma engine corre no jogo, no pipeline e nos testes. O `game`
 * precisa de bundler porque é uma app web, e só ele.
 *
 * Não há alias para `@dicetoseven/engine`: o `exports` do pacote aponta para
 * `src/index.ts` e o Vite resolve-o pelo workspace, tal como o Vitest e o `tsc`.
 * Um alias aqui seria um segundo caminho de resolução — e dois caminhos são a
 * porta para divergirem.
 */

import { defineConfig } from "vite";

export default defineConfig({
  // Caminhos relativos: o build tem de funcionar servido de uma subpasta, que é
  // como um playtest por link costuma acabar.
  base: "./",
  build: {
    outDir: "dist",
    // Com ≤ 50 peças e sem dependências de runtime, o bundle é pequeno. Um aviso
    // aqui significa que entrou alguma coisa que não devia.
    chunkSizeWarningLimit: 300,
  },
  server: {
    port: 5173,
  },
});
