import type { ContextFactors } from './types';

// -----------------------------------------------------------------------------
// Ajuste contextual — el "ojo del trader".
//
// Cada subfactor se normaliza a [-1, 1] (POSITIVO = favorece al LOCAL) y se
// combinan con pesos relativos que suman 1. El escalar resultante lo usa el
// ensemble para desplazar la supremacía de goles (ver combineEnsemble).
// -----------------------------------------------------------------------------

/** Pesos relativos internos (suman 1). Expuestos para tuneo. */
export const CONTEXT_WEIGHTS = {
  injuries: 0.3,
  form: 0.3,
  rest: 0.1,
  h2h: 0.1, // deliberadamente bajo: el H2H no se sobreponderar
  pressure: 0.2,
} as const;

const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));

/**
 * Severidad de bajas de un equipo en [0, 1]. Se pondera por la IMPORTANCIA del
 * jugador (importance_proxy ~ minutos + G+A normalizados), no por conteo simple:
 * perder a un titular indiscutible pesa mucho más que a un suplente.
 */
export function injurySeverity(unavailableImportance: number[]): number {
  const total = unavailableImportance.reduce((s, v) => s + Math.max(0, v), 0);
  return clamp(total, 0, 1);
}

export interface FormMatch {
  result: 'W' | 'D' | 'L';
  opponentElo: number;
  teamElo: number;
  ageInMatches: number; // 0 = el más reciente
}

/**
 * Puntuación de forma en [-1, 1]. Pondera por:
 *   - recencia (decaimiento exponencial),
 *   - fuerza del rival (ganar a un equipo más fuerte vale más que a uno débil).
 * Resultado: +1 racha perfecta vs rivales duros, -1 lo contrario.
 */
export function formScore(matches: FormMatch[], halflife = 5): number {
  if (matches.length === 0) return 0;
  const lambda = Math.LN2 / halflife;
  let num = 0;
  let den = 0;
  for (const m of matches) {
    const points = m.result === 'W' ? 1 : m.result === 'D' ? 0 : -1; // base [-1,1]
    const recency = Math.exp(-lambda * m.ageInMatches);
    // La fuerza del rival entra en el VALOR del partido (no como peso, donde se
    // cancelaría): ganar a un rival fuerte (strength>1) puntúa por encima de 1
    // y se satura al clamp; ganar a uno débil puntúa menos. Rango ~[0.5, 1.5].
    const strength = clamp(1 + (m.opponentElo - m.teamElo) / 400, 0.5, 1.5);
    num += recency * points * strength;
    den += recency;
  }
  return clamp(den > 0 ? num / den : 0);
}

/** Ventaja de descanso en [-1, 1] (positivo = el local tuvo más descanso). */
export function restAdvantage(daysHome: number, daysAway: number): number {
  return clamp(Math.tanh((daysHome - daysAway) / 4));
}

/**
 * Señal H2H en [-1, 1] desde la perspectiva del local. `results` = últimos
 * enfrentamientos directos ('home' gana local, 'away' gana visita, 'draw').
 */
export function h2hScore(results: Array<'home' | 'away' | 'draw'>): number {
  if (results.length === 0) return 0;
  const pts = results.map((r) => (r === 'home' ? 1 : r === 'away' ? -1 : 0));
  return clamp(pts.reduce((s, v) => s + v, 0) / results.length);
}

/**
 * Combina los factores en un único modificador escalar en [-1, 1].
 * injuriesAway - injuriesHome: que el rival tenga bajas favorece al local.
 */
export function contextModifier(f: ContextFactors): number {
  const m =
    CONTEXT_WEIGHTS.injuries * clamp(f.injuriesAway - f.injuriesHome) +
    CONTEXT_WEIGHTS.form * clamp((f.formHome - f.formAway) / 2) +
    CONTEXT_WEIGHTS.rest * clamp(f.restAdvantage) +
    CONTEXT_WEIGHTS.h2h * clamp(f.h2h) +
    CONTEXT_WEIGHTS.pressure * clamp(f.pressure);
  return clamp(m);
}
