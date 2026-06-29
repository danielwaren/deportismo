import type { CalibrationPoint, SettledBet } from '@sti/model';
import { supabase } from './supabase';
import { analyzeMatch, type MatchAnalysis, type PredictInput, type TeamElo } from './predict';
import { DEMO_CONFIG, DEMO_FIXTURES, demoCalibration, demoDetail } from './demo';
import type {
  EnsembleConfigRow,
  FixtureRow,
  MatchDetailData,
  ModelOutputRow,
  PredictionRow,
  StandingsOfficialRow,
  StandingsEloRow,
} from './types';

export const isConfigured =
  !!import.meta.env.PUBLIC_SUPABASE_URL && !!import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

const FIXTURE_SELECT =
  'id,kickoff,status,round,home_goals,away_goals,' +
  'home:home_team_id(id,name,short_name,logo),' +
  'away:away_team_id(id,name,short_name,logo),' +
  'league:league_id!inner(api_id,name)';

/** Normaliza para búsqueda: minúsculas y sin acentos ("Canadá" -> "canada"). */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Partidos de una liga (api_id: 1 = Mundial, 265 = Primera de Chile).
 *  sortMode: 'next-first' = próximos adelante, luego históricos. */
export async function listFixtures(search = '', leagueApiId?: number, sortMode: 'next-first' | 'all' = 'all'): Promise<FixtureRow[]> {
  if (!isConfigured) {
    if (leagueApiId && leagueApiId !== 1) return [];
    const t = norm(search);
    return DEMO_FIXTURES.filter(
      (f) => !t || norm(f.home.name).includes(t) || norm(f.away.name).includes(t),
    );
  }
  let q = supabase.from('fixtures').select(FIXTURE_SELECT).limit(200);
  if (leagueApiId != null) q = q.eq('league.api_id', leagueApiId);
  const { data, error } = await q;
  if (error) throw error;
  let rows = (data ?? []) as unknown as FixtureRow[];

  if (search) {
    const t = norm(search);
    rows = rows.filter((f) => norm(f.home.name).includes(t) || norm(f.away.name).includes(t));

    if (sortMode === 'next-first') {
      const now = new Date();
      const upcoming = rows.filter((f) => new Date(f.kickoff) >= now);
      const past = rows.filter((f) => new Date(f.kickoff) < now);
      upcoming.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
      past.sort((a, b) => new Date(b.kickoff).getTime() - new Date(a.kickoff).getTime());
      return [...upcoming, ...past];
    }
  }

  rows.sort((a, b) => new Date(b.kickoff).getTime() - new Date(a.kickoff).getTime());
  return rows;
}

async function latestElo(teamId: number): Promise<number | null> {
  const { data } = await supabase
    .from('team_elo_history')
    .select('elo')
    .eq('team_id', teamId)
    .eq('component', 'general')
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

export interface TrackRecord {
  calibrationPoints: CalibrationPoint[]; // todas las selecciones resueltas
  bets: SettledBet[]; // pick del modelo CON cuota real (para banca/ROI)
  hitRate: number; // acierto del pick del modelo sobre TODOS los partidos
  totalPicks: number;
}

/**
 * Track record histórico del modelo: precisión (calibración) sobre todas las
 * predicciones resueltas + backtest de banca sobre los picks con cuota real.
 */
export async function getModelTrackRecord(): Promise<TrackRecord> {
  const empty: TrackRecord = { calibrationPoints: [], bets: [], hitRate: 0, totalPicks: 0 };
  if (!isConfigured) return empty;

  const { data: preds, error } = await supabase
    .from('predictions')
    .select('fixture_id, selection, model_prob, fixtures!inner(home_goals, away_goals, kickoff, status)')
    .eq('market', '1x2')
    .eq('fixtures.status', 'finished');
  if (error || !preds) return empty;

  const won = (sel: string, hg: number, ag: number) =>
    sel === 'home' ? hg > ag : sel === 'draw' ? hg === ag : hg < ag;

  const calibrationPoints: CalibrationPoint[] = [];
  type Row = { fixture_id: number; selection: string; prob: number; hg: number; ag: number; kickoff: string };
  const byFixture = new Map<number, Row[]>();
  for (const p of preds as any[]) {
    const fx = p.fixtures;
    if (fx?.home_goals == null || fx?.away_goals == null) continue;
    const w = won(p.selection, fx.home_goals, fx.away_goals);
    calibrationPoints.push({ prob: Number(p.model_prob), outcome: w ? 1 : 0 });
    const row: Row = { fixture_id: p.fixture_id, selection: p.selection, prob: Number(p.model_prob), hg: fx.home_goals, ag: fx.away_goals, kickoff: fx.kickoff };
    const arr = byFixture.get(p.fixture_id) ?? [];
    arr.push(row);
    byFixture.set(p.fixture_id, arr);
  }

  // Cuotas (decimal) por fixture+selección para liquidar los picks.
  const fixtureIds = [...byFixture.keys()];
  const oddsMap = new Map<string, number>();
  if (fixtureIds.length) {
    const { data: oddsRows } = await supabase
      .from('odds')
      .select('fixture_id, selection, odds')
      .in('fixture_id', fixtureIds)
      .eq('market', '1x2');
    for (const o of (oddsRows ?? []) as any[]) oddsMap.set(`${o.fixture_id}:${o.selection}`, Number(o.odds));
  }

  // Pick del modelo por partido = selección de mayor probabilidad.
  const picks = [...byFixture.values()]
    .map((rows) => rows.reduce((m, r) => (r.prob > m.prob ? r : m), rows[0]!))
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());

  let hits = 0;
  const bets: SettledBet[] = [];
  for (const pick of picks) {
    const pickWon = won(pick.selection, pick.hg, pick.ag);
    if (pickWon) hits++;
    const odds = oddsMap.get(`${pick.fixture_id}:${pick.selection}`);
    if (odds && odds > 1) bets.push({ stake: 1, odds, won: pickWon });
  }

  return { calibrationPoints, bets, hitRate: picks.length ? hits / picks.length : 0, totalPicks: picks.length };
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

/** Tabla de posiciones oficial (puntos acumulados). */
export async function getStandingsOfficial(leagueId: number): Promise<StandingsOfficialRow[]> {
  if (!isConfigured) return [];
  const { data, error } = await supabase
    .from('standings_official')
    .select('position,league_id,team_id,team_name,short_name,logo,points,played,wins,draws,losses,goals_for,goals_against,goal_diff')
    .eq('league_id', leagueId)
    .order('position', { ascending: true });
  if (error) throw error;
  return (data ?? []) as StandingsOfficialRow[];
}

// Goles por equipo y partido típicos por liga (api_id). Fallback 1.35.
const LEAGUE_AVG_GOALS: Record<number, number> = { 1: 1.45, 265: 1.2 };

/** Últimos Elo por componente de un equipo: { general, offensive, defensive }. */
function pickComponents(rows: Array<{ team_id: number; elo: number; component: string }>, teamId: number, fallback: number): TeamElo {
  const latest = (c: string) => {
    const r = rows.find((x) => x.team_id === teamId && x.component === c);
    return r ? Number(r.elo) : fallback;
  };
  const general = latest('general');
  return { general, offensive: latest('offensive') || general, defensive: latest('defensive') || general };
}

/**
 * Análisis COMPLETO del partido calculado en vivo con @sti/model desde el Elo
 * multi-componente persistido + cuotas. Alimenta el dashboard del partido.
 */
export async function getMatchAnalysis(id: number): Promise<{ analysis: MatchAnalysis; input: PredictInput; homeName: string; awayName: string } | null> {
  if (!isConfigured) {
    const d = demoDetail(id);
    if (!d) return null;
    const eh = d.eloHome ?? 1500;
    const ea = d.eloAway ?? 1500;
    const input: PredictInput = {
      homeName: d.fixture.home.name, awayName: d.fixture.away.name,
      home: { general: eh, offensive: eh, defensive: eh },
      away: { general: ea, offensive: ea, defensive: ea },
      leagueAvgElo: 1500, leagueAvgGoals: 1.35, homeAdvElo: 65, seed: id,
    };
    return { analysis: analyzeMatch(input), input, homeName: d.fixture.home.name, awayName: d.fixture.away.name };
  }

  const { data: fixture, error } = await supabase
    .from('fixtures')
    .select(
      'id,kickoff,home_team_id,away_team_id,' +
        'home:home_team_id(id,name,short_name),away:away_team_id(id,name,short_name),' +
        'league:league_id!inner(api_id,name,elo_home_adv)',
    )
    .eq('id', id)
    .single();
  if (error || !fixture) return null;
  const fx = fixture as any;
  const homeId = fx.home.id as number;
  const awayId = fx.away.id as number;
  const leagueApiId = fx.league?.api_id as number;
  const homeAdvElo = Number(fx.league?.elo_home_adv ?? 0);

  const [{ data: eloRows }, { data: standings }, { data: oddsRows }] = await Promise.all([
    supabase
      .from('team_elo_history')
      .select('team_id,elo,component,as_of')
      .in('team_id', [homeId, awayId])
      .in('component', ['general', 'offensive', 'defensive'])
      .order('as_of', { ascending: false }),
    supabase.from('standings_elo').select('rating').eq('league_id', leagueApiId),
    supabase.from('odds').select('selection,odds').eq('fixture_id', id).eq('market', '1x2'),
  ]);

  const rows = (eloRows ?? []) as Array<{ team_id: number; elo: number; component: string }>;
  const home = pickComponents(rows, homeId, 1500);
  const away = pickComponents(rows, awayId, 1500);

  const ratings = (standings ?? []).map((s: any) => Number(s.rating)).filter((n) => Number.isFinite(n));
  const leagueAvgElo = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 1500;

  let odds: { home: number; draw: number; away: number } | undefined;
  if (oddsRows && oddsRows.length) {
    const find = (sel: string) => {
      const r = (oddsRows as any[]).find((o) => o.selection === sel);
      return r ? Number(r.odds) : undefined;
    };
    const h = find('home'), d = find('draw'), a = find('away');
    if (h && d && a) odds = { home: h, draw: d, away: a };
  }

  const input: PredictInput = {
    homeName: fx.home.name, awayName: fx.away.name,
    home, away, leagueAvgElo,
    leagueAvgGoals: LEAGUE_AVG_GOALS[leagueApiId] ?? 1.35,
    homeAdvElo, odds, seed: id,
  };
  return { analysis: analyzeMatch(input), input, homeName: fx.home.name, awayName: fx.away.name };
}

/** Ranking Elo de los equipos de una liga (api_id: 1 = Mundial, 265 = Chile). */
export async function getStandingsElo(leagueId: number): Promise<StandingsEloRow[]> {
  if (!isConfigured) return [];
  const { data, error } = await supabase
    .from('standings_elo')
    .select('position,league_id,team_id,team_name,short_name,logo,rating,updated_at')
    .eq('league_id', leagueId)
    .order('position', { ascending: true });
  if (error) throw error;
  return (data ?? []) as StandingsEloRow[];
}
