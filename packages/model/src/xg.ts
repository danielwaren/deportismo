// -----------------------------------------------------------------------------
// EXPECTED GOALS (xG) — Fase 2, punto #3.
//
// El modelo DEBE funcionar sin xG, pero usarlo cuando esté disponible. El xG es
// una señal de calidad de juego menos ruidosa que los goles: dos equipos pueden
// marcar lo mismo pero generar ocasiones muy distintas.
//
// Estrategia: el xG produce sus propias FUERZAS de ataque/defensa (vs media de
// liga) y se MEZCLA con la fuerza base (derivada del Elo ofensivo/defensivo)
// ponderando por FIABILIDAD (más partidos con dato xG => más peso). Sin xG, la
// fiabilidad es 0 y la fuerza base queda intacta. Todo puro y explicado.
// -----------------------------------------------------------------------------

import { type Explanation, emptyExplanation, addFactor, multFactor } from './explain';

const clampStrength = (x: number) => Math.max(0.4, Math.min(2.5, x));

/** Datos xG agregados de un equipo en una ventana reciente. Todo opcional salvo matches. */
export interface XgAggregate {
  matches: number; // nº de partidos con dato xG
  xgForPerGame: number; // xG generado por partido
  xgAgainstPerGame: number; // xG concedido por partido (xGA)
  bigChancesPerGame?: number; // ocasiones claras por partido
  shotQuality?: number; // xG medio por tiro (~0.08-0.15); >0.12 = buenas ocasiones
}

/**
 * Fiabilidad del xG en [0,1]: crece con el nº de partidos y satura en `full`
 * (por defecto 6 ≈ ventana de forma). Con 0 partidos no aporta nada.
 */
export function xgReliability(matches: number, full = 6): number {
  return Math.max(0, Math.min(1, matches / full));
}

/** Fuerza ofensiva multiplicativa desde xG (1.0 = media de liga). */
export function xgAttackStrength(xgForPerGame: number, leagueAvgGoals: number): number {
  return leagueAvgGoals > 0 ? clampStrength(xgForPerGame / leagueAvgGoals) : 1;
}

/** Fuerza defensiva multiplicativa desde xGA: conceder poco xG => <1 (rival marca menos). */
export function xgDefenseStrength(xgAgainstPerGame: number, leagueAvgGoals: number): number {
  return leagueAvgGoals > 0 ? clampStrength(xgAgainstPerGame / leagueAvgGoals) : 1;
}

/**
 * Mezcla una fuerza base con su versión xG, ponderada por fiabilidad:
 *   resultado = base^(1-w) · xg^w   (mezcla geométrica, conserva el "1.0 neutro")
 */
export function blendStrength(base: number, xg: number, reliability: number): number {
  const w = Math.max(0, Math.min(1, reliability));
  return Math.exp((1 - w) * Math.log(base) + w * Math.log(xg));
}

export interface XgStrengthResult {
  attack: number;
  defense: number;
  explanation: Explanation;
}

/**
 * Calcula las fuerzas ataque/defensa AJUSTADAS por xG a partir de la fuerza base
 * (la del Elo ofensivo/defensivo) y el agregado xG. Si `agg` es undefined o sin
 * partidos, devuelve la base sin tocar (graceful).
 */
export function xgAdjustedStrengths(
  baseAttack: number,
  baseDefense: number,
  leagueAvgGoals: number,
  agg?: XgAggregate,
): XgStrengthResult {
  const expl = emptyExplanation();
  if (!agg || agg.matches <= 0) {
    return { attack: baseAttack, defense: baseDefense, explanation: expl };
  }
  const rel = xgReliability(agg.matches);
  const xgAtk = xgAttackStrength(agg.xgForPerGame, leagueAvgGoals);
  const xgDef = xgDefenseStrength(agg.xgAgainstPerGame, leagueAvgGoals);

  let attack = blendStrength(baseAttack, xgAtk, rel);
  const defense = blendStrength(baseDefense, xgDef, rel);

  // Calidad de tiro: ocasiones muy buenas (>0.12 xG/tiro) dan un empujón leve.
  if (agg.shotQuality && agg.shotQuality > 0.12) {
    const boost = 1 + Math.min(0.08, (agg.shotQuality - 0.12) * 0.6);
    attack *= boost;
    addFactor(expl, multFactor('shot_quality', 'Calidad de tiro', boost, 1));
  }

  addFactor(expl, multFactor('xg_attack', 'Ataque (xG)', attack / baseAttack, 1));
  addFactor(expl, multFactor('xg_defense', 'Defensa rival (xG)', defense / baseDefense, 1));
  expl.summary = `xG fiabilidad ${(rel * 100).toFixed(0)}%`;

  return { attack: clampStrength(attack), defense: clampStrength(defense), explanation: expl };
}
