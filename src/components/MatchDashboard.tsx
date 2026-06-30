import { Fragment } from 'react';
import { rankFactors } from '@sti/model';
import type { MatchAnalysis } from '../lib/predict';

// Paleta del tema (terminal). SVG usa hex directo para fills fiables.
const C = {
  up: '#22c55e', down: '#ef4444', warn: '#f59e0b', info: '#38bdf8',
  muted: '#5b6b7f', border: '#1c2533', text: '#cdd6e4',
};
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const pct0 = (x: number) => `${Math.round(x * 100)}%`;

// --- Velocímetro de confianza (0-100) ---------------------------------------
function ConfidenceGauge({ score }: { score: number }) {
  const r = 46;
  const circ = Math.PI * r; // semicírculo
  const frac = Math.max(0, Math.min(1, score / 100));
  const color = score >= 66 ? C.up : score >= 40 ? C.warn : C.down;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 70" className="w-40">
        <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke={C.border} strokeWidth="10" strokeLinecap="round" />
        <path
          d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${frac * circ} ${circ}`}
        />
        <text x="60" y="52" textAnchor="middle" fill={C.text} fontSize="22" fontFamily="monospace" fontWeight="700">{score}</text>
      </svg>
      <span className="label">Confianza</span>
    </div>
  );
}

// --- Donut 1X2 ---------------------------------------------------------------
function Donut({ home, draw, away, labels }: { home: number; draw: number; away: number; labels: [string, string, string] }) {
  const segs = [
    { v: home, c: C.up, l: labels[0] },
    { v: draw, c: C.muted, l: labels[1] },
    { v: away, c: C.info, l: labels[2] },
  ];
  const r = 42, circ = 2 * Math.PI * r;
  let offset = 0;
  const top = segs.reduce((m, s) => (s.v > m.v ? s : m), segs[0]!);
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" className="w-32 -rotate-90">
        {segs.map((s, i) => {
          const len = s.v * circ;
          const el = (
            <circle key={i} cx="60" cy="60" r={r} fill="none" stroke={s.c} strokeWidth="14"
              strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-offset} />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="text-sm">
        {segs.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.c }} />
            <span className="w-20 text-terminal-muted">{s.l}</span>
            <span className="tabular" style={{ color: s === top ? s.c : C.text }}>{pct(s.v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Barras de distribución de goles (Poisson, por equipo) -------------------
function GoalBars({ matrix, title, axis }: { matrix: number[][]; title: string; axis: 'home' | 'away' }) {
  // home = suma por filas (goles del local), away = suma por columnas.
  const n = 6;
  const dist: number[] = [];
  for (let g = 0; g < n; g++) {
    let p = 0;
    for (let k = 0; k < matrix.length; k++) {
      if (axis === 'home') { if (g < n - 1) p += matrix[g]?.[k] ?? 0; else for (let gg = g; gg < matrix.length; gg++) p += matrix[gg]?.[k] ?? 0; }
      else { if (g < n - 1) p += matrix[k]?.[g] ?? 0; else for (let gg = g; gg < matrix.length; gg++) p += matrix[k]?.[gg] ?? 0; }
    }
    dist.push(p);
  }
  const max = Math.max(...dist, 0.001);
  return (
    <div>
      <div className="label mb-1">{title}</div>
      <div className="flex items-end gap-1 h-20">
        {dist.map((p, g) => (
          <div key={g} className="flex h-full flex-1 flex-col items-center justify-end">
            <span className="tabular text-[9px] text-terminal-muted">{pct0(p)}</span>
            <div className="w-full rounded-t" style={{ height: `${(p / max) * 100}%`, background: axis === 'home' ? C.up : C.info, minHeight: 2 }} />
            <span className="tabular text-[10px] text-terminal-muted mt-0.5">{g === n - 1 ? `${g}+` : g}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Heatmap de marcador exacto ---------------------------------------------
function ScoreHeatmap({ matrix }: { matrix: number[][] }) {
  const n = 6;
  let max = 0;
  for (let h = 0; h < n; h++) for (let a = 0; a < n; a++) max = Math.max(max, matrix[h]?.[a] ?? 0);
  return (
    <div>
      <div className="label mb-1">Marcador exacto (local ↓ / visita →)</div>
      <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: `auto repeat(${n}, 1fr)` }}>
        <span />
        {Array.from({ length: n }).map((_, a) => (
          <span key={a} className="tabular text-center text-[10px] text-terminal-muted">{a}</span>
        ))}
        {Array.from({ length: n }).map((_, h) => (
          <Fragment key={`row${h}`}>
            <span className="tabular pr-1 text-right text-[10px] text-terminal-muted">{h}</span>
            {Array.from({ length: n }).map((_, a) => {
              const p = matrix[h]?.[a] ?? 0;
              const inten = max ? p / max : 0;
              return (
                <div key={`${h}-${a}`} title={`${h}-${a}: ${pct(p)}`}
                  className="aspect-square rounded-sm text-[9px] flex items-center justify-center tabular"
                  style={{ background: `rgba(56,189,248,${0.08 + inten * 0.85})`, color: inten > 0.5 ? '#04121c' : C.muted }}>
                  {p > 0.04 ? Math.round(p * 100) : ''}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// --- Histograma Monte Carlo (goles totales) ---------------------------------
function MCHistogram({ hist, runs }: { hist: number[]; runs: number }) {
  const max = Math.max(...hist, 0.001);
  return (
    <div>
      <div className="label mb-1">Monte Carlo · goles totales ({(runs / 1000).toFixed(0)}k sims)</div>
      <div className="flex items-end gap-1 h-20">
        {hist.map((p, g) => (
          <div key={g} className="flex h-full flex-1 flex-col items-center justify-end">
            <div className="w-full rounded-t" style={{ height: `${(p / max) * 100}%`, background: C.warn, minHeight: 2 }} />
            <span className="tabular text-[10px] text-terminal-muted mt-0.5">{g === hist.length - 1 ? `${g}+` : g}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Panel de explicación (#12) ---------------------------------------------
function ExplanationPanel({ a }: { a: MatchAnalysis }) {
  const factors = rankFactors(a.explanation).filter((f) => Math.abs(f.impact) > 1e-6).slice(0, 8);
  return (
    <div>
      <div className="label mb-2">¿Por qué? · factores del modelo</div>
      <div className="space-y-1.5">
        {factors.map((f) => {
          const w = Math.min(100, Math.abs(f.impact) * 140);
          const favHome = f.impact >= 0;
          return (
            <div key={f.key} className="flex items-center gap-2 text-xs">
              <span className="w-28 text-terminal-muted truncate">{f.label}</span>
              <div className="flex flex-1 items-center">
                <div className="flex w-1/2 justify-end">
                  {!favHome && <div className="h-2 rounded-l" style={{ width: `${w}%`, background: C.info }} />}
                </div>
                <div className="flex w-1/2">
                  {favHome && <div className="h-2 rounded-r" style={{ width: `${w}%`, background: C.up }} />}
                </div>
              </div>
              <span className="tabular w-12 text-right" style={{ color: favHome ? C.up : C.info }}>{f.detail}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MatchDashboard({ analysis, homeName, awayName }: { analysis: MatchAnalysis; homeName: string; awayName: string }) {
  const a = analysis;
  const labels: [string, string, string] = [homeName, 'Empate', awayName];
  const hasValue = a.value.length > 0;
  return (
    <div className="space-y-4">
      {/* Predicción principal + confianza + narrativa */}
      <div className="panel p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Donut home={a.final.home} draw={a.final.draw} away={a.final.away} labels={labels} />
          <ConfidenceGauge score={a.confidence.score} />
        </div>
        <p className="mt-3 rounded-md border border-terminal-border bg-terminal-bg px-3 py-2 text-sm">
          <span className="text-terminal-muted">Lectura del modelo: </span>{a.narrative}
        </p>
        {/* Miembros del ensemble: prob. de victoria local de cada motor */}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-terminal-muted">
          <span className="uppercase tracking-wider">Ensemble (1):</span>
          <span>Poisson <span className="tabular text-terminal-text">{pct0(a.poisson.oneXtwo.home)}</span></span>
          <span>Elo <span className="tabular text-terminal-text">{pct0(a.elo1x2.home)}</span></span>
          {a.ml1x2 && <span>ML <span className="tabular text-terminal-text">{pct0(a.ml1x2.home)}</span></span>}
          <span>Final <span className="tabular text-signal-up">{pct0(a.final.home)}</span></span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['λ local / visita', `${a.lambdaHome.toFixed(2)} / ${a.lambdaAway.toFixed(2)}`],
            ['Over 2.5', pct(a.poisson.over['2.5'])],
            ['BTTS', pct(a.poisson.btts)],
            ['Total esperado', a.montecarlo.avgTotalGoals.toFixed(2)],
          ].map(([l, v]) => (
            <div key={l} className="rounded-md border border-terminal-border bg-terminal-bg p-2">
              <div className="label">{l}</div>
              <div className="tabular mt-0.5 text-sm">{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Distribuciones */}
      <div className="panel p-4 grid gap-5 sm:grid-cols-2">
        <GoalBars matrix={a.poisson.scoreMatrix} title={`Goles ${homeName}`} axis="home" />
        <GoalBars matrix={a.poisson.scoreMatrix} title={`Goles ${awayName}`} axis="away" />
        <ScoreHeatmap matrix={a.poisson.scoreMatrix} />
        <MCHistogram hist={a.montecarlo.goalsHistogram} runs={a.montecarlo.runs} />
      </div>

      {/* Explicación + Valor */}
      <div className="panel p-4 grid gap-6 sm:grid-cols-2">
        <ExplanationPanel a={a} />
        <div>
          <div className="label mb-2">Valor vs mercado (EV / Kelly)</div>
          {hasValue ? (
            <table className="w-full text-xs">
              <thead className="text-terminal-muted">
                <tr><th className="text-left font-normal">Sel.</th><th className="text-right font-normal">Modelo</th><th className="text-right font-normal">Mercado</th><th className="text-right font-normal">EV</th><th className="text-right font-normal">Kelly</th></tr>
              </thead>
              <tbody className="tabular">
                {a.value.map((v) => (
                  <tr key={v.selection} className="border-t border-terminal-border">
                    <td className="py-1 capitalize">{v.selection === 'home' ? homeName : v.selection === 'away' ? awayName : 'Empate'}</td>
                    <td className="py-1 text-right">{pct0(v.modelProb)}</td>
                    <td className="py-1 text-right text-terminal-muted">{pct0(v.marketProb)}</td>
                    <td className="py-1 text-right" style={{ color: v.ev > 0 ? C.up : C.down }}>{v.ev > 0 ? '+' : ''}{(v.ev * 100).toFixed(0)}%</td>
                    <td className="py-1 text-right">{v.isValue ? `${(v.kelly * 100).toFixed(1)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-terminal-muted">Sin cuotas cargadas: el análisis de valor aparece cuando hay mercado para este partido.</p>
          )}
        </div>
      </div>
    </div>
  );
}
