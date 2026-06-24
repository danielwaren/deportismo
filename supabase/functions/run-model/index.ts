import { admin } from '../_shared/supabaseAdmin.ts';
import {
  combineEnsemble,
  contextModifier,
  formScore,
  h2hScore,
  injurySeverity,
  restAdvantage,
  type FormMatch,
} from '../../../packages/model/src/index.ts';

// run-model — calcula la salida del modelo para un fixture y la PERSISTE.
// NO consume cuota de API-Football: lee todo de la BD (que pobló el sync).
// Body: { "fixtureId": 7 }   (id LOCAL de fixtures)

const DAY = 24 * 3600 * 1000;

async function latestElo(teamId: number): Promise<number> {
  const { data } = await admin
    .from('team_elo_history')
    .select('elo')
    .eq('team_id', teamId)
    .order('as_of', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.elo ?? 1500;
}

async function teamInjurySeverity(teamId: number): Promise<number> {
  const { data: players } = await admin
    .from('players')
    .select('id, importance_proxy')
    .eq('team_id', teamId);
  if (!players?.length) return 0;

  const importance: number[] = [];
  for (const p of players) {
    const { data: st } = await admin
      .from('player_status')
      .select('status')
      .eq('player_id', p.id)
      .order('valid_from', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (st && st.status !== 'available') importance.push(Number(p.importance_proxy ?? 0));
  }
  return injurySeverity(importance);
}

async function recentForm(teamId: number, teamElo: number, window: number): Promise<{ form: FormMatch[]; lastKickoff: number | null }> {
  const { data } = await admin
    .from('fixtures')
    .select('home_team_id, away_team_id, home_goals, away_goals, kickoff')
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .eq('status', 'finished')
    .order('kickoff', { ascending: false })
    .limit(window);

  const form: FormMatch[] = [];
  let lastKickoff: number | null = null;
  (data ?? []).forEach((fx, i) => {
    if (i === 0) lastKickoff = new Date(fx.kickoff).getTime();
    const isHome = fx.home_team_id === teamId;
    const gf = isHome ? fx.home_goals : fx.away_goals;
    const ga = isHome ? fx.away_goals : fx.home_goals;
    if (gf == null || ga == null) return;
    const result = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
    // opponentElo aproximado con teamElo (afinable cuando haya Elo histórico denso).
    form.push({ result, opponentElo: teamElo, teamElo, ageInMatches: i });
  });
  return { form, lastKickoff };
}

async function headToHead(homeId: number, awayId: number): Promise<Array<'home' | 'away' | 'draw'>> {
  const { data } = await admin
    .from('fixtures')
    .select('home_team_id, home_goals, away_goals, kickoff')
    .or(
      `and(home_team_id.eq.${homeId},away_team_id.eq.${awayId}),and(home_team_id.eq.${awayId},away_team_id.eq.${homeId})`,
    )
    .eq('status', 'finished')
    .order('kickoff', { ascending: false })
    .limit(10);

  return (data ?? [])
    .filter((fx) => fx.home_goals != null && fx.away_goals != null)
    .map((fx) => {
      if (fx.home_goals === fx.away_goals) return 'draw';
      const homeWon = fx.home_goals > fx.away_goals;
      const currentHomeWasHome = fx.home_team_id === homeId;
      return homeWon === currentHomeWasHome ? 'home' : 'away';
    });
}

Deno.serve(async (req) => {
  try {
    const { fixtureId } = await req.json().catch(() => ({}));
    if (!fixtureId) return Response.json({ error: 'Falta "fixtureId".' }, { status: 400 });

    const { data: fx, error: fxErr } = await admin
      .from('fixtures')
      .select('id, home_team_id, away_team_id, kickoff, importance_weight')
      .eq('id', fixtureId)
      .single();
    if (fxErr || !fx) return Response.json({ error: 'Fixture no encontrado.' }, { status: 404 });

    const { data: cfg } = await admin
      .from('ensemble_config')
      .select('*')
      .eq('is_active', true)
      .maybeSingle();
    const { data: mv } = await admin
      .from('model_versions')
      .select('version')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const weights = {
      poisson: Number(cfg?.poisson_weight ?? 0.5),
      elo: Number(cfg?.elo_weight ?? 0.3),
      context: Number(cfg?.context_weight ?? 0.2),
    };
    const homeAdvantage = Number(cfg?.elo_home_adv ?? 65);
    const valueThreshold = Number(cfg?.value_threshold ?? 0.05);
    const formWindow = Number(cfg?.form_window ?? 10);

    const [eloHome, eloAway] = await Promise.all([
      latestElo(fx.home_team_id),
      latestElo(fx.away_team_id),
    ]);

    const [injHome, injAway] = await Promise.all([
      teamInjurySeverity(fx.home_team_id),
      teamInjurySeverity(fx.away_team_id),
    ]);

    const [formH, formA] = await Promise.all([
      recentForm(fx.home_team_id, eloHome, formWindow),
      recentForm(fx.away_team_id, eloAway, formWindow),
    ]);

    const h2h = await headToHead(fx.home_team_id, fx.away_team_id);

    const daysHome = formH.lastKickoff ? (Date.now() - formH.lastKickoff) / DAY : 7;
    const daysAway = formA.lastKickoff ? (Date.now() - formA.lastKickoff) / DAY : 7;

    const ctx = contextModifier({
      injuriesHome: injHome,
      injuriesAway: injAway,
      formHome: formScore(formH.form),
      formAway: formScore(formA.form),
      restAdvantage: restAdvantage(daysHome, daysAway),
      h2h: h2hScore(h2h),
      pressure: 0, // se puebla con context_notes / importancia del torneo
    });

    const result = combineEnsemble({
      eloHome,
      eloAway,
      weights,
      homeAdvantage,
      dcParams: { rho: Number(cfg?.dc_rho ?? -0.1), decayHalflife: Number(cfg?.decay_halflife ?? 8) },
      context: ctx,
    });

    // Persistir la salida completa con snapshot de pesos.
    await admin.from('match_model_outputs').upsert(
      {
        fixture_id: fx.id,
        model_version: mv?.version ?? null,
        lambda_home: result.lambdaHome,
        lambda_away: result.lambdaAway,
        prob_home: result.final.home,
        prob_draw: result.final.draw,
        prob_away: result.final.away,
        prob_over_15: result.poisson.over['1.5'],
        prob_over_25: result.poisson.over['2.5'],
        prob_over_35: result.poisson.over['3.5'],
        prob_btts: result.poisson.btts,
        most_likely_score: `${result.poisson.mostLikelyScore[0]}-${result.poisson.mostLikelyScore[1]}`,
        score_matrix: result.poisson.scoreMatrix,
        weights_snapshot: cfg ?? weights,
      },
      { onConflict: 'fixture_id,model_version' },
    );

    // Comparar contra cuotas 1X2 cargadas -> value bets.
    const { data: odds } = await admin
      .from('odds')
      .select('selection, implied_prob')
      .eq('fixture_id', fx.id)
      .eq('market', '1x2');

    const modelProbs: Record<string, number> = {
      home: result.final.home,
      draw: result.final.draw,
      away: result.final.away,
    };
    const preds = (['home', 'draw', 'away'] as const).map((sel) => {
      const market = odds?.find((o) => o.selection === sel);
      const marketProb = market ? Number(market.implied_prob) : null;
      const edge = marketProb != null ? modelProbs[sel] - marketProb : null;
      return {
        fixture_id: fx.id,
        model_version: mv?.version ?? null,
        market: '1x2',
        selection: sel,
        model_prob: modelProbs[sel],
        market_prob: marketProb,
        value_edge: edge,
        flagged_value: edge != null && edge >= valueThreshold,
      };
    });
    await admin.from('predictions').insert(preds);

    return Response.json({
      fixtureId: fx.id,
      context: ctx,
      final: result.final,
      over25: result.poisson.over['2.5'],
      btts: result.poisson.btts,
      mostLikelyScore: `${result.poisson.mostLikelyScore[0]}-${result.poisson.mostLikelyScore[1]}`,
      valueBets: preds.filter((p) => p.flagged_value),
    });
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
});
