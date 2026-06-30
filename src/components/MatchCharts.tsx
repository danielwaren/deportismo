import { useEffect, useState } from 'react';
import { getMatchChartData, type MatchChartData } from '../lib/queries';

const C = { up: '#22c55e', info: '#38bdf8', muted: '#5b6b7f', border: '#1c2533', text: '#cdd6e4' };

// --- Evolución de Elo (líneas, últimos ~24 registros) -----------------------
function EloEvolution({ data, homeName, awayName }: { data: MatchChartData; homeName: string; awayName: string }) {
  const hs = data.home.history, as = data.away.history;
  const all = [...hs, ...as];
  if (all.length < 2) return <p className="text-xs text-terminal-muted">Sin historial de Elo suficiente.</p>;
  const min = Math.min(...all), max = Math.max(...all), span = max - min || 1;
  const w = 520, h = 140, pad = 8;
  const line = (arr: number[], color: string) => {
    if (arr.length < 2) return null;
    const pts = arr.map((v, i) => `${pad + (i / (arr.length - 1)) * (w - 2 * pad)},${h - pad - ((v - min) / span) * (h - 2 * pad)}`).join(' ');
    return <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />;
  };
  return (
    <div>
      <div className="label mb-1">Evolución de Elo (últimos {Math.max(hs.length, as.length)})</div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        {line(hs, C.up)}
        {line(as, C.info)}
      </svg>
      <div className="flex gap-4 text-[11px]">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: C.up }} />{homeName} {hs.length ? Math.round(hs[hs.length - 1]!) : '—'}</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: C.info }} />{awayName} {as.length ? Math.round(as[as.length - 1]!) : '—'}</span>
      </div>
    </div>
  );
}

// --- Radar de fuerza (5 ejes, dos equipos) ----------------------------------
function StrengthRadar({ data, homeName, awayName }: { data: MatchChartData; homeName: string; awayName: string }) {
  const axes = ['General', 'Ataque', 'Defensa', 'Local', 'Visita'];
  const lo = data.leagueAvgElo - 300, range = 600;
  const norm = (v: number) => Math.max(0.05, Math.min(1, (v - lo) / range));
  const vals = (c: typeof data.home.components) => [norm(c.general), norm(c.offensive), norm(c.defensive), norm(c.home), norm(c.away)];
  const cx = 110, cy = 105, R = 80;
  const pt = (i: number, r: number) => {
    const ang = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    return [cx + Math.cos(ang) * R * r, cy + Math.sin(ang) * R * r];
  };
  const poly = (vs: number[]) => vs.map((v, i) => pt(i, v).join(',')).join(' ');
  const hv = vals(data.home.components), av = vals(data.away.components);
  return (
    <div>
      <div className="label mb-1">Radar de fuerza</div>
      <svg viewBox="0 0 220 200" className="w-full max-w-[260px]">
        {[0.25, 0.5, 0.75, 1].map((r) => (
          <polygon key={r} points={[0, 1, 2, 3, 4].map((i) => pt(i, r).join(',')).join(' ')} fill="none" stroke={C.border} strokeWidth="1" />
        ))}
        {axes.map((a, i) => {
          const [x, y] = pt(i, 1.18);
          return <text key={a} x={x} y={y} fill={C.muted} fontSize="9" textAnchor="middle" dominantBaseline="middle">{a}</text>;
        })}
        <polygon points={poly(av)} fill={C.info + '33'} stroke={C.info} strokeWidth="1.5" />
        <polygon points={poly(hv)} fill={C.up + '33'} stroke={C.up} strokeWidth="1.5" />
      </svg>
      <div className="flex gap-4 text-[11px]">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: C.up }} />{homeName}</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: C.info }} />{awayName}</span>
      </div>
    </div>
  );
}

export default function MatchCharts({ homeId, awayId, leagueApiId, homeName, awayName }: {
  homeId: number; awayId: number; leagueApiId: number; homeName: string; awayName: string;
}) {
  const [data, setData] = useState<MatchChartData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getMatchChartData(homeId, awayId, leagueApiId)
      .then((d) => active && setData(d))
      .catch(() => active && setData(null))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [homeId, awayId, leagueApiId]);

  if (loading) return <div className="panel p-4 text-sm text-terminal-muted">Cargando gráficos…</div>;
  if (!data) return null;

  return (
    <div className="panel p-4 grid gap-6 sm:grid-cols-2">
      <EloEvolution data={data} homeName={homeName} awayName={awayName} />
      <StrengthRadar data={data} homeName={homeName} awayName={awayName} />
    </div>
  );
}
