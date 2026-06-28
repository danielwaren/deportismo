import { useMemo, useState } from 'react';
import { analyzeMatch, type PredictInput } from '../lib/predict';

// Laboratorio de Simulación (what-if): el usuario mueve variables ANTES del
// partido y ve cómo cambian Poisson/Elo/Monte Carlo/Ensemble en tiempo real,
// comparado contra el escenario base. Posible porque @sti/model es puro y corre
// en cliente. Las 1X2 finales salen de la mezcla analítica (no del MC), así que
// los deltas son deterministas y limpios.

const C = { up: '#22c55e', down: '#ef4444', info: '#38bdf8', muted: '#5b6b7f' };
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const signed = (x: number, d = 1) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}`;

interface Overrides {
  injHome: number;
  injAway: number;
  formHome: number;
  formAway: number;
  rest: number;
  homeAdv: number;
  wPoisson: number;
  oddsOn: boolean;
  oH: number;
  oD: number;
  oA: number;
}

function Slider({ label, value, min, max, step, onChange, fmt }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; fmt?: (v: number) => string;
}) {
  return (
    <label className="block">
      <div className="flex justify-between text-xs">
        <span className="text-terminal-muted">{label}</span>
        <span className="tabular">{fmt ? fmt(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-signal-info" />
    </label>
  );
}

function Bar1x2({ p, base, color }: { p: number; base: number; color: string }) {
  const delta = p - base;
  return (
    <div className="flex items-center gap-2">
      <div className="h-5 flex-1 overflow-hidden rounded bg-terminal-bg">
        <div className="h-full" style={{ width: `${p * 100}%`, background: color }} />
      </div>
      <span className="tabular w-14 text-right text-sm">{pct(p)}</span>
      <span className="tabular w-12 text-right text-[11px]"
        style={{ color: Math.abs(delta) < 0.005 ? C.muted : delta > 0 ? C.up : C.down }}>
        {Math.abs(delta) < 0.005 ? '—' : `${signed(delta * 100, 1)}`}
      </span>
    </div>
  );
}

export default function SimulationLab({ input, homeName, awayName }: { input: PredictInput; homeName: string; awayName: string }) {
  const [ov, setOv] = useState<Overrides>({
    injHome: 0, injAway: 0, formHome: 0, formAway: 0, rest: 0,
    homeAdv: input.homeAdvElo, wPoisson: (input.weights?.poisson ?? 0.6),
    oddsOn: !!input.odds,
    oH: input.odds?.home ?? 2.1, oD: input.odds?.draw ?? 3.3, oA: input.odds?.away ?? 3.6,
  });
  const set = (patch: Partial<Overrides>) => setOv((o) => ({ ...o, ...patch }));
  const reset = () => setOv({
    injHome: 0, injAway: 0, formHome: 0, formAway: 0, rest: 0,
    homeAdv: input.homeAdvElo, wPoisson: input.weights?.poisson ?? 0.6,
    oddsOn: !!input.odds, oH: input.odds?.home ?? 2.1, oD: input.odds?.draw ?? 3.3, oA: input.odds?.away ?? 3.6,
  });

  const base = useMemo(() => analyzeMatch({ ...input, runs: 6000 }), [input]);
  const sim = useMemo(
    () =>
      analyzeMatch({
        ...input,
        runs: 6000,
        injuriesHome: ov.injHome, injuriesAway: ov.injAway,
        formHome: ov.formHome, formAway: ov.formAway,
        restAdvantage: ov.rest,
        homeAdvElo: ov.homeAdv,
        weights: { poisson: ov.wPoisson, elo: 1 - ov.wPoisson },
        odds: ov.oddsOn ? { home: ov.oH, draw: ov.oD, away: ov.oA } : undefined,
      }),
    [input, ov],
  );

  const dConf = sim.confidence.score - base.confidence.score;
  const homeValue = sim.value.find((v) => v.selection === 'home');

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <div className="label">Laboratorio de simulación · what-if</div>
        <button onClick={reset} className="rounded border border-terminal-border px-2 py-0.5 text-[11px] text-terminal-muted hover:text-terminal-text">
          Reset
        </button>
      </div>
      <p className="mt-1 text-xs text-terminal-muted">
        Modifica las variables y observa el impacto en vivo (Δ vs. escenario base).
      </p>

      <div className="mt-3 grid gap-5 lg:grid-cols-2">
        {/* Controles */}
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => set({ injHome: 0.5 })} className="rounded bg-terminal-bg px-2 py-1 text-[11px] hover:text-signal-info">Lesión clave local</button>
            <button onClick={() => set({ injAway: 0.5 })} className="rounded bg-terminal-bg px-2 py-1 text-[11px] hover:text-signal-info">Lesión clave visita</button>
            <button onClick={() => set({ rest: -0.5 })} className="rounded bg-terminal-bg px-2 py-1 text-[11px] hover:text-signal-info">Local −1 día descanso</button>
            <button onClick={() => set({ formHome: 0.8 })} className="rounded bg-terminal-bg px-2 py-1 text-[11px] hover:text-signal-info">Local en racha</button>
          </div>
          <Slider label={`Lesiones ${homeName}`} value={ov.injHome} min={0} max={1} step={0.05} onChange={(v) => set({ injHome: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Slider label={`Lesiones ${awayName}`} value={ov.injAway} min={0} max={1} step={0.05} onChange={(v) => set({ injAway: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Slider label={`Forma ${homeName}`} value={ov.formHome} min={-1} max={1} step={0.1} onChange={(v) => set({ formHome: v })} fmt={(v) => signed(v, 1)} />
          <Slider label={`Forma ${awayName}`} value={ov.formAway} min={-1} max={1} step={0.1} onChange={(v) => set({ formAway: v })} fmt={(v) => signed(v, 1)} />
          <Slider label="Descanso (local vs visita)" value={ov.rest} min={-1} max={1} step={0.1} onChange={(v) => set({ rest: v })} fmt={(v) => signed(v, 1)} />
          <Slider label="Ventaja de localía (Elo)" value={ov.homeAdv} min={0} max={150} step={5} onChange={(v) => set({ homeAdv: v })} fmt={(v) => `${v}`} />
          <Slider label="Peso Poisson ↔ Elo" value={ov.wPoisson} min={0} max={1} step={0.05} onChange={(v) => set({ wPoisson: v })} fmt={(v) => `${Math.round(v * 100)}/${Math.round((1 - v) * 100)}`} />

          <div className="rounded border border-terminal-border p-2">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={ov.oddsOn} onChange={(e) => set({ oddsOn: e.target.checked })} className="accent-signal-info" />
              <span className="text-terminal-muted">Cuotas (para EV/valor)</span>
            </label>
            {ov.oddsOn && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {([['oH', '1'], ['oD', 'X'], ['oA', '2']] as const).map(([k, l]) => (
                  <label key={k} className="text-[11px] text-terminal-muted">
                    {l}
                    <input type="number" step="0.01" min="1" value={ov[k]} onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<Overrides>)}
                      className="tabular mt-0.5 w-full rounded border border-terminal-border bg-terminal-bg px-1.5 py-1 text-sm text-terminal-text" />
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Resultado en vivo */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Bar1x2 p={sim.final.home} base={base.final.home} color={C.up} />
            <div className="flex justify-between text-[11px] text-terminal-muted"><span>{homeName}</span></div>
            <Bar1x2 p={sim.final.draw} base={base.final.draw} color={C.muted} />
            <div className="flex justify-between text-[11px] text-terminal-muted"><span>Empate</span></div>
            <Bar1x2 p={sim.final.away} base={base.final.away} color={C.info} />
            <div className="flex justify-between text-[11px] text-terminal-muted"><span>{awayName}</span></div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <Metric label="λ local / visita" v={`${sim.lambdaHome.toFixed(2)} / ${sim.lambdaAway.toFixed(2)}`} sub={`base ${base.lambdaHome.toFixed(2)}/${base.lambdaAway.toFixed(2)}`} />
            <Metric label="Over 2.5" v={pct(sim.poisson.over['2.5'])} sub={`Δ ${signed((sim.poisson.over['2.5'] - base.poisson.over['2.5']) * 100, 1)}`} />
            <Metric label="Confianza" v={`${sim.confidence.score}`} sub={Math.abs(dConf) < 0.5 ? '—' : `Δ ${signed(dConf, 0)}`} />
            <Metric label={`EV ${homeName}`} v={homeValue ? `${signed(homeValue.ev * 100, 0)}%` : '—'} sub={homeValue?.isValue ? `Kelly ${(homeValue.kelly * 100).toFixed(1)}%` : 'sin valor'} />
          </div>
          <p className="text-xs text-terminal-muted">{sim.narrative}</p>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, v, sub }: { label: string; v: string; sub: string }) {
  return (
    <div className="rounded border border-terminal-border bg-terminal-bg p-2">
      <div className="label">{label}</div>
      <div className="tabular mt-0.5">{v}</div>
      <div className="tabular text-[10px] text-terminal-muted">{sub}</div>
    </div>
  );
}
