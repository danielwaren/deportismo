import type { ContextFactors } from './types';
import { type Explanation, emptyExplanation, addFactor } from './explain';

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

/**
 * Perfil de ponderación temporal de la FORMA INTELIGENTE (#4). El partido más
 * reciente pesa 100%, y el peso decae por jornada. Configurable.
 *   [reciente, -1, -2, -3, -4]  =  [1, 0.85, 0.70, 0.50, 0.30]
 */
export const WEIGHTED_FORM_PROFILE = [1, 0.85, 0.7, 0.5, 0.3] as const;

/**
 * Forma inteligente en [-1, 1]: como formScore pero con pesos temporales
 * EXPLÍCITOS por jornada (no exponencial) y dificultad de rival. `ageInMatches`
 * indexa el perfil (0 = más reciente); partidos más antiguos que el perfil usan
 * su último peso. Ganar al líder vale más que ganar al colista.
 */
export function weightedFormScore(
  matches: FormMatch[],
  profile: readonly number[] = WEIGHTED_FORM_PROFILE,
): number {
  if (matches.length === 0) return 0;
  let num = 0;
  let den = 0;
  for (const m of matches) {
    const idx = Math.min(m.ageInMatches, profile.length - 1);
    const weight = profile[idx]!;
    const points = m.result === 'W' ? 1 : m.result === 'D' ? 0 : -1;
    const strength = clamp(1 + (m.opponentElo - m.teamElo) / 400, 0.5, 1.5);
    num += weight * points * strength;
    den += weight;
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

// =============================================================================
// CONTEXT SCORE DINÁMICO (#5)
//
// Índice contextual ampliado: cada variable se normaliza desde la PERSPECTIVA
// DEL LOCAL (positivo = favorece al local) y se combina con pesos. Devuelve el
// escalar [-1,1] que usa el ensemble Y la lista de contribuciones por variable
// (Explainable AI). Todos los campos son opcionales: lo ausente no afecta.
// =============================================================================

export interface DynamicContext {
  injuriesHome?: number; // [0,1] severidad de bajas por lesión
  injuriesAway?: number;
  suspensionsHome?: number; // [0,1] sanciones
  suspensionsAway?: number;
  rotationHome?: number; // [0,1] probabilidad de rotación (resta frescura de titulares)
  rotationAway?: number;
  travelHome?: number; // [0,1] fatiga de viaje (0 = sin viaje)
  travelAway?: number;
  altitudeAdvantage?: number; // [-1,1] >0 si la altitud favorece al local
  weather?: number; // [-1,1] impacto del clima a favor del local
  restAdvantage?: number; // [-1,1] del local (de restAdvantage())
  competitionImportance?: number; // [0,1] peso de la competición
  importance?: number; // [0,1] importancia/etapa del partido
  motivationHome?: number; // [0,1] motivación (objetivos en juego)
  motivationAway?: number;
}

/** Pesos relativos de cada variable del context score (suman ~1). Tuneables. */
export const DYNAMIC_CONTEXT_WEIGHTS = {
  injuries: 0.22,
  suspensions: 0.12,
  rotation: 0.1,
  travel: 0.08,
  altitude: 0.1,
  weather: 0.06,
  rest: 0.1,
  competition: 0.04,
  motivation: 0.18,
} as const;

export interface DynamicContextResult {
  score: number; // [-1,1] a favor del local
  explanation: Explanation;
}

const v = (x?: number) => x ?? 0;

/**
 * Calcula el índice contextual dinámico y explica cada variable. Las variables
 * "por equipo" entran como DIFERENCIA (rival - local para lo negativo, p.ej.
 * lesiones del rival favorecen al local).
 */
export function dynamicContextScore(c: DynamicContext): DynamicContextResult {
  const W = DYNAMIC_CONTEXT_WEIGHTS;
  const expl = emptyExplanation();
  let score = 0;

  const push = (key: string, label: string, weight: number, signal: number, unit: 'score' = 'score') => {
    const contrib = weight * clamp(signal);
    score += contrib;
    addFactor(expl, {
      key, label, value: clamp(signal), unit,
      impact: contrib, detail: `${contrib >= 0 ? '+' : ''}${(contrib * 100).toFixed(0)}%`,
    });
  };

  // Negativas por equipo: que el RIVAL las sufra favorece al local.
  push('injuries', 'Lesiones', W.injuries, v(c.injuriesAway) - v(c.injuriesHome));
  push('suspensions', 'Suspensiones', W.suspensions, v(c.suspensionsAway) - v(c.suspensionsHome));
  push('rotation', 'Rotaciones', W.rotation, v(c.rotationAway) - v(c.rotationHome));
  push('travel', 'Viaje', W.travel, v(c.travelAway) - v(c.travelHome));
  push('motivation', 'Motivación', W.motivation, v(c.motivationHome) - v(c.motivationAway));
  // Direccionales (ya en perspectiva local).
  push('altitude', 'Altitud', W.altitude, v(c.altitudeAdvantage));
  push('weather', 'Clima', W.weather, v(c.weather));
  push('rest', 'Descanso', W.rest, v(c.restAdvantage));
  // Importancia/competición no tiene lado: amplifica levemente la señal existente
  // (un partido decisivo endurece al favorito). Se modela como factor multiplicativo.
  const importance = clamp((v(c.competitionImportance) * W.competition + v(c.importance) * 0.0) , 0, 1);
  if (importance > 0) {
    score *= 1 + importance;
    addFactor(expl, {
      key: 'importance', label: 'Importancia', value: importance, unit: 'score',
      impact: 0, detail: `×${(1 + importance).toFixed(2)}`,
    });
  }

  score = clamp(score);
  expl.summary = `Contexto ${score >= 0 ? '+' : ''}${(score * 100).toFixed(0)}% (local)`;
  return { score, explanation: expl };
}
