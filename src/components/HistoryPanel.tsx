import { useEffect, useMemo, useState } from 'react';
import {
  brierScore, logLoss, calibrationError,
  tradingMetrics, bankrollCurve, maxDrawdown, profitFactor, sharpeRatio,
} from '@sti/model';
import { getModelTrackRecord, type TrackRecord } from '../lib/queries';

const C = { up: '#22c55e', down: '#ef4444', info: '#38bdf8', muted: '#5b6b7f', border: '#1c2533' };

function KPI({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'up' | 'down' | 'neutral' }) {
  const color = tone === 'up' ? C.up : tone === 'down' ? C.down : undefined;
  return (
    <div className="rounded-md border border-terminal-border bg-terminal-bg p-3">
      <div className="label">{label}</div>
      <div className="tabular mt-1 text-lg" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="tabular text-[10px] text-terminal-muted">{sub}</div>}
    </div>
  );
}

function BankrollCurve({ curve }: { curve: number[] }) {
  const w = 520, h = 130, pad = 6;
  if (curve.length < 2) return null;
  const min = Math.min(...curve), max = Math.max(...curve);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (curve.length - 1)) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - 2 * pad);
  const pts = curve.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const start = curve[0]!, end = curve[curve.length - 1]!;
  const color = end >= start ? C.up : C.down;
  const baseY = y(start);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <line x1={pad} y1={baseY} x2={w - pad} y2={baseY} stroke={C.border} strokeWidth="1" strokeDasharray="3 3" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export default function HistoryPanel() {
  const [tr, setTr] = useState<TrackRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getModelTrackRecord()
      .then((d) => active && setTr(d))
      .catch((e) => active && setError(String(e?.message ?? e)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const metrics = useMemo(() => {
    if (!tr) return null;
    const cp = tr.calibrationPoints;
    const tm = tradingMetrics(tr.bets);
    const curve = bankrollCurve(tr.bets, 100);
    return {
      brier: brierScore(cp), logloss: logLoss(cp), ece: calibrationError(cp),
      tm, curve, mdd: maxDrawdown(curve), pf: profitFactor(tr.bets), sharpe: sharpeRatio(tr.bets),
    };
  }, [tr]);

  if (loading) return <div className="panel p-4 text-sm text-terminal-muted">Cargando histórico…</div>;
  if (error) return <div className="panel p-4 text-sm text-signal-down">Error: {error}</div>;
  if (!tr || !metrics) return null;

  const hasBets = tr.bets.length > 0;
  const fmtPct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const signedPct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;

  return (
    <div className="space-y-4">
      {/* Precisión del modelo (real, sobre predicciones resueltas) */}
      <div className="panel p-4">
        <div className="flex items-center justify-between">
          <span className="label">Precisión del modelo</span>
          <span className="text-[11px] text-terminal-muted">{tr.totalPicks} partidos resueltos</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KPI label="Aciertos (pick)" value={fmtPct(tr.hitRate)} tone={tr.hitRate >= 0.5 ? 'up' : 'neutral'} />
          <KPI label="Brier" value={metrics.brier.toFixed(3)} sub="0 perfecto · 0.25 azar" />
          <KPI label="Log-loss" value={metrics.logloss.toFixed(3)} />
          <KPI label="Error calibración" value={fmtPct(metrics.ece)} sub="ECE" />
        </div>
      </div>

      {/* Backtest de banca (sobre picks con cuota real) */}
      <div className="panel p-4">
        <div className="flex items-center justify-between">
          <span className="label">Backtest de banca</span>
          <span className="text-[11px] text-terminal-muted">{tr.bets.length} apuestas con cuota</span>
        </div>
        {hasBets ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KPI label="ROI / Yield" value={signedPct(metrics.tm.roi)} tone={metrics.tm.roi >= 0 ? 'up' : 'down'} />
              <KPI label="Beneficio" value={`${metrics.tm.profit >= 0 ? '+' : ''}${metrics.tm.profit.toFixed(2)}u`} tone={metrics.tm.profit >= 0 ? 'up' : 'down'} />
              <KPI label="Hit rate" value={fmtPct(metrics.tm.hitRate)} />
              <KPI label="Profit factor" value={Number.isFinite(metrics.pf) ? metrics.pf.toFixed(2) : '∞'} tone={metrics.pf >= 1 ? 'up' : 'down'} />
              <KPI label="Max drawdown" value={fmtPct(metrics.mdd)} tone="down" />
              <KPI label="Sharpe" value={metrics.sharpe.toFixed(2)} />
              <KPI label="CLV medio" value={signedPct(metrics.tm.clv)} tone={metrics.tm.clv >= 0 ? 'up' : 'down'} />
              <KPI label="Apostado" value={`${metrics.tm.staked.toFixed(0)}u`} />
            </div>
            <div className="mt-4">
              <div className="label mb-1">Curva de banca (100u inicial)</div>
              <BankrollCurve curve={metrics.curve} />
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-terminal-muted">
            Aún no hay picks con cuota cerrada suficientes para el backtest de banca (ROI/Sharpe/drawdown).
            Las métricas aparecen a medida que se acumulan cuotas de mercado en los partidos resueltos.
          </p>
        )}
      </div>
    </div>
  );
}
