/**
 * Previsualización del modelo para los partidos del 2026-06-24 usando SOLO las
 * piezas ya implementadas (Elo + Poisson/Dixon-Coles). El ajuste contextual
 * (lesiones, forma, viaje, presión) es stub de Fase 3 y aquí se omite.
 *
 *   npx tsx scripts/preview-today.ts
 *
 * Elo = placeholders del seed (ballpark, NO oficiales). Venue asumido NEUTRAL
 * (homeAdvantage = 0): si alguno juega realmente de local, subir a +65.
 */
import {
  eloToOneXtwo,
  eloToLambdas,
  buildScoreMatrix,
  blend1x2,
  DEFAULT_WEIGHTS,
  DEFAULT_ELO,
} from '../packages/model/src/index';

const ELO: Record<string, number> = {
  Suiza: 1665,
  Canadá: 1490,
  'Bosnia y Herzegovina': 1520,
  Catar: 1480,
};

const HOME_ADV = 0; // neutral
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function analyze(home: string, away: string) {
  const eh = ELO[home]!;
  const ea = ELO[away]!;

  // Componente Elo (1X2 con empate Bradley-Terry-Davidson).
  const elo = eloToOneXtwo(eh, ea, { ...DEFAULT_ELO, homeAdvantage: HOME_ADV });

  // Componente Poisson/Dixon-Coles vía lambdas derivadas del Elo.
  const { lambdaHome, lambdaAway } = eloToLambdas(eh, ea, { homeAdvantage: HOME_ADV });
  const pois = buildScoreMatrix(lambdaHome, lambdaAway);

  // Ensemble parcial: Poisson + Elo (sin contexto), pesos renormalizados.
  const wPoisson = DEFAULT_WEIGHTS.poisson / (DEFAULT_WEIGHTS.poisson + DEFAULT_WEIGHTS.elo);
  const final = blend1x2(pois.oneXtwo, elo, wPoisson);

  console.log(`\n══════════════════════════════════════════════`);
  console.log(`  ${home}  vs  ${away}`);
  console.log(`  Elo ${eh} / ${ea}   ·   λ ${lambdaHome.toFixed(2)} / ${lambdaAway.toFixed(2)}`);
  console.log(`──────────────────────────────────────────────`);
  console.log(`  1X2 (Elo)     ${pct(elo.home)}  ${pct(elo.draw)}  ${pct(elo.away)}`);
  console.log(`  1X2 (Poisson) ${pct(pois.oneXtwo.home)}  ${pct(pois.oneXtwo.draw)}  ${pct(pois.oneXtwo.away)}`);
  console.log(`  1X2 (FINAL)   ${pct(final.home)}  ${pct(final.draw)}  ${pct(final.away)}   [1 / X / 2]`);
  console.log(`──────────────────────────────────────────────`);
  console.log(`  Over 1.5 / 2.5 / 3.5   ${pct(pois.over['1.5'])} / ${pct(pois.over['2.5'])} / ${pct(pois.over['3.5'])}`);
  console.log(`  BTTS (ambos marcan)    ${pct(pois.btts)}`);
  console.log(`  Marcador más probable  ${pois.mostLikelyScore[0]}-${pois.mostLikelyScore[1]}`);
}

console.log('STI · Previsualización del modelo (Elo + Poisson/DC, sin contexto)');
analyze('Suiza', 'Canadá');
analyze('Bosnia y Herzegovina', 'Catar');
console.log('\n⚠ Contexto (lesiones/forma/viaje/presión) y comparación vs cuotas: Fase 3-5.');
