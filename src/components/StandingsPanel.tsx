import { useEffect, useState } from 'react';
import { getStandingsOfficial, getStandingsElo } from '../lib/queries';
import type { StandingsOfficialRow, StandingsEloRow } from '../lib/types';

interface Props {
  leagueId: number;
  title: string;
}

export default function StandingsPanel({ leagueId, title }: Props) {
  const [tab, setTab] = useState<'official' | 'elo'>('official');
  const [official, setOfficial] = useState<StandingsOfficialRow[]>([]);
  const [elo, setElo] = useState<StandingsEloRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([getStandingsOfficial(leagueId), getStandingsElo(leagueId)])
      .then(([off, el]) => {
        if (active) {
          setOfficial(off);
          setElo(el);
        }
      })
      .catch((e) => active && setError(String(e?.message ?? e)))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [leagueId]);

  if (loading) return <div className="panel p-4 text-sm text-terminal-muted">Cargando posiciones…</div>;
  if (error) return <div className="panel p-4 text-sm text-signal-down">Error: {error}</div>;

  const data = tab === 'official' ? official : elo;

  return (
    <div className="panel p-4">
      <h2 className="text-sm font-semibold mb-4">{title}</h2>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-terminal-border">
        {[
          { key: 'official', label: 'Tabla Oficial' },
          { key: 'elo', label: 'Ranking Elo' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as 'official' | 'elo')}
            className={`-mb-px border-b-2 px-3 py-2 text-xs transition-colors ${
              tab === t.key
                ? 'border-signal-info text-terminal-text'
                : 'border-transparent text-terminal-muted hover:text-terminal-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-terminal-border text-terminal-muted">
              <th className="text-left py-2 px-2">Pos</th>
              <th className="text-left py-2 px-2">Equipo</th>
              {tab === 'official' ? (
                <>
                  <th className="text-right py-2 px-2">Pts</th>
                  <th className="text-center py-2 px-2">PJ</th>
                  <th className="text-center py-2 px-2">G</th>
                  <th className="text-center py-2 px-2">E</th>
                  <th className="text-center py-2 px-2">P</th>
                </>
              ) : (
                <th className="text-right py-2 px-2">Elo</th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={tab === 'official' ? 7 : 3} className="text-center py-4 text-terminal-muted">
                  Sin datos
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <tr
                  key={row.team_id}
                  className={`border-b border-terminal-border/50 ${
                    idx < 3 ? 'bg-signal-up/10' : idx >= data.length - 3 ? 'bg-signal-down/10' : ''
                  }`}
                >
                  <td className="py-2 px-2 font-medium">{'position' in row ? row.position : idx + 1}</td>
                  <td className="py-2 px-2 flex items-center gap-2">
                    {row.logo && <img src={row.logo} alt="" className="w-5 h-5 rounded-full" />}
                    <span>{row.team_name}</span>
                  </td>
                  {tab === 'official' && 'points' in row ? (
                    <>
                      <td className="text-right py-2 px-2 font-semibold">{row.points}</td>
                      <td className="text-center py-2 px-2">{row.played}</td>
                      <td className="text-center py-2 px-2 text-signal-up">{row.wins}</td>
                      <td className="text-center py-2 px-2">{row.draws}</td>
                      <td className="text-center py-2 px-2 text-signal-down">{row.losses}</td>
                    </>
                  ) : (
                    <td className="text-right py-2 px-2 font-semibold">
                      {'rating' in row ? Math.round(row.rating) : 'N/A'}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
