/**
 * Preferências do jogador.
 *
 * **Guardadas à parte do perfil, e de propósito.** O perfil é progresso — selos,
 * melhores jogadas, recordes — e "apagar o progresso" tem de o apagar inteiro
 * sem levar as preferências à frente. Quem repõe os selos não está a pedir para
 * o jogo voltar ao tema claro.
 *
 * Como em `progress.ts`, o armazenamento entra por interface e a leitura **nunca
 * falha**: um ficheiro corrompido dá preferências por omissão, não um jogo que
 * não abre.
 *
 * O desenho §5.8 prevê mais entradas — som, dígitos nas peças, animações
 * reduzidas. A forma deste módulo é a de crescer por campos, não por reescrita.
 */

import type { ProfileStorage } from "./progress";

export const SETTINGS_VERSION = 1;
export const SETTINGS_KEY = "septet.settings";

/**
 * `sistema` segue o `prefers-color-scheme` e é a omissão. Os outros dois são o
 * jogador a contrariá-lo — e o CSS já os conhece por `data-tema`.
 */
export type Tema = "sistema" | "claro" | "escuro";

const TEMAS: readonly Tema[] = ["sistema", "claro", "escuro"];

/**
 * Segundos com que o contra-relógio arranca.
 *
 * O plano §6.3 pede um arranque generoso, para o jogador entrar em ritmo antes
 * da pressão — mas quanto é generoso é número de playtest, não de escrivaninha.
 * Fica à escolha em vez de fixo, e o valor por omissão é 60.
 */
export type TempoInicial = 30 | 60 | 90;

const TEMPOS: readonly TempoInicial[] = [30, 60, 90];

export interface Settings {
  readonly version: number;
  readonly tema: Tema;
  readonly tempoInicial: TempoInicial;
}

export const defaultSettings = (): Settings => ({
  version: SETTINGS_VERSION,
  tema: "sistema",
  tempoInicial: 60,
});

export const saveSettings = (
  storage: ProfileStorage,
  settings: Settings,
): void => {
  storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

export function loadSettings(storage: ProfileStorage): Settings {
  const raw = storage.getItem(SETTINGS_KEY);
  if (raw === null) return defaultSettings();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultSettings();
  }

  if (typeof parsed !== "object" || parsed === null) return defaultSettings();

  const s = parsed as Partial<Settings>;
  if (s.version !== SETTINGS_VERSION) return defaultSettings();

  /*
   * Cada campo valida-se sozinho e cai no seu valor por omissão. É o que permite
   * acrescentar preferências **sem subir a versão** — um ficheiro gravado antes
   * de o contra-relógio ser configurável lê-se na mesma, e ninguém perde o tema
   * por causa de um campo novo.
   */
  return {
    version: SETTINGS_VERSION,
    tema: TEMAS.includes(s.tema as Tema) ? (s.tema as Tema) : "sistema",
    tempoInicial: TEMPOS.includes(s.tempoInicial as TempoInicial)
      ? (s.tempoInicial as TempoInicial)
      : 60,
  };
}

/**
 * Põe o tema no documento.
 *
 * `sistema` **retira** o atributo em vez de lhe pôr um valor: é a ausência que
 * devolve o comando ao `prefers-color-scheme` do CSS. Escrever `data-tema="sistema"`
 * daria uma terceira variante que nenhuma regra conhece, e o jogo ficaria no tema
 * claro para toda a gente.
 */
export function aplicarTema(raiz: HTMLElement, tema: Tema): void {
  if (tema === "sistema") {
    delete raiz.dataset["tema"];
    return;
  }

  raiz.dataset["tema"] = tema;
}
