/**
 * Previsualización del modelo COMPLETO (Elo + Poisson/DC + contexto) para los
 * partidos del 2026-06-24, usando combineEnsemble.
 *
 *   npx tsx scripts/preview-today.ts
 *
 * Elo = placeholders del seed (ballpark, NO oficiales). Venue NEUTRAL
 * (homeAdvantage = 0). El contexto aquí es ILUSTRATIVO (en producción lo arma
 * run-model desde la BD: lesiones, forma, descanso, H2H).
 */
import {
  combineEnsemble,
  contextModifier,
  DEFAULT_WEIGHTS,
  type ContextFactors,
} from '../packages/model/src/index';

const ELO: Record<string, number> = {
  Suiza: 1665,
  Canadá: 1490,
  'Bosnia y Herzegovina': 1520,
  Catar: 1480,
};

const HOME_ADV = 0;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const ZERO_CTX: ContextFactors = {
  injuriesHome: 0, injuriesAway: 0, formHome: 0, formAway: 0,
  restAdvantage: 0, h2h: 0, pressure: 0,
};

function analyze(home: string, away: string, factors: ContextFactors = ZERO_CTX, tag = '') {
  const ctx = contextModifier(factors);
  const r = combineEnsemble({
    eloHome: ELO[home]!,
    eloAway: ELO[away]!,
    weights: DEFAULT_WEIGHTS,
    homeAdvantage: HOME_ADV,
    context: ctx,
  });

  console.log(`\n══════════════════════════════════════════════`);
  console.log(`  ${home}  vs  ${away}${tag ? `   ${tag}` : ''}`);
  console.log(`  λ ${r.lambdaHome.toFixed(2)} / ${r.lambdaAway.toFixed(2)}   ·   contexto ${ctx >= 0 ? '+' : ''}${ctx.toFixed(2)}`);
  console.log(`──────────────────────────────────────────────`);
  console.log(`  1X2 (FINAL)   ${pct(r.final.home)}  ${pct(r.final.draw)}  ${pct(r.final.away)}   [1 / X / 2]`);
  console.log(`  Over 2.5      ${pct(r.poisson.over['2.5'])}    BTTS  ${pct(r.poisson.btts)}`);
  console.log(`  Marcador      ${r.poisson.mostLikelyScore[0]}-${r.poisson.mostLikelyScore[1]}`);
}

console.log('STI · Modelo completo (Elo + Poisson/DC + contexto)');

analyze('Suiza', 'Canadá');
// Escenario ilustrativo: Canadá con bajas importantes + Suiza en mejor forma.
analyze('Suiza', 'Canadá', { ...ZERO_CTX, injuriesAway: 0.6, formHome: 0.4, formAway: -0.2 }, '(ctx: bajas en Canadá + forma SUI)');

analyze('Bosnia y Herzegovina', 'Catar');

console.log('\nNota: contexto ilustrativo. En vivo lo arma run-model desde la BD. Value bets requieren cuotas cargadas (sync-odds).');
