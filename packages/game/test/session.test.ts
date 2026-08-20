/**
 * Camada de sessão (plano, fase 7).
 *
 * O que se testa aqui não é a engine — é o que a engine deliberadamente não
 * sabe: undo, selos, relógio, combos e progressão. Nada nestes testes toca no
 * DOM nem no relógio do sistema, e isso não é comodidade: é a propriedade que a
 * fase tinha de entregar.
 */

import { describe, expect, it } from "vitest";

import type { Board, Group, Level } from "@septet/engine";
import { boardKey, packed } from "@septet/engine";

import {
  clearSelection,
  hint,
  isFinished,
  remainingToTarget,
  selectionTotal,
  restart,
  startGame,
  tap,
  undo,
} from "../src/session/GameSession";
import {
  restartPuzzle,
  seal,
  startPuzzle,
  undoPuzzle,
  usePuzzleHint,
} from "../src/session/PuzzleSession";
import {
  DEFAULT_TIME_ATTACK,
  JokerInTimeAttackError,
  boardReward,
  isOver,
  nextBoard,
  remainingMs,
  startTimeAttack,
  tapTimeAttack,
} from "../src/session/TimeAttackSession";
import { breakCombo, registerMove, startCombo } from "../src/session/combos";
import { comboMultiplier, moveScore } from "../src/session/scoring";
import {
  PROFILE_KEY,
  PROFILE_VERSION,
  emptyProfile,
  load,
  recordLevel,
  recordTimeAttack,
  save,
} from "../src/session/progress";
import type { ProfileStorage } from "../src/session/progress";

/*
 * 1 + 2 + 4 em L: a coluna a leva o 1 e o 2, a coluna b leva o 4. Some 7 e é
 * conexo, portanto é o grupo mais pequeno que exercita as três condições de
 * §3.1 de uma vez.
 */
const BOARD: Board = [
  [1, 2],
  [4],
];

const L_GROUP: Group = [packed(0, 0), packed(0, 1), packed(1, 0)] as Group;

const level = (board: Board, solution: readonly Group[] = []): Level => ({
  id: "teste-000000",
  seed: 0,
  board,
  solution: solution as never,
});

const memoryStorage = (): ProfileStorage => {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
};

describe("GameSession", () => {
  it("tocar acumula, e o grupo válido sem joker elimina sozinho", () => {
    let s = startGame(level(BOARD));

    s = tap(s, packed(0, 0));
    expect(s.moves).toBe(0);

    s = tap(s, packed(0, 1));
    expect(s.moves).toBe(0);

    s = tap(s, packed(1, 0));
    expect(s.moves).toBe(1);
    expect(isFinished(s)).toBe(true);
  });

  it("tocar outra vez na mesma peça retira-a da seleção", () => {
    let s = startGame(level(BOARD));

    s = tap(s, packed(0, 0));
    s = tap(s, packed(0, 0));

    expect(s.selection).toEqual([]);
  });

  it("recusa a peça que passaria do alvo, em vez de atolar a seleção", () => {
    let s = startGame(level([[4, 5]] as Board));

    s = tap(s, packed(0, 0));
    s = tap(s, packed(0, 1));

    expect(s.selection).toHaveLength(1);
    expect(s.rejection).toBe("over-target");
  });

  it("não deixa tocar onde não há peça", () => {
    expect(tap(startGame(level(BOARD)), packed(1, 5)).rejection).toBe("no-piece");
  });

  /*
   * A lição da fase 6, agora na camada que a UI vai consumir. Com joker, várias
   * seleções diferentes são todas válidas, e eliminar à primeira rouba ao
   * jogador a única decisão que o joker oferece.
   */
  /*
   * O joker não precisa de tratamento especial na interação, e é isso que se
   * fixa aqui.
   *
   * O valor dele está globalmente determinado (spec §2.6), logo também está
   * determinada a soma que as fixas do grupo têm de atingir: `7 − valor`. Com o
   * teto aí, o joker acumula-se e elimina como qualquer outro grupo — não há
   * botão de confirmação, não é preciso mostrar o valor, e **não há maneira de o
   * gastar mal**.
   *
   * A versão anterior punha o teto em 6, que é o que o motor aceita, e por isso
   * a seleção ficava válida logo à primeira peça encostada ao joker.
   */
  /*
   * O joker é a única peça cujo valor o jogador escolhe (`[M 2.6]`), e é dessa
   * escolha que vem a dificuldade das bandas com joker: **só um valor esvazia o
   * tabuleiro, e o jogo deixa escolher qualquer um**. Escolher mal não bloqueia
   * na hora — o tabuleiro fica insolúvel em silêncio e só falha no fim.
   *
   * Escolher no momento do toque é o que dispensa um botão de confirmação: com o
   * valor fixado, a seleção volta a ter alvo exato e elimina sozinha.
   */
  describe("o joker", () => {
    // fixas 2 + 2 = 4; com o joker a 3, o total fecha em 7.
    const JOKER_BOARD: Board = [[0, 2], [2]];

    it("não entra na seleção sem valor escolhido", () => {
      const s = tap(startGame(level(JOKER_BOARD)), packed(0, 0));

      expect(s.selection).toEqual([]);
      expect(s.rejection).toBe("joker-needs-value");
    });

    it("com valor escolhido, conta como uma peça normal", () => {
      const s = tap(startGame(level(JOKER_BOARD)), packed(0, 0), 3);

      expect(s.selection).toHaveLength(1);
      expect(s.jokerAs).toBe(3);
      expect(selectionTotal(s)).toBe(3);
      expect(remainingToTarget(s)).toBe(4);
    });

    it("elimina sozinho ao chegar a 7, sem confirmação", () => {
      let s = startGame(level(JOKER_BOARD));

      s = tap(s, packed(0, 0), 3);
      s = tap(s, packed(0, 1)); // +2
      expect(s.moves).toBe(0);

      s = tap(s, packed(1, 0)); // +2 → 3+2+2 = 7

      expect(s.moves).toBe(1);
      expect(isFinished(s)).toBe(true);
    });

    /*
     * A propriedade que sustenta a dificuldade: **o valor errado é jogável**. Se
     * o jogo o recusasse, a banda `denso` passava de 14% de sobrevivência para
     * 96% — medido — e deixava de haver decisão nenhuma.
     */
    it("deixa escolher o valor errado, e a jogada acontece", () => {
      let s = startGame(level(JOKER_BOARD));

      s = tap(s, packed(0, 0), 5); // devia ser 3
      s = tap(s, packed(0, 1)); // +2 → 5+2 = 7

      expect(s.moves).toBe(1);
      // O tabuleiro esvaziou-se cedo de mais: sobra um 2 sem parceiro possível.
      expect(isFinished(s)).toBe(false);
    });

    it("tocar outra vez no joker troca o valor sem desfazer a seleção", () => {
      let s = startGame(level(JOKER_BOARD));

      s = tap(s, packed(0, 0), 5);
      s = tap(s, packed(0, 0), 3);

      expect(s.selection).toHaveLength(1);
      expect(s.jokerAs).toBe(3);
    });

    it("recusa a peça que passaria de 7", () => {
      let s = startGame(level([[0, 5], [6]] as Board));

      s = tap(s, packed(0, 0), 6);
      s = tap(s, packed(0, 1)); // +5 → 11

      expect(s.selection).toHaveLength(1);
      expect(s.rejection).toBe("over-target");
    });

    it("o valor escolhido não sobrevive à jogada nem ao desfazer", () => {
      let s = startGame(level(JOKER_BOARD));

      s = tap(s, packed(0, 0), 3);
      expect(s.jokerAs).toBe(3);

      s = undo(s);
      expect(s.jokerAs).toBeUndefined();
      expect(s.selection).toEqual([]);
    });

    it("limpar a seleção também limpa o valor", () => {
      let s = tap(startGame(level(JOKER_BOARD)), packed(0, 0), 4);
      s = clearSelection(s);

      expect(s.jokerAs).toBeUndefined();
    });
  });

  it("o undo restaura o tabuleiro exato", () => {
    let s = startGame(level(BOARD));
    const antes = boardKey(s.board);

    s = tap(s, packed(0, 0));
    s = tap(s, packed(0, 1));
    s = tap(s, packed(1, 0));
    expect(isFinished(s)).toBe(true);

    s = undo(s);

    expect(boardKey(s.board)).toBe(antes);
    expect(s.moves).toBe(0);
    expect(s.undos).toBe(1);
  });

  it("o undo tira primeiro a peça tocada, e só depois a jogada", () => {
    let s = startGame(level(BOARD));

    s = tap(s, packed(0, 0));
    s = undo(s);

    expect(s.selection).toEqual([]);
    expect(s.undos).toBe(0); // desfazer uma seleção não é desfazer uma jogada
  });

  it("o undo é ilimitado — é só uma pilha de tabuleiros imutáveis", () => {
    const b: Board = [
      [1, 2],
      [4],
      [3, 4],
    ];
    let s = startGame(level(b));

    s = tap(s, packed(0, 0));
    s = tap(s, packed(0, 1));
    s = tap(s, packed(1, 0));
    expect(s.moves).toBe(1);

    const chaves = [boardKey(s.board)];
    s = undo(s);
    s = undo(s);

    expect(s.undos).toBe(1); // só havia uma jogada por desfazer
    expect(chaves).toHaveLength(1);
  });

  it("reiniciar volta ao tabuleiro inicial e conta-se", () => {
    let s = startGame(level(BOARD));

    s = tap(s, packed(0, 0));
    s = tap(s, packed(0, 1));
    s = tap(s, packed(1, 0));
    s = restart(s);

    expect(boardKey(s.board)).toBe(boardKey(BOARD));
    expect(s.moves).toBe(0);
    expect(s.restarts).toBe(1);
    expect(s.selection).toEqual([]);
  });

  it("limpar a seleção não mexe no tabuleiro", () => {
    let s = startGame(level(BOARD));
    s = tap(s, packed(0, 0));
    s = clearSelection(s);

    expect(s.selection).toEqual([]);
    expect(boardKey(s.board)).toBe(boardKey(BOARD));
  });

  describe("dicas", () => {
    it("vêm da solução guardada enquanto o jogador a segue", () => {
      const r = hint(startGame(level(BOARD, [L_GROUP])));

      expect(r.source).toBe("stored");
      expect(r.group).toEqual(L_GROUP);
      expect(r.state.hints).toBe(1);
    });

    /*
     * O ponto fino: um grupo guardado pode continuar a ser válido num tabuleiro
     * a que o jogador chegou por outro caminho. Aí a solução guardada já não
     * serve, e a dica tem de ser recalculada — senão manda-o para um caminho
     * que deixou de existir.
     */
    it("são recalculadas quando o jogador saiu do caminho guardado", () => {
      const b: Board = [
        [1, 2],
        [4],
        [3, 4],
      ];
      // A solução guardada começa pelo grupo da direita; o jogador joga o da
      // esquerda, que é igualmente válido.
      const guardada: Group[] = [
        [packed(2, 0), packed(2, 1)] as Group,
        L_GROUP,
      ];

      let s = startGame(level(b, guardada));
      s = tap(s, packed(0, 0));
      s = tap(s, packed(0, 1));
      s = tap(s, packed(1, 0));

      expect(s.moves).toBe(1);
      expect(hint(s).source).toBe("computed");
    });

    it("num tabuleiro limpo não há dica nem custo", () => {
      let s = startGame(level(BOARD));
      s = tap(s, packed(0, 0));
      s = tap(s, packed(0, 1));
      s = tap(s, packed(1, 0));

      const r = hint(s);
      expect(r.source).toBe("none");
      expect(r.state.hints).toBe(0);
    });
  });
});

describe("PuzzleSession — selos (plano §6.2)", () => {
  const limpar = (s: ReturnType<typeof startPuzzle>) => {
    let g = s.game;
    g = tap(g, packed(0, 0));
    g = tap(g, packed(0, 1));
    g = tap(g, packed(1, 0));
    return { ...s, game: g };
  };

  it("não há selo enquanto o tabuleiro não estiver limpo", () => {
    expect(seal(startPuzzle(level(BOARD)))).toBeUndefined();
  });

  it("perfeito: sem undo, sem reinício, sem dicas", () => {
    expect(seal(limpar(startPuzzle(level(BOARD))))).toBe("perfect");
  });

  it("o perfeito perde-se à primeira dica, e fica limpo", () => {
    let s = startPuzzle(level(BOARD, [L_GROUP]));
    s = usePuzzleHint(s).state;
    s = limpar(s);

    expect(seal(s)).toBe("clean");
  });

  it("o limpo perde-se ao primeiro undo", () => {
    let s = startPuzzle(level(BOARD));
    s = limpar(s);
    s = undoPuzzle(s);
    s = limpar(s);

    expect(seal(s)).toBe("completed");
  });

  it("o limpo perde-se ao primeiro reinício", () => {
    let s = startPuzzle(level(BOARD));
    s = restartPuzzle(s);
    s = limpar(s);

    expect(seal(s)).toBe("completed");
  });

  it("as dicas esgotam-se, e o undo não", () => {
    let s = startPuzzle(level(BOARD, [L_GROUP]), { hintsPerLevel: 1 });

    s = usePuzzleHint(s).state;
    expect(s.hintsLeft).toBe(0);

    const esgotada = usePuzzleHint(s);
    expect(esgotada.result).toBeUndefined();
    expect(esgotada.state.game.hints).toBe(1); // não contou a que não deu

    // O undo continua disponível, sempre.
    s = { ...s, game: tap(s.game, packed(0, 0)) };
    expect(undoPuzzle(s).game.selection).toEqual([]);
  });

  it("reiniciar devolve as dicas", () => {
    let s = startPuzzle(level(BOARD, [L_GROUP]), { hintsPerLevel: 2 });
    s = usePuzzleHint(s).state;
    expect(s.hintsLeft).toBe(1);

    s = restartPuzzle(s, { hintsPerLevel: 2 });
    expect(s.hintsLeft).toBe(2);
  });
});

describe("combos (spec §4.3)", () => {
  it("a primeira jogada nunca encadeia", () => {
    const e = registerMove(startCombo(), 2, 1000);

    expect(e.chained).toBe(false);
    expect(e.state.count).toBe(1);
  });

  it("encadeia dentro da janela e quebra fora dela", () => {
    let c = startCombo();

    c = registerMove(c, 2, 1000).state;
    const dentro = registerMove(c, 2, 2000, {
      windowMs: 2500,
      bigGroupSize: 5,
    });
    expect(dentro.chained).toBe(true);
    expect(dentro.state.count).toBe(2);

    const fora = registerMove(c, 2, 9000, { windowMs: 2500, bigGroupSize: 5 });
    expect(fora.chained).toBe(false);
    expect(fora.state.count).toBe(1);
  });

  it("guarda o melhor encadeamento da sessão", () => {
    let c = startCombo();
    c = registerMove(c, 2, 0).state;
    c = registerMove(c, 2, 500).state;
    c = registerMove(c, 2, 1000).state;
    expect(c.best).toBe(3);

    c = registerMove(c, 2, 99_000).state;
    expect(c.count).toBe(1);
    expect(c.best).toBe(3);
  });

  it("marca os grupos grandes", () => {
    expect(registerMove(startCombo(), 5, 0).big).toBe(true);
    expect(registerMove(startCombo(), 4, 0).big).toBe(false);
  });

  it("quebrar o combo impede que o intervalo seguinte encadeie", () => {
    let c = registerMove(startCombo(), 2, 1000).state;
    c = breakCombo(c);

    expect(registerMove(c, 2, 1100).chained).toBe(false);
  });
});

describe("pontuação", () => {
  it("um grupo grande vale mais do que as peças soltas equivalentes", () => {
    // Um grupo de 4 contra dois pares: a mesma contagem de peças.
    expect(moveScore(4, 1)).toBeGreaterThan(2 * moveScore(2, 1));
  });

  it("o combo multiplica, e tem teto", () => {
    expect(comboMultiplier(1)).toBe(1);
    expect(comboMultiplier(3)).toBeGreaterThan(comboMultiplier(2));
    expect(comboMultiplier(999)).toBe(3);
  });

  it("um grupo vazio não pontua", () => {
    expect(moveScore(0, 5)).toBe(0);
  });
});

describe("TimeAttackSession (plano §6.3)", () => {
  it("o relógio é injetado — a mesma entrada dá sempre o mesmo estado", () => {
    const a = startTimeAttack(level(BOARD), 1_000);
    const b = startTimeAttack(level(BOARD), 1_000);

    expect(a).toEqual(b);
    expect(a.deadlineAt).toBe(1_000 + DEFAULT_TIME_ATTACK.initialMs);
  });

  it("o tempo que resta é o prazo menos agora, e nunca é negativo", () => {
    const s = startTimeAttack(level(BOARD), 0);

    expect(remainingMs(s, 0)).toBe(DEFAULT_TIME_ATTACK.initialMs);
    expect(remainingMs(s, 999_999)).toBe(0);
    expect(isOver(s, 999_999)).toBe(true);
  });

  it("recusa níveis com joker, por desenho", () => {
    expect(() => startTimeAttack(level([[0, 2], [2]]), 0)).toThrow(
      JokerInTimeAttackError,
    );
  });

  it("limpar o tabuleiro adiciona tempo ao relógio", () => {
    let s = startTimeAttack(level(BOARD), 0);
    const prazo = s.deadlineAt;

    s = tapTimeAttack(s, packed(0, 0), 0).state;
    s = tapTimeAttack(s, packed(0, 1), 10).state;
    const r = tapTimeAttack(s, packed(1, 0), 20);

    expect(r.cleared).toBe(true);
    expect(r.state.boardsCleared).toBe(1);
    expect(r.state.deadlineAt).toBeGreaterThan(prazo);
  });

  it("o prémio por tabuleiro decresce, e tem piso", () => {
    expect(boardReward(0)).toBeGreaterThan(boardReward(1));
    expect(boardReward(999)).toBe(DEFAULT_TIME_ATTACK.minPerBoardMs);
  });

  it("depois do fim do tempo, nada mais conta", () => {
    const s = startTimeAttack(level(BOARD), 0);
    const tarde = s.deadlineAt + 1;

    const r = tapTimeAttack(s, packed(0, 0), tarde);
    expect(r.moved).toBe(false);
    expect(r.state).toBe(s);
  });

  it("o combo não atravessa tabuleiros", () => {
    let s = startTimeAttack(level(BOARD), 0);
    s = tapTimeAttack(s, packed(0, 0), 0).state;
    s = tapTimeAttack(s, packed(0, 1), 10).state;
    s = tapTimeAttack(s, packed(1, 0), 20).state;

    s = nextBoard(s, level(BOARD));
    expect(s.combo.count).toBe(0);
    expect(s.combo.lastMoveAt).toBeUndefined();
  });

  it("a pontuação e o relógio sobrevivem à mudança de tabuleiro", () => {
    let s = startTimeAttack(level(BOARD), 0);
    s = tapTimeAttack(s, packed(0, 0), 0).state;
    s = tapTimeAttack(s, packed(0, 1), 10).state;
    s = tapTimeAttack(s, packed(1, 0), 20).state;

    const pontos = s.score;
    const prazo = s.deadlineAt;

    s = nextBoard(s, level(BOARD));
    expect(s.score).toBe(pontos);
    expect(s.deadlineAt).toBe(prazo);
  });
});

describe("progresso", () => {
  it("um perfil novo vai e volta do armazenamento", () => {
    const storage = memoryStorage();
    const p = recordLevel(emptyProfile(), "meio-000015", "clean", 10);

    save(storage, p);
    expect(load(storage)).toEqual(p);
  });

  it("sem nada gravado, dá perfil vazio", () => {
    expect(load(memoryStorage())).toEqual(emptyProfile());
  });

  it("o selo nunca regride", () => {
    let p = recordLevel(emptyProfile(), "x", "perfect", 8);
    p = recordLevel(p, "x", "completed", 12);

    expect(p.levels["x"]?.seal).toBe("perfect");
    expect(p.levels["x"]?.bestMoves).toBe(8);
  });

  it("um selo melhor substitui o anterior", () => {
    let p = recordLevel(emptyProfile(), "x", "completed", 12);
    p = recordLevel(p, "x", "perfect", 12);

    expect(p.levels["x"]?.seal).toBe("perfect");
  });

  it("guarda os melhores do modo tempo", () => {
    let p = recordTimeAttack(emptyProfile(), 5000, 7);
    p = recordTimeAttack(p, 3000, 9);

    expect(p.bestTimeAttackScore).toBe(5000);
    expect(p.bestBoardsCleared).toBe(9);
  });

  /*
   * Um perfil corrompido chega do disco de um telefone com naturalidade. Perder
   * progresso é mau; não abrir o jogo é pior.
   */
  describe("resiste a lixo no armazenamento", () => {
    const comRaw = (raw: string): ProfileStorage => ({
      getItem: () => raw,
      setItem: () => undefined,
    });

    it("JSON inválido", () => {
      expect(load(comRaw("{isto não é json"))).toEqual(emptyProfile());
    });

    it("JSON válido que não é objeto", () => {
      expect(load(comRaw("42"))).toEqual(emptyProfile());
    });

    it("versão desconhecida", () => {
      expect(load(comRaw(JSON.stringify({ version: 99 })))).toEqual(
        emptyProfile(),
      );
    });

    it("níveis com campos de outro tipo são descartados um a um", () => {
      const raw = JSON.stringify({
        version: PROFILE_VERSION,
        levels: {
          bom: { seal: "clean", bestMoves: 4 },
          mau: { seal: "inventado", bestMoves: 4 },
          pior: "isto devia ser um objeto",
        },
        bestTimeAttackScore: "não é número",
        bestBoardsCleared: 3,
      });

      const p = load(comRaw(raw));

      expect(Object.keys(p.levels)).toEqual(["bom"]);
      expect(p.bestTimeAttackScore).toBe(0);
      expect(p.bestBoardsCleared).toBe(3);
    });
  });

  it("a chave é estável — mudá-la apaga o progresso de toda a gente", () => {
    expect(PROFILE_KEY).toBe("septet.profile");
  });
});
