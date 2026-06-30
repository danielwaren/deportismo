// Copia VENDORIZADA y autocontenida de @sti/model para el runtime Deno (sin
// imports relativos con extensión). Mantener sincronizada con packages/model/.
// Parámetros calibrados: nu=0.6, mu=2.78 (ver scripts/calibrate.ts).

export const DEFAULT_ELO = { homeAdvantage: 65, kBase: 24 };
export const DEFAULT_DC = { rho: -0.1, decayHalflife: 8 };
export const DEFAULT_WEIGHTS = { poisson: 0.5, elo: 0.3, context: 0.2 };

export function expectedScore(eloA: number, eloB: number, homeAdvantage = 0): number {
  return 1 / (1 + Math.pow(10, (eloB - (eloA + homeAdvantage)) / 400));
}

export function eloToOneXtwo(eloHome: number, eloAway: number, params = DEFAULT_ELO, nu = 0.6) {
  const dh = eloHome + params.homeAdvantage;
  const wHome = Math.pow(10, dh / 400);
  const wAway = Math.pow(10, eloAway / 400);
  const wDraw = nu * Math.sqrt(wHome * wAway);
  const z = wHome + wAway + wDraw;
  return { home: wHome / z, draw: wDraw / z, away: wAway / z };
}

export function poissonPmf(k: number, lambda: number): number {
  if (k < 0 || !Number.isInteger(k)) return 0;
  let logp = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logp -= Math.log(i);
  return Math.exp(logp);
}

export function dcTau(h: number, a: number, lh: number, la: number, rho: number): number {
  if (h === 0 && a === 0) return 1 - lh * la * rho;
  if (h === 0 && a === 1) return 1 + lh * rho;
  if (h === 1 && a === 0) return 1 + la * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1;
}

export function buildScoreMatrix(lh: number, la: number, params = DEFAULT_DC, maxGoals = 8) {
  const matrix: number[][] = [];
  let total = 0;
  for (let h = 0; h <= maxGoals; h++) {
    matrix[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      const p = poissonPmf(h, lh) * poissonPmf(a, la) * dcTau(h, a, lh, la, params.rho);
      matrix[h][a] = p;
      total += p;
    }
  }
  let home = 0, draw = 0, away = 0, btts = 0;
  const over = { '1.5': 0, '2.5': 0, '3.5': 0 };
  const cells: Array<{ score: [number, number]; p: number }> = [];
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = (matrix[h][a] /= total);
      if (h > a) home += p; else if (h === a) draw += p; else away += p;
      if (h > 0 && a > 0) btts += p;
      const t = h + a;
      if (t > 1.5) over['1.5'] += p;
      if (t > 2.5) over['2.5'] += p;
      if (t > 3.5) over['3.5'] += p;
      cells.push({ score: [h, a], p });
    }
  }
  cells.sort((x, y) => y.p - x.p);
  return {
    lambdaHome: lh, lambdaAway: la, oneXtwo: { home, draw, away }, over, btts,
    mostLikelyScore: cells[0].score, topScores: cells.slice(0, 5),
  };
}

export function eloToLambdas(eh: number, ea: number, opts: { mu?: number; gamma?: number; homeAdvantage?: number } = {}) {
  const { mu = 2.78, gamma = 1.0, homeAdvantage = 0 } = opts;
  const d = (eh + homeAdvantage - ea) / 400;
  return { lambdaHome: (mu / 2) * Math.exp(gamma * d), lambdaAway: (mu / 2) * Math.exp(-gamma * d) };
}

function normalizeWeights(w: typeof DEFAULT_WEIGHTS) {
  const s = w.poisson + w.elo + w.context;
  return s > 0 ? { poisson: w.poisson / s, elo: w.elo / s, context: w.context / s } : w;
}

function blend1x2(a: { home: number; draw: number; away: number }, b: { home: number; draw: number; away: number }, wA: number) {
  const wB = 1 - wA;
  const home = a.home * wA + b.home * wB, draw = a.draw * wA + b.draw * wB, away = a.away * wA + b.away * wB;
  const z = home + draw + away;
  return { home: home / z, draw: draw / z, away: away / z };
}

export function combineEnsemble(input: {
  eloHome: number; eloAway: number; homeAdvantage?: number; context?: number;
  weights?: typeof DEFAULT_WEIGHTS; mu?: number;
}) {
  const weights = normalizeWeights(input.weights ?? DEFAULT_WEIGHTS);
  const homeAdvantage = input.homeAdvantage ?? 0;
  const ctx = Math.max(-1, Math.min(1, input.context ?? 0));
  let { lambdaHome, lambdaAway } = eloToLambdas(input.eloHome, input.eloAway, { mu: input.mu, homeAdvantage });
  const shift = Math.exp(weights.context * ctx);
  lambdaHome *= shift; lambdaAway /= shift;
  const poisson = buildScoreMatrix(lambdaHome, lambdaAway);
  const elo = eloToOneXtwo(input.eloHome, input.eloAway, { homeAdvantage, kBase: 24 });
  const wPoisson = weights.poisson / (weights.poisson + weights.elo);
  const final = blend1x2(poisson.oneXtwo, elo, wPoisson);
  return { lambdaHome, lambdaAway, poisson, elo, final };
}

// =============================================================================
// RUTA PRINCIPISTA (Fase 1): lambdas = ataque×defensa×media_liga×localía, con el
// Elo multi-componente. Réplica de packages/model (elo.ts + lambdas.ts) para el
// runtime Deno. Es la que persiste el modelo canónico nuevo (analyzeFixture).
// =============================================================================

export function eloToAttackStrength(offensiveElo: number, leagueAvgElo: number, k = 1): number {
  return Math.exp((k * (offensiveElo - leagueAvgElo)) / 400);
}
export function eloToDefenseStrength(defensiveElo: number, leagueAvgElo: number, k = 1): number {
  return Math.exp((-k * (defensiveElo - leagueAvgElo)) / 400);
}

export function computeLambdas(i: {
  leagueAvgGoals: number; homeAttack: number; awayDefense: number;
  awayAttack: number; homeDefense: number; homeAdvantage?: number;
}): { lambdaHome: number; lambdaAway: number } {
  let lh = i.leagueAvgGoals * i.homeAttack * i.awayDefense * (i.homeAdvantage ?? 1);
  let la = i.leagueAvgGoals * i.awayAttack * i.homeDefense;
  lh = Math.max(0.05, Math.min(lh, 6));
  la = Math.max(0.05, Math.min(la, 6));
  return { lambdaHome: lh, lambdaAway: la };
}

export interface TeamElo { general: number; offensive: number; defensive: number; }

// Modelo ML (regresión logística softmax) — vendorizado para mezclar su 1X2.
export interface LogRegWeights { w: number[][]; b: number[]; mean: number[]; std: number[]; featureNames: string[]; }
function mlPredict(weights: LogRegWeights, features: number[]) {
  const x = features.map((v, j) => (v - weights.mean[j]) / (weights.std[j] || 1));
  const z = [0, 1, 2].map((c) => weights.b[c] + weights.w[c].reduce((a, wj, j) => a + wj * x[j], 0));
  const m = Math.max(...z); const e = z.map((v) => Math.exp(v - m)); const s = e.reduce((a, b) => a + b, 0) || 1;
  return { home: e[0] / s, draw: e[1] / s, away: e[2] / s };
}

export function analyzeFixture(i: {
  home: TeamElo; away: TeamElo; leagueAvgElo: number; leagueAvgGoals: number;
  homeAdvElo: number; weights?: { poisson: number; elo: number }; mlWeights?: LogRegWeights | null;
}) {
  const ha = Math.exp(i.homeAdvElo / 400);
  const homeAttack = eloToAttackStrength(i.home.offensive, i.leagueAvgElo);
  const awayDefense = eloToDefenseStrength(i.away.defensive, i.leagueAvgElo);
  const awayAttack = eloToAttackStrength(i.away.offensive, i.leagueAvgElo);
  const homeDefense = eloToDefenseStrength(i.home.defensive, i.leagueAvgElo);
  const { lambdaHome, lambdaAway } = computeLambdas({
    leagueAvgGoals: i.leagueAvgGoals, homeAttack, awayDefense, awayAttack, homeDefense, homeAdvantage: ha,
  });
  const poisson = buildScoreMatrix(lambdaHome, lambdaAway);
  const elo = eloToOneXtwo(i.home.general, i.away.general, { homeAdvantage: i.homeAdvElo, kBase: 24 });
  const wp = i.weights?.poisson ?? 0.6, we = i.weights?.elo ?? 0.4;
  let final = blend1x2(poisson.oneXtwo, elo, wp / (wp + we));
  if (i.mlWeights) {
    const feats = [(i.home.general - i.away.general) / 100, (i.home.offensive - i.away.defensive) / 100,
      (i.away.offensive - i.home.defensive) / 100, i.homeAdvElo / 100, 0, 0];
    const ml = mlPredict(i.mlWeights, feats);
    final = blend1x2(final, ml, 0.75); // 25% al modelo ML
  }
  return { lambdaHome, lambdaAway, poisson, elo, final };
}
