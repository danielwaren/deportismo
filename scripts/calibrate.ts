/**
 * Calibración v1 desde resultados reales (113 partidos 2022-2025 de las 4
 * selecciones y sus rivales, API-Football).
 *   1. Construye Elo data-driven (1500 base, K por importancia, multiplicador por
 *      diferencia de goles, ventaja de local 60 salvo amistosos).
 *   2. Ajusta mu (goles esperados) a la media real y nu (peso de empate) para que
 *      la tasa de empate del modelo iguale la real (24.8%).
 *   3. Re-corre el modelo para Suiza-Canadá y Bosnia-Catar con Elo + forma reales.
 *
 *   npx tsx scripts/calibrate.ts
 */
import {
  expectedScore, eloToOneXtwo, eloToLambdas, buildScoreMatrix, blend1x2,
  formScore, h2hScore, contextModifier, type FormMatch, type ContextFactors,
} from '../packages/model/src/index';

// [fecha, homeApi, awayApi, golesHome, golesAway, friendly]
const M: [string, number, number, number, number, number][] = JSON.parse(`[["2022-03-26",10,15,2,1,1],["2022-03-29",15,1111,1,1,1],["2022-06-02",770,15,2,1,0],["2022-06-05",27,15,4,0,0],["2022-06-09",15,9,0,1,0],["2022-06-12",15,27,1,0,0],["2022-09-24",9,15,1,2,0],["2022-09-27",15,770,2,1,0],["2022-11-17",1504,15,2,0,1],["2022-11-24",15,1530,1,0,0],["2022-11-28",6,15,1,0,0],["2022-12-02",14,15,2,3,0],["2022-12-06",27,15,6,1,0],["2023-01-07",1570,1569,0,2,0],["2023-01-10",1569,1547,1,2,0],["2023-01-13",1569,1563,1,1,0],["2023-01-16",1567,1569,2,1,0],["2023-03-23",1113,18,3,0,0],["2023-03-25",1100,15,0,5,0],["2023-03-26",773,1113,2,0,0],["2023-03-28",15,1116,3,0,0],["2023-06-15",2385,1569,1,2,1],["2023-06-16",1110,15,1,2,0],["2023-06-17",27,1113,3,0,0],["2023-06-19",15,774,2,2,0],["2023-06-20",1113,1102,0,2,0],["2023-06-25",2386,1569,2,1,0],["2023-06-27",5529,10983,2,2,0],["2023-06-29",1569,4672,1,1,0],["2023-07-02",5161,5529,0,0,0],["2023-07-03",16,1569,0,1,0],["2023-07-04",5529,2388,4,2,0],["2023-07-08",11,1569,4,0,0],["2023-09-07",1569,1511,1,2,1],["2023-09-08",1113,1107,2,1,0],["2023-09-09",1111,15,2,2,0],["2023-09-11",18,1113,1,0,0],["2023-09-12",15,1110,3,0,0],["2023-09-12",1569,4,1,1,1],["2023-10-13",12,5529,4,1,1],["2023-10-13",1107,1113,0,2,0],["2023-10-15",15,1100,3,3,0],["2023-10-16",1113,27,0,5,0],["2023-10-17",1569,22,0,4,1],["2023-11-15",1116,15,1,1,0],["2023-11-16",1102,1113,4,1,0],["2023-11-18",2385,5529,1,2,0],["2023-11-18",15,1111,1,1,0],["2023-11-19",1113,773,1,2,0],["2023-11-21",774,15,1,0,0],["2023-11-22",5529,2385,2,3,0],["2023-12-31",1569,1543,3,0,1],["2024-01-05",1569,1548,1,2,1],["2024-01-12",1569,1551,3,0,0],["2024-01-17",1536,1569,0,1,0],["2024-01-22",1569,1566,1,0,0],["2024-01-29",1569,1562,2,1,0],["2024-02-07",22,1569,2,3,0],["2024-02-10",1548,1569,1,3,0],["2024-03-21",1113,772,1,2,0],["2024-03-23",5529,5168,2,0,0],["2024-03-23",21,15,0,0,1],["2024-03-26",776,15,0,1,1],["2024-06-03",10,1113,3,0,1],["2024-06-04",15,1101,4,0,1],["2024-06-06",1118,5529,4,0,1],["2024-06-08",15,775,1,1,1],["2024-06-09",2,5529,0,0,1],["2024-06-09",768,1113,1,0,1],["2024-06-15",769,15,1,3,0],["2024-06-19",1108,15,1,1,0],["2024-06-21",26,5529,2,0,0],["2024-06-23",15,25,1,1,0],["2024-06-26",30,5529,0,1,0],["2024-06-29",15,768,2,0,0],["2024-06-30",5529,2383,0,0,0],["2024-07-10",26,5529,2,0,0],["2024-09-05",21,15,2,0,0],["2024-09-07",2384,5529,1,2,1],["2024-09-07",1118,1113,5,2,0],["2024-09-08",15,9,1,4,0],["2024-09-10",769,1113,0,0,0],["2024-09-11",16,5529,0,0,1],["2024-10-11",1113,25,1,2,0],["2024-10-12",14,15,2,0,0],["2024-10-14",1113,769,0,2,0],["2024-10-15",5529,11,2,1,1],["2024-10-15",15,21,2,2,0],["2024-11-15",15,14,1,1,0],["2024-11-15",8171,5529,0,1,0],["2024-11-16",25,1113,7,0,0],["2024-11-18",9,15,3,2,0],["2024-11-19",1113,1118,1,1,0],["2024-11-20",5529,8171,3,0,0],["2024-12-21",1569,1563,1,1,0],["2024-12-24",1552,1569,2,1,0],["2024-12-27",1570,1569,1,1,0],["2025-03-21",774,1113,0,1,0],["2025-03-21",5529,16,0,2,0],["2025-03-22",5529,2384,2,1,0],["2025-03-24",1113,1106,2,1,0],["2025-06-07",1113,1115,1,0,0],["2025-09-05",15,1111,4,0,0],["2025-09-06",1115,1113,0,6,0],["2025-09-08",15,1091,3,0,0],["2025-09-09",1113,775,1,2,0],["2025-10-09",1106,1113,2,2,0],["2025-10-10",5,15,0,2,0],["2025-10-13",1091,15,0,0,0],["2025-11-15",1113,774,3,1,0],["2025-11-15",15,5,4,1,0],["2025-11-18",1111,15,1,1,0],["2025-11-18",775,1113,1,1,0]]`);

const HA = 60; // ventaja de local (no amistoso)
const TEAMS = { 15: 'Suiza', 5529: 'Canadá', 1113: 'Bosnia', 1569: 'Catar' } as const;

const elo: Record<number, number> = {};
const E = (t: number) => (elo[t] ??= 1500);
const gdMult = (gd: number) => { const a = Math.abs(gd); return a <= 1 ? 1 : a === 2 ? 1.5 : (11 + a) / 8; };

// 1) Construir Elo cronológicamente
for (const [, h, a, hg, ag, fr] of M) {
  const ha = fr ? 0 : HA;
  const eh = E(h), ea = E(a);
  const we = expectedScore(eh, ea, ha);
  const w = hg > ag ? 1 : hg < ag ? 0 : 0.5;
  const k = (fr ? 20 : 30) * gdMult(hg - ag);
  elo[h] = eh + k * (w - we);
  elo[a] = ea + k * (we - w);
}

// 2) Calibrar mu (media real) y nu (peso de empate -> tasa empate 24.8%)
const mu = 2.78;
const TARGET_DRAW = 0.248;
let nu = 0.32, bestErr = 1;
for (let cand = 0.2; cand <= 1.0; cand += 0.02) {
  let sum = 0;
  for (const [, h, a, , , fr] of M) {
    const ha = fr ? 0 : HA;
    const e = eloToOneXtwo(E(h), E(a), { homeAdvantage: ha, kBase: 30 }, cand);
    const { lambdaHome, lambdaAway } = eloToLambdas(E(h), E(a), { mu, homeAdvantage: ha });
    const p = buildScoreMatrix(lambdaHome, lambdaAway);
    sum += blend1x2(p.oneXtwo, e, 0.625).draw;
  }
  const err = Math.abs(sum / M.length - TARGET_DRAW);
  if (err < bestErr) { bestErr = err; nu = cand; }
}

console.log('=== ELO CALIBRADO ===');
for (const [id, name] of Object.entries(TEAMS)) console.log(`  ${name.padEnd(7)} ${Math.round(E(+id))}`);
console.log(`=== PARÁMETROS ===  mu=${mu}  nu=${nu.toFixed(2)}  (tasa empate objetivo ${TARGET_DRAW})`);

// Forma reciente (últimos 5) desde la perspectiva del equipo
function form(team: number): number {
  const games = M.filter(([, h, a]) => h === team || a === team).slice(-5).reverse();
  const fm: FormMatch[] = games.map(([, h, a, hg, ag], i) => {
    const home = h === team;
    const gf = home ? hg : ag, ga = home ? ag : hg;
    const opp = home ? a : h;
    return { result: gf > ga ? 'W' : gf < ga ? 'L' : 'D', opponentElo: E(opp), teamElo: E(team), ageInMatches: i };
  });
  return formScore(fm);
}
function h2h(home: number, away: number) {
  const res = M.filter(([, h, a]) => (h === home && a === away) || (h === away && a === home))
    .map(([, h, , hg, ag]) => (hg === ag ? 'draw' : (hg > ag) === (h === home) ? 'home' : 'away')) as Array<'home' | 'away' | 'draw'>;
  return h2hScore(res);
}

// 3) Modelo para los 2 partidos (Mundial -> venue neutral, HA=0)
function predict(name: string, home: number, away: number) {
  const ctxFactors: ContextFactors = {
    injuriesHome: 0, injuriesAway: 0, formHome: form(home), formAway: form(away),
    restAdvantage: 0, h2h: h2h(home, away), pressure: 0,
  };
  const ctx = contextModifier(ctxFactors);
  let { lambdaHome, lambdaAway } = eloToLambdas(E(home), E(away), { mu, homeAdvantage: 0 });
  const shift = Math.exp(0.2 * ctx);
  lambdaHome *= shift; lambdaAway /= shift;
  const p = buildScoreMatrix(lambdaHome, lambdaAway);
  const e = eloToOneXtwo(E(home), E(away), { homeAdvantage: 0, kBase: 30 }, nu);
  const f = blend1x2(p.oneXtwo, e, 0.625);
  console.log(`\n=== ${name} ===  Elo ${Math.round(E(home))}/${Math.round(E(away))}  forma ${form(home).toFixed(2)}/${form(away).toFixed(2)}  ctx ${ctx.toFixed(2)}`);
  console.log(`SQL | elo_home=${Math.round(E(home))} elo_away=${Math.round(E(away))} lambda_home=${lambdaHome.toFixed(3)} lambda_away=${lambdaAway.toFixed(3)}` +
    ` ph=${f.home.toFixed(4)} pd=${f.draw.toFixed(4)} pa=${f.away.toFixed(4)}` +
    ` o15=${p.over['1.5'].toFixed(4)} o25=${p.over['2.5'].toFixed(4)} o35=${p.over['3.5'].toFixed(4)}` +
    ` btts=${p.btts.toFixed(4)} score=${p.mostLikelyScore[0]}-${p.mostLikelyScore[1]}`);
}

predict('Suiza-Canadá', 15, 5529);
predict('Bosnia-Catar', 1113, 1569);
