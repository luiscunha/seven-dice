/**
 * A corrida de Survival gravada.
 *
 * O defeito que estes testes fixam: sair a meio e voltar dava um tabuleiro novo
 * em folha. A causa não estava na gravação — estava em entrar sem seed e
 * sortear sempre uma nova, que nunca casava com a da corrida guardada.
 */

import { describe, expect, it } from "vitest";

import {
  CORRIDA_KEY,
  guardarCorrida,
  lerCorrida,
  limparCorrida,
} from "../src/session/corridaSurvival";
import type { ProfileStorage } from "../src/session/progress";
import { injectRow, startSurvival } from "../src/session/SurvivalSession";
import type { SurvivalState } from "../src/session/SurvivalSession";

const SEED = 20260822;

const memoria = (): ProfileStorage & { readonly dados: Map<string, string> } => {
  const dados = new Map<string, string>();
  return {
    dados,
    getItem: (k) => dados.get(k) ?? null,
    setItem: (k, v) => void dados.set(k, v),
  };
};

const emJogo = (): SurvivalState => injectRow(startSurvival(SEED), true);

describe("gravar e reler a corrida", () => {
  it("volta exatamente ao mesmo sítio", () => {
    const s = memoria();
    const estado = emJogo();

    guardarCorrida(s, { estado, decorridoMs: 12_345 });
    const lida = lerCorrida(s);

    expect(lida?.decorridoMs).toBe(12_345);
    expect(lida?.estado.seed).toBe(SEED);
    expect(lida?.estado.game.board).toEqual(estado.game.board);
    // A fila seguinte depende disto, e é o que o jogador vê ao voltar.
    expect(lida?.estado.linhasInjetadas).toBe(estado.linhasInjetadas);
    expect(lida?.estado.pecasDesdeJoker).toBe(estado.pecasDesdeJoker);
  });

  it("sem nada gravado, não há nada a retomar", () => {
    expect(lerCorrida(memoria())).toBeUndefined();
  });

  it("limpar apaga-a", () => {
    const s = memoria();
    guardarCorrida(s, { estado: emJogo(), decorridoMs: 1 });
    limparCorrida(s);
    expect(lerCorrida(s)).toBeUndefined();
  });
});

describe("uma corrida acabada não se retoma", () => {
  it("nem morta, nem limpa", () => {
    for (const fim of [{ morto: true }, { limpo: true }]) {
      const s = memoria();
      guardarCorrida(s, { estado: { ...emJogo(), ...fim }, decorridoMs: 1 });

      // Voltar a um tabuleiro transbordado seria voltar a um ecrã de derrota.
      expect(lerCorrida(s)).toBeUndefined();
    }
  });
});

describe("ler nunca falha", () => {
  const recusa = (bruto: string): void => {
    const s = memoria();
    s.setItem(CORRIDA_KEY, bruto);
    expect(lerCorrida(s)).toBeUndefined();
  };

  it("aguenta lixo, versões desconhecidas e campos em falta", () => {
    recusa("isto não é json");
    recusa("null");
    recusa("[]");
    recusa(JSON.stringify({ version: 99, corrida: {} }));
    recusa(JSON.stringify({ version: 1 }));
    recusa(JSON.stringify({ version: 1, corrida: { estado: {}, decorridoMs: 0 } }));
  });

  it("recusa um tabuleiro que não passa nas invariantes", () => {
    const s = memoria();
    const estado = emJogo();

    // Uma coluna vazia quebra a invariante 1, e um tabuleiro assim rebentaria
    // no motor a meio de uma jogada.
    s.setItem(
      CORRIDA_KEY,
      JSON.stringify({
        version: 1,
        corrida: {
          estado: { ...estado, game: { ...estado.game, board: [[1], [], [2]] } },
          decorridoMs: 0,
        },
      }),
    );

    expect(lerCorrida(s)).toBeUndefined();
  });

  it("um tempo absurdo também não passa", () => {
    const s = memoria();
    s.setItem(
      CORRIDA_KEY,
      JSON.stringify({ version: 1, corrida: { estado: emJogo(), decorridoMs: null } }),
    );
    expect(lerCorrida(s)).toBeUndefined();
  });
});
