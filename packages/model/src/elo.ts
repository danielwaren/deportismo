import type { EloParams } from './types';

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
