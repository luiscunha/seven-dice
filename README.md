# DiceToSeven

Motor e pipeline do **DiceToSeven** — um puzzle de dados (faces 1–6) onde se eliminam
grupos ortogonalmente ligados que somem exatamente 7, até o tabuleiro ficar
vazio.

A garantia central do projeto é uma só: **nenhum nível publicado é impossível.**
Toda a arquitetura existe para a proteger.

## Arranque

```bash
pnpm install
pnpm check
```

Node ≥ 20, pnpm 11. O `pnpm check` corre lint, typecheck e testes.

## Por onde começar a ler

| | |
|---|---|
| [`documentation/estado-atual.md`](documentation/estado-atual.md) | **Começa aqui.** Onde estamos, o que está por decidir, e o que já foi medido. |
| [`CLAUDE.md`](CLAUDE.md) | As regras invioláveis do motor e os algoritmos que não se improvisam. |
| [`documentation/plano-implementacao.md`](documentation/plano-implementacao.md) | O plano vivo, fase a fase. |
| [`documentation/spec-motor.md`](documentation/spec-motor.md) | Spec do motor (documento de origem). |
| [`documentation/plano-modelo-jogo.md`](documentation/plano-modelo-jogo.md) | Modelo de jogo (documento de origem). |

## Estrutura

```
packages/engine   motor puro — sem Node, sem DOM, sem Math.random(), zero dependências
packages/tools    pipeline offline, gerador de packs e renderer de consola
packages/game     camada de sessão (feita) e UI web (por construir)
```

## Comandos

```bash
pnpm check                                    # lint + typecheck + testes
pnpm dice7 bands                               # as bandas e os seus critérios
pnpm dice7 play --band tutorial --log p.jsonl  # jogar na consola
pnpm dice7 verify                              # revalida o pack de níveis
pnpm dice7 build --count 30 --runs 1000        # reconstrói o pack
```
