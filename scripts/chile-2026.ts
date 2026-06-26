/**
 * Experimento: Elo construido SOLO con la temporada 2026 de la Primera chilena
 * (Liga de Primera, datos de campeonatochileno.cl) y comparación con la tabla de
 * puntos real. Olvida temporadas anteriores.
 *
 *   npx tsx scripts/chile-2026.ts
 *
 * Elo: base 1500, ventaja de local 65, K=30 con multiplicador por diferencia de
 * goles. Orden cronológico (por fecha). Para reducir el ruido de orden con una
 * sola temporada, se itera el conjunto de partidos hasta converger.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { expectedScore } from '../packages/model/src/index';

const here = dirname(fileURLToPath(import.meta.url));
const M: [string, number, number, string][] = JSON.parse(readFileSync(join(here, 'chile-2026.json'), 'utf8'));

const HA = 65;
const gdMult = (gd: number) => { const a = Math.abs(gd); return a <= 1 ? 1 : a === 2 ? 1.5 : (11 + a) / 8; };

// --- Elo (iterado para estabilidad con 1 sola temporada) ---
const elo: Record<string, number> = {};
const E = (t: string) => (elo[t] ??= 1500);
function pass(k: number) {
  for (const [h, hg, ag, a] of M) {
    const eh = E(h), ea = E(a);
    const we = expectedScore(eh, ea, HA);
    const w = hg > ag ? 1 : hg < ag ? 0 : 0.5;
    const kk = k * gdMult(hg - ag);
    elo[h] = eh + kk * (w - we);
    elo[a] = ea + kk * (we - w);
  }
}
// 6 pasadas con K decreciente: converge a un rating estable, robusto al orden.
for (const k of [30, 24, 18, 12, 8, 6]) pass(k);

// --- Tabla de puntos real (de los mismos resultados) ---
type Row = { pj: number; g: number; e: number; p: number; gf: number; gc: number; pts: number };
const tbl: Record<string, Row> = {};
const T = (t: string) => (tbl[t] ??= { pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, pts: 0 });
for (const [h, hg, ag, a] of M) {
  const H = T(h), A = T(a);
  H.pj++; A.pj++; H.gf += hg; H.gc += ag; A.gf += ag; A.gc += hg;
  if (hg > ag) { H.g++; A.p++; H.pts += 3; }
  else if (hg < ag) { A.g++; H.p++; A.pts += 3; }
  else { H.e++; A.e++; H.pts++; A.pts++; }
}

const teams = Object.keys(tbl);
const byPts = [...teams].sort((x, y) => tbl[y]!.pts - tbl[x]!.pts || (tbl[y]!.gf - tbl[y]!.gc) - (tbl[x]!.gf - tbl[x]!.gc));
const byElo = [...teams].sort((x, y) => E(y) - E(x));
const eloRank: Record<string, number> = {};
byElo.forEach((t, i) => (eloRank[t] = i + 1));

console.log(`\nLiga de Primera 2026 — ${M.length} partidos, ${teams.length} equipos\n`);
console.log('TABLA REAL (puntos)            | Pos Elo |  Elo  | Δ (tabla vs Elo)');
console.log('───────────────────────────────────────────────────────────────────');
byPts.forEach((t, i) => {
  const posTbl = i + 1, posElo = eloRank[t]!;
  const d = posTbl - posElo; // + = Elo lo ve mejor que la tabla; - = peor
  const flag = d >= 2 ? '  ⬆ Elo lo sube' : d <= -2 ? '  ⬇ Elo lo baja' : '';
  console.log(
    `${String(posTbl).padStart(2)}. ${t.padEnd(24)} ${String(tbl[t]!.pts).padStart(3)}pts | ` +
    `   ${String(posElo).padStart(2)}   | ${String(Math.round(E(t))).padStart(4)} | ${d > 0 ? '+' : ''}${d}${flag}`,
  );
});
