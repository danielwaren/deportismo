import type {
  DixonColesParams,
  EloParams,
  EnsembleWeights,
  Outcome1x2,
  PoissonOutput,
} from './types';
import { buildScoreMatrix, DEFAULT_DC } from './poisson';
import { DEFAULT_ELO, eloToOneXtwo } from './elo';

export const DEFAULT_WEIGHTS: EnsembleWeights = {
  // Poisson/Dixon-Coles lleva el mayor peso: modela directamente la generación de
  // goles, de donde salen TODOS los mercados (no solo 1X2). Elo aporta una visión
  // de fuerza relativa robusta y de baja varianza. El contexto es el ajuste fino.
  // Estos pesos son un PUNTO DE PARTIDA y deben recalibrarse con Brier/log-loss
  // reales (ensemble_config en BD permite editarlos sin tocar código).
  poisson: 0.5,
  elo: 0.3,
  context: 0.2,
};

/** Normaliza pesos para que sumen 1. */
export function normalizeWeights(w: EnsembleWeights): EnsembleWeights {
  const s = w.poisson + w.elo + w.context;
  return s > 0 ? { poisson: w.poisson / s, elo: w.elo / s, context: w.context / s } : w;
}

/**
 * Mapeo Elo -> goles esperados (lambda) para alimentar Poisson/Dixon-Coles cuando
 * NO hay suficientes goles históricos por equipo (caso típico de selecciones, sin
 * una "media de liga" limpia). Definición:
 *   d = (eloHome + homeAdvantage - eloAway) / 400
 *   lambdaHome = (mu/2) * e^( gamma * d )
 *   lambdaAway = (mu/2) * e^(-gamma * d )
 * Con d = 0 ambos valen mu/2 (mu = total de goles esperado). gamma controla cuánto
 * traduce la ventaja Elo en supremacía de goles. Es un mapeo PRELIMINAR: la Fase 3
 * lo sustituye por fuerzas ataque/defensa ajustadas a goles reales por competición.
 */
export function eloToLambdas(
  eloHome: number,
  eloAway: number,
  opts: { mu?: number; gamma?: number; homeAdvantage?: number } = {},
): { lambdaHome: number; lambdaAway: number } {
  // mu = 2.78 calibrado: media de goles real en 113 partidos 2022-2025.
  const { mu = 2.78, gamma = 1.0, homeAdvantage = 0 } = opts;
  const d = (eloHome + homeAdvantage - eloAway) / 400;
  return {
    lambdaHome: (mu / 2) * Math.exp(gamma * d),
    lambdaAway: (mu / 2) * Math.exp(-gamma * d),
  };
}

/** Mezcla lineal de dos distribuciones 1X2 (renormalizada). Pura y testeable. */
export function blend1x2(a: Outcome1x2, b: Outcome1x2, wA: number): Outcome1x2 {
  const wB = 1 - wA;
  const home = a.home * wA + b.home * wB;
  const draw = a.draw * wA + b.draw * wB;
  const away = a.away * wA + b.away * wB;
  const z = home + draw + away;
  return { home: home / z, draw: draw / z, away: away / z };
}

export interface CombineInput {
  eloHome: number;
  eloAway: number;
  weights?: EnsembleWeights;
  eloParams?: EloParams;
  dcParams?: DixonColesParams;
  homeAdvantage?: number;
  mu?: number; // total de goles esperado base
  gamma?: number; // elasticidad Elo->goles
  /** Modificador contextual en [-1, 1] (de contextModifier). 0 = sin contexto. */
  context?: number;
  /**
   * λ ya calculadas por la ruta PRINCIPISTA (computeLambdas: ataque×defensa×…).
   * Si se proporcionan, sustituyen a la derivación "solo Elo" (eloToLambdas), que
   * queda como fallback de cold-start. Es OPCIONAL para no romper llamadas previas.
   */
  lambdas?: { lambdaHome: number; lambdaAway: number };
}

export interface EnsembleResult {
  lambdaHome: number;
  lambdaAway: number;
  poisson: PoissonOutput; // todos los mercados (OU/BTTS/matriz) tras el contexto
  elo: Outcome1x2;
  final: Outcome1x2; // 1X2 mezclado Poisson+Elo
  weights: EnsembleWeights; // snapshot normalizado
  contextApplied: number;
}

/**
 * Ensamblado final de los tres componentes.
 *
 * Decisión de diseño (documentada):
 *   - Las lambdas base salen del Elo (eloToLambdas): en selecciones no hay media
 *     de liga; en clubes la Fase futura las afinará con ataque/defensa reales.
 *   - El CONTEXTO no es una distribución aparte sino un MODIFICADOR: desplaza la
 *     supremacía de goles. context_weight controla la magnitud del desplazamiento
 *     (lambdaHome *= e^{w·m}, lambdaAway /= e^{w·m}). Así los tres pesos del
 *     ensemble tienen significado: Poisson/Elo mezclan los dos motores, y el peso
 *     de contexto gradúa cuánto mueve el "ojo del trader".
 *   - El 1X2 FINAL mezcla Poisson y Elo según sus pesos relativos; los mercados
 *     OU/BTTS/marcador salen del Poisson ya ajustado (Elo no los produce).
 */
export function combineEnsemble(input: CombineInput): EnsembleResult {
  const weights = normalizeWeights(input.weights ?? DEFAULT_WEIGHTS);
  const eloParams = input.eloParams ?? DEFAULT_ELO;
  const homeAdvantage = input.homeAdvantage ?? 0;
  const ctx = Math.max(-1, Math.min(1, input.context ?? 0));

  // Ruta principista (ataque×defensa×contexto) si se pasan lambdas; si no,
  // fallback de cold-start derivando las lambdas del Elo global.
  let { lambdaHome, lambdaAway } =
    input.lambdas ??
    eloToLambdas(input.eloHome, input.eloAway, {
      mu: input.mu,
      gamma: input.gamma,
      homeAdvantage,
    });

  const shift = Math.exp(weights.context * ctx);
  lambdaHome *= shift;
  lambdaAway /= shift;

  const poisson = buildScoreMatrix(lambdaHome, lambdaAway, input.dcParams ?? DEFAULT_DC);
  const elo = eloToOneXtwo(input.eloHome, input.eloAway, { ...eloParams, homeAdvantage });

  const wPoisson = weights.poisson / (weights.poisson + weights.elo);
  const final = blend1x2(poisson.oneXtwo, elo, wPoisson);

  return { lambdaHome, lambdaAway, poisson, elo, final, weights, contextApplied: ctx };
}
