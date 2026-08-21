/**
 * As rotas do jogo, no fragmento do URL.
 *
 * **No fragmento e não no caminho**, e não é detalhe: um `#/niveis/perito` chega
 * ao servidor como um pedido de `/`, portanto o jogo publicado corre em qualquer
 * alojamento estático sem uma linha de configuração de reescritas. Com rotas no
 * caminho, recarregar a página num nível dava 404 em metade dos alojamentos.
 *
 * A consequência que interessa é outra: **cada ecrã tem endereço**. No playtest
 * externo isso vale mais do que parece — um link leva a pessoa exatamente ao
 * nível de que se está a falar, e o botão de retroceder do browser funciona sem
 * nada feito para isso.
 */

export type Rota =
  | { readonly ecra: "home" }
  | { readonly ecra: "bandas" }
  | { readonly ecra: "niveis"; readonly capitulo: string }
  | { readonly ecra: "jogo"; readonly banda: string; readonly nivel: number }
  | { readonly ecra: "tempo" }
  | { readonly ecra: "definicoes" };

export const ROTA_INICIAL: Rota = { ecra: "home" };

export function paraHash(r: Rota): string {
  switch (r.ecra) {
    case "home":
      return "#/";
    case "bandas":
      return "#/puzzles";
    case "niveis":
      return `#/puzzles/${encodeURIComponent(r.capitulo)}`;
    case "jogo":
      return `#/jogo/${encodeURIComponent(r.banda)}/${String(r.nivel)}`;
    case "tempo":
      return "#/contrarrelogio";
    case "definicoes":
      return "#/definicoes";
  }
}

/** Uma rota que não se reconheça é a Home. Um URL partido não trava o jogo. */
export function deHash(hash: string): Rota {
  const partes = hash
    .replace(/^#\/?/, "")
    .split("/")
    .filter((s) => s.length > 0)
    .map((s) => decodeURIComponent(s));

  const [primeira, segunda, terceira] = partes;

  if (primeira === undefined) return ROTA_INICIAL;

  if (primeira === "contrarrelogio" || primeira === "tempo") {
    return { ecra: "tempo" };
  }
  if (primeira === "definicoes") return { ecra: "definicoes" };

  // `niveis` é o nome antigo de `puzzles`, e continua a ser aceite à entrada.
  if (primeira === "puzzles" || primeira === "niveis") {
    return segunda === undefined
      ? { ecra: "bandas" }
      : { ecra: "niveis", capitulo: segunda };
  }

  /*
   * A rota do jogo identifica o nível pela **banda e pelo índice nela**, não
   * pela posição no capítulo. É o par que identifica o nível no pack, portanto
   * um link continua a valer se a cadência de intercalação mudar — e é o que
   * mantém os links antigos a funcionar sem tradução nenhuma.
   */
  if (primeira === "jogo" && segunda !== undefined) {
    const n = Number.parseInt(terceira ?? "0", 10);
    return {
      ecra: "jogo",
      banda: segunda,
      nivel: Number.isFinite(n) && n >= 0 ? n : 0,
    };
  }

  return ROTA_INICIAL;
}

/**
 * A forma antiga, `?banda=perito&nivel=27`, continua a levar ao sítio certo.
 *
 * Existiu enquanto não havia lista de níveis, e há links dela espalhados por
 * notas e conversas. Traduzir é uma linha; deixá-los partir seria gratuito.
 */
export function rotaLegada(procura: string): Rota | undefined {
  const q = new URLSearchParams(procura);
  const banda = q.get("banda");
  if (banda === null) return undefined;

  const n = Number.parseInt(q.get("nivel") ?? "0", 10);
  return {
    ecra: "jogo",
    banda,
    nivel: Number.isFinite(n) && n >= 0 ? n : 0,
  };
}
