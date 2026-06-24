// Modo DEMO: puebla la UI con los partidos sembrados cuando NO hay Supabase
// configurado (sin PUBLIC_SUPABASE_*). En producción esto no se usa: las queries
// leen datos reales. El modelo se calcula con @sti/model SOLO para la demo visual;
// en producción la salida viene de match_model_outputs (Edge Function run-model).
import { combineEnsemble, contextModifier, type CalibrationPoint, type ContextFactors } from '@sti/model';
import type { EnsembleConfigRow, FixtureRow, MatchDetailData, ModelOutputRow } from './types';

const ELO: Record<string, number> = {
  Suiza: 1665,
  Canadá: 1490,
  'Bosnia y Herzegovina': 1520,
  Catar: 1480,
};

function team(id: number, name: string, short: string): { id: number; name: string; short_name: string } {
  return { id, name, short_name: short };
}

export const DEMO_FIXTURES: FixtureRow[] = [
  {
    id: 1001,
    kickoff: '2026-06-24T18:00:00Z',
    status: 'scheduled',
    round: 'Demo',
    home_goals: null,
    away_goals: null,
    home: team(1, 'Suiza', 'SUI'),
    away: team(2, 'Canadá', 'CAN'),
    league: { name: 'Internacional (selecciones)' },
  },
  {
    id: 1002,
    kickoff: '2026-06-24T20:45:00Z',
    status: 'scheduled',
    round: 'Demo',
    home_goals: null,
    away_goals: null,
    home: team(3, 'Bosnia y Herzegovina', 'BIH'),
    away: team(4, 'Catar', 'QAT'),
    league: { name: 'Internacional (selecciones)' },
  },
];

const ZERO_CTX: ContextFactors = {
  injuriesHome: 0, injuriesAway: 0, formHome: 0, formAway: 0,
  restAdvantage: 0, h2h: 0, pressure: 0,
};

function demoModel(home: string, away: string): ModelOutputRow {
  const r = combineEnsemble({
    eloHome: ELO[home] ?? 1500,
    eloAway: ELO[away] ?? 1500,
    homeAdvantage: 0,
    context: contextModifier(ZERO_CTX),
  });
  return {
    lambda_home: r.lambdaHome,
    lambda_away: r.lambdaAway,
    prob_home: r.final.home,
    prob_draw: r.final.draw,
    prob_away: r.final.away,
    prob_over_25: r.poisson.over['2.5'],
    prob_btts: r.poisson.btts,
    most_likely_score: `${r.poisson.mostLikelyScore[0]}-${r.poisson.mostLikelyScore[1]}`,
  };
}

export const DEMO_CONFIG: EnsembleConfigRow = {
  version: 'config-0.1.0',
  is_active: true,
  poisson_weight: 0.5,
  elo_weight: 0.3,
  context_weight: 0.2,
  value_threshold: 0.05,
  elo_home_adv: 65,
};

/**
 * Dataset de calibración ILUSTRATIVO (determinista) para que el reliability
 * diagram y las métricas tengan algo que mostrar sin datos reales. Simula un
 * modelo levemente sobreconfiado (la frecuencia real va por debajo de lo predicho
 * en la zona alta), que es el sesgo típico a vigilar.
 */
export function demoCalibration(n = 180): CalibrationPoint[] {
  let seed = 42;
  const rng = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const pts: CalibrationPoint[] = [];
  for (let i = 0; i < n; i++) {
    const prob = rng();
    // Probabilidad real un poco menor que la predicha (sobreconfianza).
    const trueP = Math.max(0, Math.min(1, prob - 0.06 * (prob - 0.5) * 2));
    pts.push({ prob, outcome: rng() < trueP ? 1 : 0 });
  }
  return pts;
}

export function demoDetail(id: number): MatchDetailData | null {
  const fixture = DEMO_FIXTURES.find((f) => f.id === id);
  if (!fixture) return null;
  return {
    fixture,
    model: demoModel(fixture.home.name, fixture.away.name),
    predictions: [],
    eloHome: ELO[fixture.home.name] ?? null,
    eloAway: ELO[fixture.away.name] ?? null,
    source: 'demo',
  };
}
