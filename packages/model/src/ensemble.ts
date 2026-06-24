import type { EnsembleWeights, Outcome1x2 } from './types';

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
  const { mu = 2.6, gamma = 1.0, homeAdvantage = 0 } = opts;
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

// FASE 3: combineEnsemble() unirá Poisson/DC + Elo + ajuste contextual usando
// estos pesos y devolverá la PoissonOutput final + las probabilidades 1X2
// mezcladas, listas para persistir en match_model_outputs.
