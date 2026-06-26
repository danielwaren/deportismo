import type { CalibrationPoint } from '@sti/model';
import { supabase } from './supabase';
import { DEMO_CONFIG, DEMO_FIXTURES, demoCalibration, demoDetail } from './demo';
import type {
  EnsembleConfigRow,
  FixtureRow,
  MatchDetailData,
  ModelOutputRow,
  PredictionRow,
} from './types';

export const isConfigured =
  !!import.meta.env.PUBLIC_SUPABASE_URL && !!import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

const FIXTURE_SELECT =
  'id,kickoff,status,round,home_goals,away_goals,' +
  'home:home_team_id(id,name,short_name,logo),' +
  'away:away_team_id(id,name,short_name,logo),' +
  'league:league_id!inner(api_id,name)';

/** Partidos de una liga (api_id: 1 = Mundial, 265 = Primera de Chile). */
export async function listFixtures(search = '', leagueApiId?: number): Promise<FixtureRow[]> {
  if (!isConfigured) {
    if (leagueApiId && leagueApiId !== 1) return [];
    const t = search.toLowerCase();
    return DEMO_FIXTURES.filter(
      (f) => !t || f.home.name.toLowerCase().includes(t) || f.away.name.toLowerCase().includes(t),
    );
  }
  let q = supabase.from('fixtures').select(FIXTURE_SELECT).order('kickoff', { ascending: false }).limit(80);
  if (leagueApiId != null) q = q.eq('league.api_id', leagueApiId);
  const { data, error } = await q;
  if (error) throw error;
  let rows = (data ?? []) as unknown as FixtureRow[];
  if (search) {
    const t = search.toLowerCase();
    rows = rows.filter((f) => f.home.name.toLowerCase().includes(t) || f.away.name.toLowerCase().includes(t));
  }
  return rows;
}

async function latestElo(teamId: number): Promise<number | null> {
  const { data } = await supabase
    .from('team_elo_history')
    .select('elo')
    .eq('team_id', teamId)
    .order('as_of', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? Number(data.elo) : null;
}

/** Ficha completa de un partido. */
export async function getMatchDetail(id: number): Promise<MatchDetailData | null> {
  if (!isConfigured) return demoDetail(id);

  const { data: fixture, error } = await supabase
    .from('fixtures')
    .select(FIXTURE_SELECT)
    .eq('id', id)
    .single();
  if (error || !fixture) return null;
  const fx = fixture as unknown as FixtureRow;

  const [{ data: model }, { data: preds }, eloHome, eloAway] = await Promise.all([
    supabase
      .from('match_model_outputs')
      .select('lambda_home,lambda_away,prob_home,prob_draw,prob_away,prob_over_25,prob_btts,most_likely_score')
      .eq('fixture_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('predictions')
      .select('market,selection,model_prob,market_prob,value_edge,flagged_value')
      .eq('fixture_id', id)
      .order('created_at', { ascending: false }),
    latestElo(fx.home.id),
    latestElo(fx.away.id),
  ]);

  return {
    fixture: fx,
    model: (model as ModelOutputRow) ?? null,
    predictions: (preds as PredictionRow[]) ?? [],
    eloHome,
    eloAway,
    source: 'supabase',
  };
}

/** Puntos de calibración (prob predicha vs resultado real) para 1X2 resueltos. */
export async function getCalibrationPoints(): Promise<CalibrationPoint[]> {
  if (!isConfigured) return demoCalibration();
  const { data, error } = await supabase
    .from('prediction_calibration')
    .select('model_prob, outcome')
    .not('outcome', 'is', null);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ prob: Number(r.model_prob), outcome: r.outcome ? 1 : 0 }));
}

/** Config de ensemble activa (para el panel admin). */
export async function getActiveConfig(): Promise<EnsembleConfigRow> {
  if (!isConfigured) return DEMO_CONFIG;
  const { data, error } = await supabase
    .from('ensemble_config')
    .select('id,version,is_active,poisson_weight,elo_weight,context_weight,value_threshold,elo_home_adv')
    .eq('is_active', true)
    .maybeSingle();
  if (error || !data) return DEMO_CONFIG;
  return data as EnsembleConfigRow;
}

/** Guarda los pesos del ensemble. Requiere Supabase + rol admin (RLS). */
export async function saveConfig(patch: Partial<EnsembleConfigRow> & { id?: number }): Promise<void> {
  if (!isConfigured) {
    throw new Error('Modo demo: conecta Supabase y usa un usuario admin para guardar.');
  }
  if (!patch.id) throw new Error('Falta el id de la configuración.');
  const { error } = await supabase.from('ensemble_config').update(patch).eq('id', patch.id);
  if (error) throw error;
}
