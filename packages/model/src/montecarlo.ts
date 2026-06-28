// -----------------------------------------------------------------------------
// SIMULACIÓN MONTE CARLO (#6).
//
// Dixon-Coles da la matriz de marcador analítica; Monte Carlo la complementa
// simulando el partido N veces (50k–100k) para obtener distribuciones empíricas
// directamente "jugables": histograma de goles, marcadores, over/under, BTTS y
// hándicado asiático, con sus probabilidades.
//
// Se muestrea de dos Poisson independientes (Knuth). La corrección Dixon-Coles
// afecta sobre todo a marcadores bajos y se aplica por re-muestreo opcional; por
// defecto MC usa Poisson independiente (estándar y suficiente para distribuciones
// de mercado). RNG sembrable (mulberry32) => resultados deterministas en tests.
// -----------------------------------------------------------------------------

import type { Outcome1x2 } from './types';

/** PRNG determinista y rápido. `seed` entero. Devuelve función ()=>[0,1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Muestrea de Poisson(lambda) por el método de Knuth. */
export function samplePoisson(lambda: number, rng: () => number): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

export interface MonteCarloOptions {
  runs?: number; // nº de simulaciones (def. 50.000)
  seed?: number; // semilla del RNG (def. 1) para reproducibilidad
  overLines?: number[]; // líneas over/under (def. 0.5..4.5)
  handicapLines?: number[]; // líneas de hándicap asiático para el local
  maxGoalsHistogram?: number; // tope del histograma de goles totales (def. 8)
}

export interface MonteCarloResult {
  runs: number;
  oneXtwo: Outcome1x2;
  over: Record<string, number>; // P(total > línea)
  btts: number; // ambos marcan
  avgTotalGoals: number;
  avgHome: number;
  avgAway: number;
  goalsHistogram: number[]; // index = goles totales, valor = frecuencia [0,1]
  topScores: Array<{ score: [number, number]; p: number }>;
  /** P(el local cubre el hándicap): home_goals + line > away_goals. */
  handicap: Array<{ line: number; homeCover: number }>;
}

/**
 * Simula `runs` partidos con goles ~ Poisson(λ) y agrega todas las distribuciones.
 */
export function simulateMatch(
  lambdaHome: number,
  lambdaAway: number,
  opts: MonteCarloOptions = {},
): MonteCarloResult {
  const runs = opts.runs ?? 50_000;
  const overLines = opts.overLines ?? [0.5, 1.5, 2.5, 3.5, 4.5];
  const handicapLines = opts.handicapLines ?? [-2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2];
  const maxH = opts.maxGoalsHistogram ?? 8;
  const rng = mulberry32(opts.seed ?? 1);

  let home = 0;
  let draw = 0;
  let away = 0;
  let btts = 0;
  let sumTotal = 0;
  let sumHome = 0;
  let sumAway = 0;
  const overCounts = overLines.map(() => 0);
  const hcCounts = handicapLines.map(() => 0);
  const hist = new Array<number>(maxH + 1).fill(0);
  const scoreCounts = new Map<string, number>();

  for (let i = 0; i < runs; i++) {
    const h = samplePoisson(lambdaHome, rng);
    const a = samplePoisson(lambdaAway, rng);
    if (h > a) home++;
    else if (h === a) draw++;
    else away++;
    if (h > 0 && a > 0) btts++;
    const tot = h + a;
    sumTotal += tot;
    sumHome += h;
    sumAway += a;
    hist[Math.min(tot, maxH)]!++;
    for (let j = 0; j < overLines.length; j++) if (tot > overLines[j]!) overCounts[j]!++;
    for (let j = 0; j < handicapLines.length; j++) if (h + handicapLines[j]! > a) hcCounts[j]!++;
    const key = `${h}-${a}`;
    scoreCounts.set(key, (scoreCounts.get(key) ?? 0) + 1);
  }

  const over: Record<string, number> = {};
  overLines.forEach((l, j) => (over[String(l)] = overCounts[j]! / runs));

  const topScores = [...scoreCounts.entries()]
    .map(([k, c]) => {
      const [h, a] = k.split('-').map(Number) as [number, number];
      return { score: [h, a] as [number, number], p: c / runs };
    })
    .sort((x, y) => y.p - x.p)
    .slice(0, 6);

  return {
    runs,
    oneXtwo: { home: home / runs, draw: draw / runs, away: away / runs },
    over,
    btts: btts / runs,
    avgTotalGoals: sumTotal / runs,
    avgHome: sumHome / runs,
    avgAway: sumAway / runs,
    goalsHistogram: hist.map((c) => c / runs),
    topScores,
    handicap: handicapLines.map((line, j) => ({ line, homeCover: hcCounts[j]! / runs })),
  };
}
