/**
 * Recalcula el modelo para los partidos reales del Mundial 2026 usando Elo
 * ANCLADO AL MERCADO (cold-start): sin historial, el modelo parte de acuerdo con
 * las cuotas (edge ~0) y desarrollará criterio propio cuando entren resultados.
 * Imprime los valores a persistir en match_model_outputs.
 *
 *   npx tsx scripts/sync-real.ts
 */
import { combineEnsemble, devig } from '../packages/model/src/index';

// Cuotas consenso reales (promedio 13 casas) traídas de API-Football.
const MATCHES = [
  { name: 'Suiza-Canadá', fixtureId: 1, oddsHome: 2.46, oddsDraw: 3.02, oddsAway: 3.20 },
  { name: 'Bosnia-Catar', fixtureId: 2, oddsHome: 1.35, oddsDraw: 5.29, oddsAway: 8.20 },
];

// Elo anclado al mercado: de la prob. home-vs-away (sin empate) se despeja la
// diferencia Elo; se reparte simétrico alrededor de 1500. Venue neutral (Mundial).
function marketElo(pHome: number, pAway: number) {
  const pH = pHome / (pHome + pAway);
  const d = 400 * Math.log10(pH / (1 - pH));
  return { eloHome: Math.round(1500 + d / 2), eloAway: Math.round(1500 - d / 2) };
}

for (const m of MATCHES) {
  const [fh, fd, fa] = devig([m.oddsHome, m.oddsDraw, m.oddsAway]);
  const { eloHome, eloAway } = marketElo(fh, fa);
  const r = combineEnsemble({ eloHome, eloAway, homeAdvantage: 0, context: 0 });

  console.log(`\n${m.name}  (fixture ${m.fixtureId})`);
  console.log(`  Elo anclado: ${eloHome} / ${eloAway}`);
  console.log(`  Mercado 1X2 : ${(fh * 100).toFixed(1)} / ${(fd * 100).toFixed(1)} / ${(fa * 100).toFixed(1)}`);
  console.log(`  Modelo  1X2 : ${(r.final.home * 100).toFixed(1)} / ${(r.final.draw * 100).toFixed(1)} / ${(r.final.away * 100).toFixed(1)}`);
  console.log(`  SQL_VALUES  | elo_home=${eloHome} elo_away=${eloAway}` +
    ` lambda_home=${r.lambdaHome.toFixed(3)} lambda_away=${r.lambdaAway.toFixed(3)}` +
    ` ph=${r.final.home.toFixed(4)} pd=${r.final.draw.toFixed(4)} pa=${r.final.away.toFixed(4)}` +
    ` o15=${r.poisson.over['1.5'].toFixed(4)} o25=${r.poisson.over['2.5'].toFixed(4)} o35=${r.poisson.over['3.5'].toFixed(4)}` +
    ` btts=${r.poisson.btts.toFixed(4)} score=${r.poisson.mostLikelyScore[0]}-${r.poisson.mostLikelyScore[1]}`);
}
