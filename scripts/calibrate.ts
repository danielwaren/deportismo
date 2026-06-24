/**
 * Construye Elo data-driven desde resultados reales (scripts/matches.json,
 * 171 partidos 2022-2025) y corre el modelo calibrado (mu=2.78, nu=0.60) para
 * los partidos del Mundial 2026 cargados. Imprime los valores a persistir.
 *
 *   npx tsx scripts/calibrate.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  expectedScore, eloToOneXtwo, eloToLambdas, buildScoreMatrix, blend1x2,
  formScore, h2hScore, contextModifier, type FormMatch, type ContextFactors,
} from '../packages/model/src/index';

const here = dirname(fileURLToPath(import.meta.url));
const M: [string, number, number, number, number, number][] =
  JSON.parse(readFileSync(join(here, 'matches.json'), 'utf8'));

const HA = 60;        // ventaja de local (no amistoso)
const MU = 2.78;      // calibrado (media de goles real)
const NU = 0.6;       // calibrado (tasa de empate real ~24%)

const elo: Record<number, number> = {};
const E = (t: number) => (elo[t] ??= 1500);
const gdMult = (gd: number) => { const a = Math.abs(gd); return a <= 1 ? 1 : a === 2 ? 1.5 : (11 + a) / 8; };

// Elo cronológico
for (const [, h, a, hg, ag, fr] of M) {
  const ha = fr ? 0 : HA;
  const eh = E(h), ea = E(a);
  const we = expectedScore(eh, ea, ha);
  const w = hg > ag ? 1 : hg < ag ? 0 : 0.5;
  const k = (fr ? 20 : 30) * gdMult(hg - ag);
  elo[h] = eh + k * (w - we);
  elo[a] = ea + k * (we - w);
}

function form(team: number): number {
  const games = M.filter(([, h, a]) => h === team || a === team).slice(-5).reverse();
  const fm: FormMatch[] = games.map(([, h, a, hg, ag], i) => {
    const home = h === team;
    const gf = home ? hg : ag, ga = home ? ag : hg;
    return { result: gf > ga ? 'W' : gf < ga ? 'L' : 'D', opponentElo: E(home ? a : h), teamElo: E(team), ageInMatches: i };
  });
  return formScore(fm);
}
function h2h(home: number, away: number) {
  const res = M.filter(([, h, a]) => (h === home && a === away) || (h === away && a === home))
    .map(([, h, , hg, ag]) => (hg === ag ? 'draw' : (hg > ag) === (h === home) ? 'home' : 'away')) as Array<'home' | 'away' | 'draw'>;
  return h2hScore(res);
}

// fixtureLocalId -> [homeApi, awayApi, etiqueta]
const FIX: [number, number, number, string][] = [
  [1, 15, 5529, 'Suiza-Canadá'],
  [2, 1113, 1569, 'Bosnia-Catar'],
  [3, 8, 1508, 'Colombia-CongoRD'],
  [4, 31, 2386, 'Marruecos-Haití'],
  [5, 1108, 6, 'Escocia-Brasil'],
];

for (const [fid, home, away, label] of FIX) {
  const ctxFactors: ContextFactors = {
    injuriesHome: 0, injuriesAway: 0, formHome: form(home), formAway: form(away),
    restAdvantage: 0, h2h: h2h(home, away), pressure: 0,
  };
  const ctx = contextModifier(ctxFactors);
  let { lambdaHome, lambdaAway } = eloToLambdas(E(home), E(away), { mu: MU, homeAdvantage: 0 });
  const shift = Math.exp(0.2 * ctx);
  lambdaHome *= shift; lambdaAway /= shift;
  const p = buildScoreMatrix(lambdaHome, lambdaAway);
  const e = eloToOneXtwo(E(home), E(away), { homeAdvantage: 0, kBase: 30 }, NU);
  const f = blend1x2(p.oneXtwo, e, 0.625);
  console.log(`FIX ${fid} ${label.padEnd(18)} Elo ${Math.round(E(home))}/${Math.round(E(away))} | ` +
    `lambda_home=${lambdaHome.toFixed(3)} lambda_away=${lambdaAway.toFixed(3)} ` +
    `ph=${f.home.toFixed(4)} pd=${f.draw.toFixed(4)} pa=${f.away.toFixed(4)} ` +
    `o15=${p.over['1.5'].toFixed(4)} o25=${p.over['2.5'].toFixed(4)} o35=${p.over['3.5'].toFixed(4)} ` +
    `btts=${p.btts.toFixed(4)} score=${p.mostLikelyScore[0]}-${p.mostLikelyScore[1]} ` +
    `elo_home=${Math.round(E(home))} elo_away=${Math.round(E(away))}`);
}
