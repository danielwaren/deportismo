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
