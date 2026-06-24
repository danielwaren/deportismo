import type { DixonColesParams, PoissonOutput } from './types';

export const DEFAULT_DC: DixonColesParams = { rho: -0.1, decayHalflife: 8 };

/** PMF de Poisson: P(X = k | lambda). Primitiva estable, con test. */
export function poissonPmf(k: number, lambda: number): number {
  if (k < 0 || !Number.isInteger(k)) return 0;
  let logp = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logp -= Math.log(i);
  return Math.exp(logp);
}

/**
 * Factor de corrección Dixon-Coles tau para marcadores bajos (0-0,1-0,0-1,1-1),
 * donde el Poisson independiente desajusta la dependencia entre goles.
 */
export function dcTau(
  homeGoals: number,
  awayGoals: number,
  lambdaHome: number,
  lambdaAway: number,
  rho: number,
): number {
  if (homeGoals === 0 && awayGoals === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (homeGoals === 0 && awayGoals === 1) return 1 + lambdaHome * rho;
  if (homeGoals === 1 && awayGoals === 0) return 1 + lambdaAway * rho;
  if (homeGoals === 1 && awayGoals === 1) return 1 - rho;
  return 1;
}

/**
 * Construye la matriz de marcador exacto Dixon-Coles y deriva todos los mercados
 * (1X2, over/under, BTTS, marcador más probable) a partir de las lambdas.
 * `maxGoals` acota la matriz (8 cubre >99.9% de la masa en fútbol).
 */
export function buildScoreMatrix(
  lambdaHome: number,
  lambdaAway: number,
  params: DixonColesParams = DEFAULT_DC,
  maxGoals = 8,
): PoissonOutput {
  const matrix: number[][] = [];
  let total = 0;
  for (let h = 0; h <= maxGoals; h++) {
    matrix[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      const p =
        poissonPmf(h, lambdaHome) *
        poissonPmf(a, lambdaAway) *
        dcTau(h, a, lambdaHome, lambdaAway, params.rho);
      matrix[h]![a] = p;
      total += p;
    }
  }

  // Renormaliza (tau y el truncamiento rompen ligeramente la suma a 1).
  let home = 0,
    draw = 0,
    away = 0,
    btts = 0;
  const over = { '1.5': 0, '2.5': 0, '3.5': 0 };
  const cells: Array<{ score: [number, number]; p: number }> = [];

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = (matrix[h]![a]! /= total);
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
      if (h > 0 && a > 0) btts += p;
      const tot = h + a;
      if (tot > 1.5) over['1.5'] += p;
      if (tot > 2.5) over['2.5'] += p;
      if (tot > 3.5) over['3.5'] += p;
      cells.push({ score: [h, a], p });
    }
  }

  // Top marcadores exactos por probabilidad. OJO: en fútbol el marcador modal
  // suele ser 1-1 o 1-0 (la masa se reparte entre muchos marcadores), así que el
  // "más probable" rara vez supera ~12% — por eso se expone su probabilidad.
  cells.sort((x, y) => y.p - x.p);
  const topScores = cells.slice(0, 5).map((c) => ({ score: c.score, p: c.p }));

  return {
    lambdaHome,
    lambdaAway,
    scoreMatrix: matrix,
    oneXtwo: { home, draw, away },
    over,
    btts,
    mostLikelyScore: topScores[0]!.score,
    topScores,
  };
}

/**
 * Pesos de decaimiento exponencial tipo Dixon-Coles: los partidos más recientes
 * pesan más. `agesInMatches[i]` = cuántos partidos atrás ocurrió el partido i.
 */
export function decayWeights(agesInMatches: number[], halflife: number): number[] {
  const lambda = Math.LN2 / halflife;
  return agesInMatches.map((age) => Math.exp(-lambda * age));
}
