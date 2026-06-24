// Tipos de fila que consume el frontend (subconjunto del esquema).

export interface TeamRow {
  id: number;
  name: string;
  short_name?: string | null;
  logo?: string | null;
}

export interface FixtureRow {
  id: number;
  kickoff: string;
  status: string;
  round: string | null;
  home_goals: number | null;
  away_goals: number | null;
  home: TeamRow;
  away: TeamRow;
  league?: { name: string } | null;
}

export interface ModelOutputRow {
  lambda_home: number;
  lambda_away: number;
  prob_home: number;
  prob_draw: number;
  prob_away: number;
  prob_over_25: number;
  prob_btts: number;
  most_likely_score: string;
}

export interface PredictionRow {
  market: string;
  selection: string;
  model_prob: number;
  market_prob: number | null;
  value_edge: number | null;
  flagged_value: boolean;
}

export interface EnsembleConfigRow {
  id?: number;
  version: string;
  is_active: boolean;
  poisson_weight: number;
  elo_weight: number;
  context_weight: number;
  value_threshold: number;
  elo_home_adv: number;
}

export interface MatchDetailData {
  fixture: FixtureRow;
  model: ModelOutputRow | null;
  predictions: PredictionRow[];
  eloHome: number | null;
  eloAway: number | null;
  source: 'supabase' | 'demo';
}
