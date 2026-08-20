/**
 * `septet play` — renderer de consola.
 *
 * **É um instrumento de medição, não um jogo.** Existe para responder ao risco
 * nº 1 do plano §8, que nenhuma métrica da fase 5 responde:
 *
 *   > O colapso de colunas é difícil de antecipar mentalmente → o puzzle vira
 *   > sorte.
 *
 * O critério é concreto e é humano: **dá para planear 2–3 jogadas à frente?** Se
 * não der, a mecânica de reorganização tem de mudar — e é incomparavelmente mais
 * barato descobri-lo aqui do que depois da UI (spec §10).
 *
 * Por isso a sessão regista tudo o que se passou e escreve um registo no fim: o
 * objetivo de uma tarde a jogar é sair com números, não só com impressões.
 */

import { appendFile, readFile } from "node:fs/promises";
import { createInterface } from "node:readline";

import type { Group, Level, Packed } from "@septet/engine";
import { generate, pieceCount, toLevel } from "@septet/engine";

import { bandById } from "./bands";
import { avaliar } from "./candidate";
import {
  desenharTabuleiro,
  descreverSelecao,
  escreverGrupo,
  lerCoordenada,
} from "./render";
import type { Sessao } from "./session";
import {
  dica,
  desfazer,
  gruposValidos,
  iniciar,
  limparSelecao,
  reiniciar,
  selo,
  terminado,
  tocar,
} from "./session";

const escrever = (s: string): void => {
  process.stdout.write(`${s}\n`);
};

const AJUDA = `
  b2          toca na peça (coluna por letra, linha a partir da base)
  b2 c2 c3    toca em várias de uma vez
  z           desfaz — a última peça tocada, ou a última jogada
  c           limpa a seleção
  r           reinicia o nível
  h           dica
  g           lista os grupos válidos
  s           liga/desliga o modo de dois passos (sem gravidade, e depois final)
  ?           esta ajuda
  q           sai
`;

export interface OpcoesPlay {
  readonly pack?: string;
  readonly band?: string;
  readonly id?: string;
  readonly seed?: string;
  readonly log?: string;
  /** Arranca com o modo de dois passos ligado. Alterna-se com `s` durante o jogo. */
  readonly passos?: boolean;
}

function cabecalho(s: Sessao): string {
  const m = s.level.metrics;
  return (
    `${s.level.id}  ·  ${pieceCount(s.board)}/${m?.pieces ?? pieceCount(s.level.board)} peças` +
    `  ·  jogadas ${s.jogadas}` +
    (m === undefined
      ? ""
      : `  ·  sobrevivência ${(m.survivalRate * 100).toFixed(0)}%` +
        `  ·  solução em ${m.solutionLength}`)
  );
}

function mostrar(s: Sessao, marcadas?: ReadonlySet<Packed>): void {
  escrever("");
  escrever(cabecalho(s));
  escrever("");
  escrever(
    desenharTabuleiro(s.board, {
      selecao: new Set(s.selecao),
      ...(marcadas === undefined ? {} : { marcadas }),
    }),
  );
  escrever("");
  escrever(`  ${descreverSelecao(s.board, s.selecao)}`);

  if (s.mensagem !== "") escrever(`  ⚠ ${s.mensagem}`);
}

/**
 * Mostra a jogada em duas transformações separadas — primeiro o buraco, depois a
 * queda e o deslize.
 *
 * É a mesma separação que o plano §8 recomenda para as animações da UI, e serve
 * exatamente o risco que esta fase mede: dar ao jogador a hipótese de as
 * antecipar em vez de as sofrer.
 */
function mostrarPassos(antes: Sessao, grupo: Group, depois: Sessao): void {
  escrever("");
  escrever("  1) o grupo sai — a gravidade ainda não caiu:");
  escrever("");
  escrever(desenharTabuleiro(antes.board, { removidas: new Set(grupo) }));
  escrever("");
  escrever("  2) gravidade e colapso de colunas:");
  escrever("");
  escrever(desenharTabuleiro(depois.board));
}

/** Anuncia o fim, se for o caso. Devolve se o ciclo deve parar. */
function anunciarFim(s: Sessao): boolean {
  if (!terminado(s)) return false;

  escrever("");
  escrever(`  ✓ tabuleiro limpo — selo: ${String(selo(s))}`);
  escrever(
    `    jogadas ${s.jogadas} · undos ${s.undos} · reinícios ${s.reinicios} · dicas ${s.dicas}`,
  );
  return true;
}

async function carregarNivel(o: OpcoesPlay): Promise<Level | undefined> {
  if (o.seed !== undefined) {
    const band = bandById(o.band ?? "meio");
    if (band === undefined) return undefined;

    /*
     * `--seed` serve para ver o que uma seed produz, e não para pedir um nível
     * que passe a banda. Se o candidato foi rejeitado — por sobrevivência, por
     * piso — joga-se na mesma: é justamente esse o tabuleiro que se quer ver.
     */
    const avaliacao = avaliar(Number(o.seed), band, 200);
    if (avaliacao.level !== undefined) return avaliacao.level;

    const gerado = generate(Number(o.seed), {
      ...band.params,
      targetPieceCount: band.pieces[0],
    });
    if (gerado === undefined) return undefined;

    escrever(`  (esta seed foi rejeitada pela banda ${band.id} — joga-se na mesma)`);
    return toLevel(`${band.id}-seed-${o.seed}`, Number(o.seed), gerado);
  }

  const caminho = o.pack ?? "packages/tools/out/level-pack.json";
  const pack = JSON.parse(await readFile(caminho, "utf8")) as Level[];

  if (o.id !== undefined) return pack.find((l) => l.id === o.id);

  const candidatos =
    o.band === undefined ? pack : pack.filter((l) => l.band === o.band);

  return candidatos[0];
}

async function registar(s: Sessao, log: string | undefined): Promise<void> {
  if (log === undefined) return;

  const linha = {
    quando: new Date().toISOString(),
    nivel: s.level.id,
    banda: s.level.band,
    pecas: s.level.metrics?.pieces,
    sobrevivencia: s.level.metrics?.survivalRate,
    terminado: terminado(s),
    selo: selo(s),
    jogadas: s.jogadas,
    undos: s.undos,
    reinicios: s.reinicios,
    dicas: s.dicas,
    dicasCalculadas: s.dicasCalculadas,
  };

  await appendFile(log, `${JSON.stringify(linha)}\n`, "utf8");
}

export async function comandoPlay(o: OpcoesPlay): Promise<number> {
  const level = await carregarNivel(o);

  if (level === undefined) {
    escrever("não encontrei esse nível");
    return 1;
  }

  let passos = o.passos === true;
  let s = iniciar(level);

  escrever(AJUDA);
  mostrar(s);

  const rl = createInterface({ input: process.stdin, terminal: false });

  for await (const linha of rl) {
    const comando = linha.trim();
    if (comando === "" ) continue;
    if (comando === "q") break;

    if (comando === "?") {
      escrever(AJUDA);
      continue;
    }

    if (comando === "z") {
      s = desfazer(s);
      mostrar(s);
      continue;
    }

    if (comando === "s") {
      passos = !passos;
      escrever(`  modo de dois passos: ${passos ? "ligado" : "desligado"}`);
      continue;
    }

    if (comando === "c") {
      s = limparSelecao(s);
      mostrar(s);
      continue;
    }

    if (comando === "r") {
      s = reiniciar(s);
      mostrar(s);
      continue;
    }

    if (comando === "g") {
      const grupos = gruposValidos(s);
      escrever("");
      escrever(`  ${grupos.length} grupos válidos:`);
      for (const g of grupos.slice(0, 30)) escrever(`    ${escreverGrupo(g)}`);
      if (grupos.length > 30) escrever(`    … e mais ${grupos.length - 30}`);
      continue;
    }

    if (comando === "h") {
      const r = dica(s);
      s = r.sessao;

      if (r.grupo === undefined) {
        mostrar(s);
        continue;
      }

      escrever("");
      escrever(
        `  dica (${r.origem}): ${escreverGrupo(r.grupo)}`,
      );
      mostrar(s, new Set(r.grupo));
      continue;
    }

    const coordenadas = comando.split(/\s+/).map(lerCoordenada);

    if (coordenadas.some((p) => p === undefined)) {
      escrever(`  não percebi "${comando}" — escreve ? para a ajuda`);
      continue;
    }

    for (const p of coordenadas as Packed[]) {
      const antes = s;
      const selecionadas = [...s.selecao, p];
      s = tocar(s, p);

      // A jogada aconteceu se o histórico cresceu.
      if (passos && s.historico.length > antes.historico.length) {
        mostrarPassos(antes, [...selecionadas].sort((x, y) => x - y), s);
      }
    }

    mostrar(s);

    if (anunciarFim(s)) break;
  }

  rl.close();
  await registar(s, o.log);

  escrever("");
  escrever(
    `  fim · ${s.level.id} · jogadas ${s.jogadas} · undos ${s.undos} · ` +
      `reinícios ${s.reinicios} · dicas ${s.dicas} (${s.dicasCalculadas} recalculadas)`,
  );

  return 0;
}
