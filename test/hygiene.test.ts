import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Invariantes do repositório que o lint e o compilador não conseguem exprimir.
 *
 * A regra "a engine não importa nada" (spec §1.3) tem duas metades: o lint cobre
 * o código, este teste cobre o manifesto. Sem ele, bastava um `pnpm add` para a
 * engine deixar de correr nos três contextos sem que nada acusasse.
 */

const readPkg = (relative: string): Record<string, unknown> =>
  JSON.parse(
    readFileSync(new URL(`../${relative}`, import.meta.url), "utf8"),
  ) as Record<string, unknown>;

describe("higiene do repositório", () => {
  it("a engine não declara dependências de runtime", () => {
    const pkg = readPkg("packages/engine/package.json");

    expect(pkg["dependencies"] ?? {}).toEqual({});
    expect(pkg["peerDependencies"] ?? {}).toEqual({});
    expect(pkg["optionalDependencies"] ?? {}).toEqual({});
  });

  it("a engine não declara ferramentas próprias", () => {
    // Todo o tooling vive na raiz. Duplicá-lo por pacote abre a porta a versões
    // divergentes de TypeScript ou Vitest entre gerador e jogo.
    const pkg = readPkg("packages/engine/package.json");

    expect(pkg["devDependencies"] ?? {}).toEqual({});
  });

  it("os consumidores da engine ligam-se por workspace, não por versão", () => {
    for (const consumidor of ["packages/tools", "packages/game"]) {
      const pkg = readPkg(`${consumidor}/package.json`);
      const deps = (pkg["dependencies"] ?? {}) as Record<string, string>;

      expect(deps["@septet/engine"]).toBe("workspace:*");
    }
  });
});
