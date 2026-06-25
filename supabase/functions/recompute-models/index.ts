import { createClient } from 'jsr:@supabase/supabase-js@2';
import { combineEnsemble } from './model.ts';

// recompute-models — recalcula las probabilidades del modelo (Dixon-Coles + Elo)
// para TODOS los partidos por jugar, leyendo el Elo actual (que el cron entrena).
// Solo toca fixtures 'scheduled': los jugados quedan congelados (sin look-ahead).
// La invoca el cron tras el entrenamiento de Elo. Es idempotente.

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

async function latestElo(teamId: number): Promise<number> {
  const { data } = await admin
    .from('team_elo_history')
    .select('elo')
    .eq('team_id', teamId)
    .order('as_of', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? Number(data.elo) : 1500;
}

Deno.serve(async () => {
  try {
    const { data: fixtures } = await admin
      .from('fixtures')
      .select('id, home_team_id, away_team_id, league:league_id(elo_home_adv)')
      .eq('status', 'scheduled');

    let n = 0;
    for (const fx of fixtures ?? []) {
      const [eh, ea] = await Promise.all([latestElo(fx.home_team_id), latestElo(fx.away_team_id)]);
      // Ventaja de local de la liga (0 en torneos neutros como el Mundial, ~65 en liga).
      const homeAdv = Number((fx as any).league?.elo_home_adv ?? 0);
      const r = combineEnsemble({ eloHome: eh, eloAway: ea, homeAdvantage: homeAdv, context: 0 });

      await admin.from('match_model_outputs').upsert(
        {
          fixture_id: fx.id,
          model_version: 'dc-elo-ctx-0.1.0',
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

      // Predicciones 1X2: modelo vs cuotas (si hay). flagged_value OFF (modelo
      // aún sin validar probabilísticamente).
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
          model_version: 'dc-elo-ctx-0.1.0',
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
    return Response.json({ recomputed: n });
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
});
