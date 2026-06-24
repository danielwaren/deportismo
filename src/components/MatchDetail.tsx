import { useEffect, useState } from 'react';
import { getMatchDetail } from '../lib/queries';
import type { MatchDetailData } from '../lib/types';
import Prob1x2 from './Prob1x2';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-3">
      <div className="label">{label}</div>
      <div className="tabular mt-1 text-lg">{value}</div>
    </div>
  );
}

export default function MatchDetail({ id }: { id: number }) {
  const [data, setData] = useState<MatchDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    getMatchDetail(id)
      .then((d) => {
        if (!active) return;
        if (!d) setNotFound(true);
        else setData(d);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) return <p className="text-sm text-terminal-muted">Cargando ficha…</p>;
  if (notFound || !data) return <p className="text-sm text-signal-down">Partido no encontrado.</p>;

  const { fixture, model, predictions, eloHome, eloAway, source } = data;
  const valueBets = predictions.filter((p) => p.flagged_value);
  const order = { home: 0, draw: 1, away: 2 } as Record<string, number>;
  const market1x2 = predictions
    .filter((p) => p.market === '1x2')
    .sort((a, b) => (order[a.selection] ?? 9) - (order[b.selection] ?? 9));

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="panel p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-terminal-muted">
            {fixture.league?.name} · {new Date(fixture.kickoff).toLocaleString('es-CL')}
          </div>
          {source === 'demo' && (
            <span className="rounded bg-signal-warn/20 px-2 py-0.5 text-[11px] text-signal-warn">
              demo · modelo calculado en cliente
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center justify-center gap-6 text-center">
          <div className="flex-1">
            <div className="text-lg font-semibold">{fixture.home.name}</div>
            <div className="tabular text-xs text-terminal-muted">Elo {eloHome ?? '—'}</div>
          </div>
          <div className="text-terminal-muted">vs</div>
          <div className="flex-1">
            <div className="text-lg font-semibold">{fixture.away.name}</div>
            <div className="tabular text-xs text-terminal-muted">Elo {eloAway ?? '—'}</div>
          </div>
        </div>
      </div>

      {/* Salida del modelo */}
      <div className="panel p-4">
        <div className="label mb-3">Modelo · 1X2</div>
        {model ? (
          <>
            <Prob1x2
              home={model.prob_home}
              draw={model.prob_draw}
              away={model.prob_away}
              labels={[fixture.home.short_name ?? '1', 'X', fixture.away.short_name ?? '2']}
            />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Over 2.5" value={pct(model.prob_over_25)} />
              <Stat label="BTTS" value={pct(model.prob_btts)} />
              <Stat label="Marcador" value={model.most_likely_score} />
              <Stat label="λ esperados" value={`${model.lambda_home.toFixed(2)}/${model.lambda_away.toFixed(2)}`} />
            </div>
          </>
        ) : (
          <p className="text-sm text-terminal-muted">
            Modelo no calculado aún. Ejecuta la función <code className="font-mono">run-model</code> para este partido.
          </p>
        )}
      </div>

      {/* Modelo vs Mercado */}
      <div className="panel p-4">
        <div className="label mb-3">Modelo vs Mercado (1X2)</div>
        {market1x2.length ? (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-terminal-muted">
                  <th className="text-left font-normal">Sel.</th>
                  <th className="text-right font-normal">Modelo</th>
                  <th className="text-right font-normal">Mercado</th>
                  <th className="text-right font-normal">Edge</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {market1x2.map((p, i) => {
                  const edge = p.value_edge ?? 0;
                  return (
                    <tr key={i} className="border-t border-terminal-border">
                      <td className="py-1.5 capitalize">{p.selection}</td>
                      <td className="py-1.5 text-right">{pct(p.model_prob)}</td>
                      <td className="py-1.5 text-right text-terminal-muted">
                        {p.market_prob != null ? pct(p.market_prob) : '—'}
                      </td>
                      <td className={`py-1.5 text-right ${edge > 0 ? 'text-signal-up' : 'text-signal-down'}`}>
                        {edge > 0 ? '+' : ''}{(edge * 100).toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {valueBets.length === 0 && (
              <p className="mt-3 text-xs text-terminal-muted">
                Sin value señalado: el modelo aún no está calibrado (Elo anclado al mercado en
                cold-start). El edge se activa como señal tras calibrar con resultados reales.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-terminal-muted">
            Sin cuotas cargadas para este partido.
          </p>
        )}
      </div>

      {/* Contexto pendiente de datos */}
      <div className="grid gap-4 sm:grid-cols-3">
        {['Forma reciente', 'Lesionados', 'H2H'].map((s) => (
          <div key={s} className="panel p-4">
            <div className="label">{s}</div>
            <p className="mt-2 text-xs text-terminal-muted">
              {source === 'demo' ? 'Disponible al conectar Supabase + sync.' : 'Sin datos: corre el sync.'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
