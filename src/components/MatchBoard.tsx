import { useEffect, useState } from 'react';
import { isConfigured, listFixtures } from '../lib/queries';
import type { FixtureRow } from '../lib/types';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const LEAGUES = [
  { key: 'mundial', label: 'Mundial', api: 1 },
  { key: 'chile', label: 'Chile · Primera', api: 265 },
] as const;

export default function MatchBoard() {
  const [search, setSearch] = useState('');
  const [league, setLeague] = useState<(typeof LEAGUES)[number]>(LEAGUES[0]);
  const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    listFixtures(search, league.api)
      .then((rows) => active && setFixtures(rows))
      .catch((e) => active && setError(String(e?.message ?? e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [search, league]);

  return (
    <div className="panel p-4">
      {/* Pestañas de liga */}
      <div className="mb-4 flex gap-1 border-b border-terminal-border">
        {LEAGUES.map((l) => (
          <button
            key={l.key}
            onClick={() => setLeague(l)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              league.key === l.key
                ? 'border-signal-info text-terminal-text'
                : 'border-transparent text-terminal-muted hover:text-terminal-text'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <label className="label" htmlFor="search">Buscar partido</label>
        {!isConfigured && (
          <span className="rounded bg-signal-warn/20 px-2 py-0.5 text-[11px] text-signal-warn">
            modo demo · sin Supabase
          </span>
        )}
      </div>
      <input
        id="search"
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Equipo…"
        className="mt-2 w-full rounded-md border border-terminal-border bg-terminal-bg px-3 py-2 text-sm outline-none placeholder:text-terminal-muted focus:border-signal-info"
      />

      <div className="mt-4 space-y-2">
        {loading && <p className="text-sm text-terminal-muted">Cargando…</p>}
        {error && <p className="text-sm text-signal-down">Error: {error}</p>}
        {!loading && !error && fixtures.length === 0 && (
          <p className="text-sm text-terminal-muted">Sin partidos en esta liga.</p>
        )}
        {fixtures.map((f) => {
          const finished = f.status === 'finished' && f.home_goals != null && f.away_goals != null;
          return (
            <a
              key={f.id}
              href={`/match/${f.id}`}
              className="flex items-center justify-between rounded-md border border-terminal-border bg-terminal-bg px-3 py-2.5 transition-colors hover:border-signal-info"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">
                  {f.home.name} <span className="text-terminal-muted">vs</span> {f.away.name}
                </span>
                {f.round && (
                  <span className="hidden rounded bg-terminal-border px-1.5 py-0.5 text-[10px] text-terminal-muted sm:inline">
                    {f.round}
                  </span>
                )}
              </div>
              {finished ? (
                <span className="tabular rounded bg-terminal-border px-2 py-0.5 text-xs">
                  {f.home_goals}-{f.away_goals}
                </span>
              ) : (
                <span className="tabular text-xs text-terminal-muted">{fmtDate(f.kickoff)}</span>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}
