import { useEffect, useState } from 'react';
import { isConfigured, listFixtures } from '../lib/queries';
import type { FixtureRow } from '../lib/types';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function MatchBoard() {
  const [search, setSearch] = useState('');
  const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listFixtures(search)
      .then((rows) => active && setFixtures(rows))
      .catch((e) => active && setError(String(e?.message ?? e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [search]);

  return (
    <div className="panel p-4">
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
        placeholder="Equipo (ej. Suiza, Catar)…"
        className="mt-2 w-full rounded-md border border-terminal-border bg-terminal-bg px-3 py-2 text-sm outline-none placeholder:text-terminal-muted focus:border-signal-info"
      />

      <div className="mt-4 space-y-2">
        {loading && <p className="text-sm text-terminal-muted">Cargando…</p>}
        {error && <p className="text-sm text-signal-down">Error: {error}</p>}
        {!loading && !error && fixtures.length === 0 && (
          <p className="text-sm text-terminal-muted">
            Sin partidos. {isConfigured ? 'Corre sync-fixtures para poblar.' : ''}
          </p>
        )}
        {fixtures.map((f) => (
          <a
            key={f.id}
            href={`/match/${f.id}`}
            className="flex items-center justify-between rounded-md border border-terminal-border bg-terminal-bg px-3 py-2.5 transition-colors hover:border-signal-info"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">
                {f.home.name} <span className="text-terminal-muted">vs</span> {f.away.name}
              </span>
              {f.league?.name && (
                <span className="hidden rounded bg-terminal-border px-1.5 py-0.5 text-[10px] text-terminal-muted sm:inline">
                  {f.league.name}
                </span>
              )}
            </div>
            <span className="tabular text-xs text-terminal-muted">{fmtDate(f.kickoff)}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
