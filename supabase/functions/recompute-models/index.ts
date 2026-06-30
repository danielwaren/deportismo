import { createClient } from 'jsr:@supabase/supabase-js@2';
import { analyzeFixture, type TeamElo } from './model.ts';

// recompute-models — recalcula y PERSISTE las probabilidades del modelo CANÓNICO
// (Fase 1: Elo multi-componente + lambdas principistas ataque×defensa) para los
// partidos por jugar. Solo toca fixtures 'scheduled' (los jugados quedan
// congelados, sin look-ahead). Idempotente. La invoca el cron tras entrenar Elo.

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const MODEL_VERSION = 'dc-elo-multi-1.0.0';
const LEAGUE_AVG_GOALS: Record<number, number> = { 1: 1.45, 265: 1.2 };

/** Últimos Elo por componente (general/offensive/defensive) de un equipo. */
async function components(teamId: number): Promise<TeamElo> {
  const { data } = await admin
    .from('team_elo_history')
    .select('elo, component, as_of')
    .eq('team_id', teamId)
    .in('component', ['general', 'offensive', 'defensive'])
    .order('as_of', { ascending: false });
  const latest = (c: string) => {
    const r = (data ?? []).find((x) => x.component === c);
    return r ? Number(r.elo) : NaN;
  };
  const general = Number.isFinite(latest('general')) ? latest('general') : 1500;
  const offensive = Number.isFinite(latest('offensive')) ? latest('offensive') : general;
  const defensive = Number.isFinite(latest('defensive')) ? latest('defensive') : general;
  return { general, offensive, defensive };
}

/** Elo general medio de una liga (vía standings_elo, cacheado por api_id). */
const avgCache = new Map<number, number>();
async function leagueAvgElo(apiId: number): Promise<number> {
  if (avgCache.has(apiId)) return avgCache.get(apiId)!;
  const { data } = await admin.from('standings_elo').select('rating').eq('league_id', apiId);
  const ratings = (data ?? []).map((r) => Number(r.rating)).filter((n) => Number.isFinite(n));
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 1500;
  avgCache.set(apiId, avg);
  return avg;
}

Deno.serve(async () => {
  try {
    // Asegura la fila de versión (FK de match_model_outputs/predictions).
    await admin.from('model_versions').upsert(
      { version: MODEL_VERSION, description: 'Elo multi-componente + lambdas principistas (ataque×defensa) + ML' },
      { onConflict: 'version' },
    );

    // Pesos del modelo ML (si existen) para mezclar su 1X2 en el ensemble.
    const { data: mlRow } = await admin.from('ml_models').select('weights').eq('id', 'logreg').maybeSingle();
    const mlWeights = (mlRow?.weights as any) ?? null;

    const { data: fixtures } = await admin
      .from('fixtures')
      .select('id, home_team_id, away_team_id, league:league_id(api_id, elo_home_adv)')
      .eq('status', 'scheduled');

    let n = 0;
    for (const fx of fixtures ?? []) {
      const apiId = Number((fx as any).league?.api_id ?? 0);
      const homeAdvElo = Number((fx as any).league?.elo_home_adv ?? 0);
      const [home, away, avgElo] = await Promise.all([
        components(fx.home_team_id),
        components(fx.away_team_id),
        leagueAvgElo(apiId),
      ]);

      const r = analyzeFixture({
        home, away, leagueAvgElo: avgElo,
        leagueAvgGoals: LEAGUE_AVG_GOALS[apiId] ?? 1.35,
        homeAdvElo, mlWeights,
      });

      await admin.from('match_model_outputs').upsert(
        {
          fixture_id: fx.id,
          model_version: MODEL_VERSION,
          lambda_home: r.lambdaHome,
          lambda_away: r.lambdaAway,
          prob_home: r.final.home,
          prob_draw: r.final.draw,
          prob_away: r.final.away,
          prob_over_15: r.poisson.over['1.5'],
          prob_over_25: r.poisson.over['2.5'],
          prob_over_35: r.poisson.over['3.5'],
          prob_btts: r.poisson.btts,
          most_likely_score: `${r.poisson.mostLikelyScore[0]}-${r.poisson.mostLikelyScore[1]}`,
        },
        { onConflict: 'fixture_id,model_version' },
      );

      // Predicciones 1X2: modelo vs cuotas (si hay). flagged_value OFF.
      const { data: odds } = await admin
        .from('odds')
        .select('selection, implied_prob')
        .eq('fixture_id', fx.id)
        .eq('market', '1x2');
      const probs: Record<string, number> = { home: r.final.home, draw: r.final.draw, away: r.final.away };
      const rows = (['home', 'draw', 'away'] as const).map((sel) => {
        const o = odds?.find((x) => x.selection === sel);
        const mp = o ? Number(o.implied_prob) : null;
        return {
          fixture_id: fx.id,
          model_version: MODEL_VERSION,
          market: '1x2',
          selection: sel,
          model_prob: probs[sel],
          market_prob: mp,
          value_edge: mp != null ? probs[sel] - mp : null,
          flagged_value: false,
        };
      });
      await admin.from('predictions').delete().eq('fixture_id', fx.id);
      await admin.from('predictions').insert(rows);
      n++;
    }
    return Response.json({ recomputed: n, model: MODEL_VERSION });
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
});
