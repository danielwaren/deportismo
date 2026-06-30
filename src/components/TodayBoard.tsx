import { useEffect, useState } from 'react';
import { getUpcomingMatches, type UpcomingMatch } from '../lib/queries';

const C = { up: '#22c55e', info: '#38bdf8', muted: '#5b6b7f' };
const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short' });

function pickLabel(m: UpcomingMatch): { txt: string; pct: number } | null {
  if (!m.pick || !m.probs) return null;
  const txt = m.pick === 'home' ? m.homeShort || m.home : m.pick === 'away' ? m.awayShort || m.away : 'Empate';
  return { txt, pct: Math.round(m.probs[m.pick] * 100) };
}

function MatchCard({ m }: { m: UpcomingMatch }) {
  const p = pickLabel(m);
  return (
    <a
      href={`/match/${m.id}`}
      className="block rounded-lg border border-terminal-border bg-terminal-bg p-3 transition-colors hover:border-signal-info"
    >
      <div className="flex items-center justify-between text-[11px] text-terminal-muted">
        <span className="truncate">{m.leagueName}</span>
        <span className="tabular">{fmtTime(m.kickoff)}</span>
      </div>
      <div className="mt-2 space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{m.home}</span>
          {m.probs && <span className="tabular text-xs" style={{ color: m.pick === 'home' ? C.up : C.muted }}>{Math.round(m.probs.home * 100)}%</span>}
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{m.away}</span>
          {m.probs && <span className="tabular text-xs" style={{ color: m.pick === 'away' ? C.info : C.muted }}>{Math.round(m.probs.away * 100)}%</span>}
        </div>
      </div>
      {p && (
        <div className="mt-2 flex items-center justify-between border-t border-terminal-border pt-2">
          <span className="text-[10px] uppercase tracking-wider text-terminal-muted">Pronóstico</span>
          <span className="rounded bg-signal-up/15 px-2 py-0.5 text-[11px] text-signal-up">{p.txt} · {p.pct}%</span>
        </div>
      )}
    </a>
  );
}

export default function TodayBoard() {
  const [matches, setMatches] = useState<UpcomingMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getUpcomingMatches(24)
      .then((m) => active && setMatches(m))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  if (loading) return <div className="panel p-4 text-sm text-terminal-muted">Cargando partidos…</div>;

  const now = new Date();
  const today = matches.filter((m) => isSameDay(new Date(m.kickoff), now));
  const list = today.length ? today : matches.slice(0, 12);
  const heading = today.length ? 'Partidos de hoy' : 'Próximos partidos';

  // Destacados: top 3 por confianza del pick.
  const featured = [...matches]
    .filter((m) => m.probs)
    .sort((a, b) => Math.max(b.probs!.home, b.probs!.draw, b.probs!.away) - Math.max(a.probs!.home, a.probs!.draw, a.probs!.away))
    .slice(0, 3);

  return (
    <div className="space-y-5">
      {featured.length > 0 && (
        <section>
          <h2 className="label mb-2">Pronósticos destacados</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {featured.map((m) => {
              const p = pickLabel(m)!;
              return (
                <a key={m.id} href={`/match/${m.id}`} className="block rounded-lg border border-signal-up/30 bg-signal-up/5 p-3 transition-colors hover:border-signal-up">
                  <div className="text-[11px] text-terminal-muted">{m.leagueName} · {fmtDay(m.kickoff)}</div>
                  <div className="mt-1 text-sm font-medium">{m.home} <span className="text-terminal-muted">vs</span> {m.away}</div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-lg font-semibold text-signal-up">{p.pct}%</span>
                    <span className="text-xs text-terminal-muted">{p.txt}</span>
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="label mb-2">{heading}</h2>
        {list.length === 0 ? (
          <div className="panel p-4 text-sm text-terminal-muted">No hay partidos programados. Usa el buscador para revisar cualquier equipo.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((m) => <MatchCard key={m.id} m={m} />)}
          </div>
        )}
      </section>
    </div>
  );
}
