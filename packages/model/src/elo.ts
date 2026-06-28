import type { EloParams } from './types';
import { type Explanation, emptyExplanation, addFactor, fmtSigned } from './explain';

export const DEFAULT_ELO: EloParams = {
  // +65 puntos: punto medio empírico de la ventaja de localía en fútbol de clubes
  // (la literatura sitúa la localía entre +60 y +100; 65 es conservador y se puede
  // recalibrar por liga). Documentado en el README.
  homeAdvantage: 65,
  // k=24: equilibrio entre estabilidad y reactividad; se ESCALA por importancia
  // del partido (amistoso ~0.5 .. clasificatorio/final ~1.5).
  kBase: 24,
};

/**
 * Probabilidad esperada de que A venza a B según la fórmula logística Elo.
 * Es la base "win-or-not"; el empate se modela aparte (ver drawAdjustedElo).
 */
export function expectedScore(eloA: number, eloB: number, homeAdvantage = 0): number {
  return 1 / (1 + Math.pow(10, (eloB - (eloA + homeAdvantage)) / 400));
}

/**
 * Reparte la probabilidad en 1X2 a partir de la expectativa Elo, usando un
 * modelo Bradley-Terry-Davidson simplificado: el empate crece cuando los
 * equipos están parejos. `nu` controla la frecuencia de empates (~0.3 fútbol).
 */
export function eloToOneXtwo(
  eloHome: number,
  eloAway: number,
  params: EloParams = DEFAULT_ELO,
  // nu = 0.60 calibrado: casa la tasa de empate real (~24.8%) observada en 113
  // partidos de selección 2022-2025 (ver scripts/calibrate.ts). El 0.32 inicial
  // sub-pesaba los empates.
  nu = 0.6,
): { home: number; draw: number; away: number } {
  const dh = eloHome + params.homeAdvantage;
  const wHome = Math.pow(10, dh / 400);
  const wAway = Math.pow(10, eloAway / 400);
  const wDraw = nu * Math.sqrt(wHome * wAway);
  const z = wHome + wAway + wDraw;
  return { home: wHome / z, draw: wDraw / z, away: wAway / z };
}

/**
 * Nuevo rating tras un partido. `score` es 1 (gana), 0.5 (empata), 0 (pierde).
 * `importance` escala el k-factor (amistoso 0.5 .. final 1.5).
 */
export function updateElo(
  elo: number,
  expected: number,
  score: 0 | 0.5 | 1,
  params: EloParams = DEFAULT_ELO,
  importance = 1,
): number {
  return elo + params.kBase * importance * (score - expected);
}

// =============================================================================
// ELO MULTI-COMPONENTE (Fase 1)
//
// Un único Elo global no distingue, p.ej., a un equipo que gana fuera pero
// flojea en casa, ni a uno con gran ataque y mala defensa. Separamos el rating
// en cinco vistas que se actualizan tras cada partido:
//   - general:   fuerza global (resultado W/D/L), como hasta ahora.
//   - home/away: rendimiento específico de local / de visitante.
//   - offensive: capacidad de MARCAR (se mide vs los goles esperados).
//   - defensive: capacidad de NO ENCAJAR (sube si concede menos de lo esperado).
// Los componentes ofensivo/defensivo alimentan las lambdas principistas
// (ver lambdas.ts), sustituyendo la derivación "solo Elo".
// =============================================================================

export type EloComponent = 'general' | 'home' | 'away' | 'offensive' | 'defensive';

export interface EloComponents {
  general: number;
  home: number;
  away: number;
  offensive: number;
  defensive: number;
}

/** Componentes iniciales: todos al mismo valor base (cold-start). */
export function defaultComponents(base = 1500): EloComponents {
  return { general: base, home: base, away: base, offensive: base, defensive: base };
}

/** k-factor para los componentes de goles (más suave que el de resultado). */
export const GOAL_ELO = {
  kGoals: 8, // sensibilidad de offensive/defensive a la sorpresa de goles
  gamma: 1.0, // elasticidad Elo->goles esperados
  mu: 2.78, // media de goles por partido (calibrada)
} as const;

/** Goles esperados de A contra B según diferencia ofensiva/defensiva (Elo->goles). */
function expectedGoalsFor(attackElo: number, oppDefenseElo: number, homeAdvantage = 0): number {
  const d = (attackElo + homeAdvantage - oppDefenseElo) / 400;
  return (GOAL_ELO.mu / 2) * Math.exp(GOAL_ELO.gamma * d);
}

export interface EloMatchResult {
  /** ¿el equipo jugó de local? (determina qué componente de venue se actualiza) */
  isHome: boolean;
  goalsFor: number;
  goalsAgainst: number;
  /** componentes del RIVAL antes del partido. */
  opponent: Pick<EloComponents, 'general' | 'offensive' | 'defensive'>;
  importance?: number;
}

/**
 * Actualiza los cinco componentes Elo de un equipo tras un partido y explica
 * cada delta. Funciones puras: no tocan BD (el cron `train_elo` replica esta
 * lógica en SQL).
 */
export function updateEloComponents(
  prev: EloComponents,
  m: EloMatchResult,
  params: EloParams = DEFAULT_ELO,
): { next: EloComponents; explanation: Explanation } {
  const importance = m.importance ?? 1;
  const ha = m.isHome ? params.homeAdvantage : 0;
  const expl = emptyExplanation();

  // --- general (resultado) ---
  const score: 0 | 0.5 | 1 =
    m.goalsFor > m.goalsAgainst ? 1 : m.goalsFor < m.goalsAgainst ? 0 : 0.5;
  const expGeneral = expectedScore(prev.general, m.opponent.general, ha);
  const general = prev.general + params.kBase * importance * (score - expGeneral);
  addFactor(expl, {
    key: 'elo_general',
    label: 'Elo general',
    value: general - prev.general,
    unit: 'elo',
    impact: Math.tanh((general - prev.general) / 30),
    detail: fmtSigned(general - prev.general, 'Elo', 1),
  });

  // --- venue (home/away): solo se actualiza el del lado jugado ---
  const venuePrev = m.isHome ? prev.home : prev.away;
  const venue = venuePrev + params.kBase * importance * (score - expGeneral);
  const home = m.isHome ? venue : prev.home;
  const away = m.isHome ? prev.away : venue;

  // --- offensive: sorpresa de goles A FAVOR ---
  const expGF = expectedGoalsFor(prev.offensive, m.opponent.defensive, ha);
  const offensive = prev.offensive + GOAL_ELO.kGoals * importance * (m.goalsFor - expGF);
  addFactor(expl, {
    key: 'elo_offensive',
    label: 'Elo ofensivo',
    value: offensive - prev.offensive,
    unit: 'elo',
    impact: Math.tanh((offensive - prev.offensive) / 30),
    detail: `${fmtSigned(offensive - prev.offensive, 'Elo', 1)} (marcó ${m.goalsFor} vs ${expGF.toFixed(2)} esperados)`,
  });

  // --- defensive: sorpresa de goles EN CONTRA (concede menos => sube) ---
  const expGA = expectedGoalsFor(m.opponent.offensive, prev.defensive, m.isHome ? 0 : params.homeAdvantage);
  const defensive = prev.defensive + GOAL_ELO.kGoals * importance * (expGA - m.goalsAgainst);
  addFactor(expl, {
    key: 'elo_defensive',
    label: 'Elo defensivo',
    value: defensive - prev.defensive,
    unit: 'elo',
    impact: Math.tanh((defensive - prev.defensive) / 30),
    detail: `${fmtSigned(defensive - prev.defensive, 'Elo', 1)} (encajó ${m.goalsAgainst} vs ${expGA.toFixed(2)} esperados)`,
  });

  return { next: { general, home, away, offensive, defensive }, explanation: expl };
}

/**
 * Mapea un componente Elo a una FUERZA multiplicativa alrededor de 1.0
 * (1.0 = media de la liga). Para el ataque: mayor Elo ofensivo -> >1 (marca más).
 */
export function eloToAttackStrength(offensiveElo: number, leagueAvgElo: number, elasticity = 1): number {
  return Math.exp((elasticity * (offensiveElo - leagueAvgElo)) / 400);
}

/**
 * Fuerza DEFENSIVA multiplicativa: mejor defensa (Elo defensivo alto) -> <1
 * (el rival marca menos). Por eso el signo es negativo.
 */
export function eloToDefenseStrength(defensiveElo: number, leagueAvgElo: number, elasticity = 1): number {
  return Math.exp((-elasticity * (defensiveElo - leagueAvgElo)) / 400);
}
