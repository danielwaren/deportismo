import type { ContextFactors } from './types';

// -----------------------------------------------------------------------------
// Ajuste contextual — el "ojo del trader". FASE 3: implementación completa.
//
// Cada factor se normaliza a ~[-1, 1] (positivo favorece al LOCAL) y luego se
// combinan con pesos relativos. Notas de diseño que guiarán la Fase 3:
//   * Lesiones: ponderar por importance_proxy del jugador (minutos + G+A), no por
//     simple conteo de bajas.
//   * Forma: últimos N partidos ponderando la fuerza del rival (Elo del rival).
//   * H2H: incluir pero con peso BAJO (no sobreponderar el historial directo).
//   * Descanso/viaje: días desde el último partido; penalización por viaje/altitud.
//   * Presión: etapa del torneo (eliminación directa vs grupo resuelto vs amistoso).
// -----------------------------------------------------------------------------

/** Pesos relativos internos del ajuste contextual (se exponen para tuneo). */
export const CONTEXT_WEIGHTS = {
  injuries: 0.30,
  form: 0.30,
  rest: 0.10,
  h2h: 0.10, // deliberadamente bajo
  pressure: 0.20,
} as const;

/**
 * Combina los factores contextuales en un único modificador escalar en ~[-1, 1]
 * (positivo = favorece al local). FASE 3 conecta esto al ensemble desplazando
 * las lambdas de Poisson y/o la expectativa Elo.
 */
export function contextModifier(_f: ContextFactors): number {
  throw new Error('contextModifier: pendiente de Fase 3 (módulo del modelo).');
}
