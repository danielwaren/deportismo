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
const FIX: [number, number, number, string][] =
  JSON.parse(readFileSync(join(here, 'fixtures.json'), 'utf8'));

const r4 = (x: number) => x.toFixed(4);
const eloVals: string[] = [];
const outVals: string[] = [];
const predVals: string[] = [];
const seenTeams = new Set<number>();

for (const [fid, home, away] of FIX) {
  const ctx = contextModifier({
    injuriesHome: 0, injuriesAway: 0, formHome: form(home), formAway: form(away),
    restAdvantage: 0, h2h: h2h(home, away), pressure: 0,
  });
  let { lambdaHome, lambdaAway } = eloToLambdas(E(home), E(away), { mu: MU, homeAdvantage: 0 });
  const shift = Math.exp(0.2 * ctx);
  lambdaHome *= shift; lambdaAway /= shift;
  const p = buildScoreMatrix(lambdaHome, lambdaAway);
  const e = eloToOneXtwo(E(home), E(away), { homeAdvantage: 0, kBase: 30 }, NU);
  const f = blend1x2(p.oneXtwo, e, 0.625);

  for (const tid of [home, away]) if (!seenTeams.has(tid)) { seenTeams.add(tid); eloVals.push(`(${tid},${Math.round(E(tid))})`); }
  outVals.push(`(${fid},'dc-elo-ctx-0.1.0',${lambdaHome.toFixed(3)},${lambdaAway.toFixed(3)},${r4(f.home)},${r4(f.draw)},${r4(f.away)},${r4(p.over['1.5'])},${r4(p.over['2.5'])},${r4(p.over['3.5'])},${r4(p.btts)},'${p.mostLikelyScore[0]}-${p.mostLikelyScore[1]}')`);
  // predicciones solo para los fixtures sin odds aún (6..16); 1-5 ya están
  if (fid >= 6) {
    predVals.push(`(${fid},'dc-elo-ctx-0.1.0','1x2','home',${r4(f.home)})`);
    predVals.push(`(${fid},'dc-elo-ctx-0.1.0','1x2','draw',${r4(f.draw)})`);
    predVals.push(`(${fid},'dc-elo-ctx-0.1.0','1x2','away',${r4(f.away)})`);
  }
}

console.log('-- ELO');
console.log(`insert into public.team_elo_history (team_id, elo, as_of) select t.id, v.elo, now() from public.teams t join (values ${eloVals.join(',')}) v(api,elo) on v.api=t.api_id;`);
console.log('-- OUTPUTS');
console.log(`insert into public.match_model_outputs (fixture_id, model_version, lambda_home, lambda_away, prob_home, prob_draw, prob_away, prob_over_15, prob_over_25, prob_over_35, prob_btts, most_likely_score) values ${outVals.join(',')} on conflict (fixture_id, model_version) do update set lambda_home=excluded.lambda_home, lambda_away=excluded.lambda_away, prob_home=excluded.prob_home, prob_draw=excluded.prob_draw, prob_away=excluded.prob_away, prob_over_15=excluded.prob_over_15, prob_over_25=excluded.prob_over_25, prob_over_35=excluded.prob_over_35, prob_btts=excluded.prob_btts, most_likely_score=excluded.most_likely_score;`);
console.log('-- PREDICTIONS');
console.log(`insert into public.predictions (fixture_id, model_version, market, selection, model_prob) values ${predVals.join(',')};`);
