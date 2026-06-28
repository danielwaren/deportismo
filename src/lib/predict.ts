// -----------------------------------------------------------------------------
// WIRING del modelo nuevo al cómputo EN VIVO (lado cliente).
//
// @sti/model es TS puro sin dependencias, así que corre en el navegador. Esta
// capa toma el Elo multi-componente persistido (general/ofensivo/defensivo) +
// cuotas y produce el análisis completo del partido: λ principistas explicadas,
// Dixon-Coles, mezcla con Elo, Monte Carlo, índice de confianza, valor/EV y la
// narrativa explicable. Lo canónico (match_model_outputs) sigue existiendo; esto
// es el cálculo interactivo que alimenta el dashboard y, más adelante, el
// Laboratorio de Simulación (what-if).
// -----------------------------------------------------------------------------

import {
  computeLambdas,
  buildScoreMatrix,
  eloToOneXtwo,
  blend1x2,
  DEFAULT_ELO,
  simulateMatch,
  confidenceIndex,
  modelAgreement,
  analyzeValue,
  devig,
  composeExplanation,
  buildNarrative,
  eloToAttackStrength,
  eloToDefenseStrength,
  type Explanation,
  type Outcome1x2,
  type PoissonOutput,
  type MonteCarloResult,
} from '@sti/model';

export interface TeamElo {
  general: number;
  offensive: number;
  defensive: number;
}

export interface PredictInput {
  homeName: string;
  awayName: string;
  home: TeamElo;
  away: TeamElo;
  leagueAvgElo: number; // Elo general medio de la liga (referencia de fuerza 1.0)
  leagueAvgGoals: number; // goles por equipo y partido en la liga
  homeAdvElo: number; // puntos Elo de localía (0 = sede neutral, p.ej. Mundial)
  odds?: { home: number; draw: number; away: number }; // cuotas decimales 1X2
  weights?: { poisson: number; elo: number };
  seed?: number; // semilla MC (reproducibilidad); típ. el id del fixture
  runs?: number;
}

export interface ValueRow {
  selection: 'home' | 'draw' | 'away';
  modelProb: number;
  marketProb: number;
  edge: number;
  ev: number;
  kelly: number;
  stake: number;
  isValue: boolean;
}

export interface MatchAnalysis {
  lambdaHome: number;
  lambdaAway: number;
  poisson: PoissonOutput;
  elo1x2: Outcome1x2;
  final: Outcome1x2;
  montecarlo: MonteCarloResult;
  confidence: ReturnType<typeof confidenceIndex>;
  explanation: Explanation;
  narrative: string;
  value: ValueRow[];
}

/** Convierte puntos Elo de localía en multiplicador de goles del local. */
const homeAdvMultiplier = (homeAdvElo: number) => Math.exp(homeAdvElo / 400);

export function analyzeMatch(i: PredictInput): MatchAnalysis {
  const weights = i.weights ?? { poisson: 0.6, elo: 0.4 };

  // 1) Fuerzas ataque/defensa desde el Elo ofensivo/defensivo (vs media de liga).
  const homeAttack = eloToAttackStrength(i.home.offensive, i.leagueAvgElo);
  const awayDefense = eloToDefenseStrength(i.away.defensive, i.leagueAvgElo);
  const awayAttack = eloToAttackStrength(i.away.offensive, i.leagueAvgElo);
  const homeDefense = eloToDefenseStrength(i.home.defensive, i.leagueAvgElo);

  // 2) λ principistas (multiplicativas + explicadas).
  const lambdas = computeLambdas({
    leagueAvgGoals: i.leagueAvgGoals,
    homeAttack,
    awayDefense,
    awayAttack,
    homeDefense,
    homeAdvantage: homeAdvMultiplier(i.homeAdvElo),
  });

  // 3) Dixon-Coles + 4) Elo 1X2 + 5) mezcla.
  const poisson = buildScoreMatrix(lambdas.lambdaHome, lambdas.lambdaAway);
  const elo1x2 = eloToOneXtwo(i.home.general, i.away.general, {
    ...DEFAULT_ELO,
    homeAdvantage: i.homeAdvElo,
  });
  const wPoisson = weights.poisson / (weights.poisson + weights.elo);
  const final = blend1x2(poisson.oneXtwo, elo1x2, wPoisson);

  // 6) Monte Carlo (distribuciones empíricas).
  const montecarlo = simulateMatch(lambdas.lambdaHome, lambdas.lambdaAway, {
    runs: i.runs ?? 30_000,
    seed: i.seed ?? 1,
  });

  // 9) Valor / EV (si hay cuotas, devigadas).
  const value: ValueRow[] = [];
  let marketAlignment = 0.5;
  if (i.odds) {
    const [mh, md, ma] = devig([i.odds.home, i.odds.draw, i.odds.away]) as [number, number, number];
    const market = { home: mh, draw: md, away: ma };
    (['home', 'draw', 'away'] as const).forEach((sel) => {
      const a = analyzeValue(final[sel], i.odds![sel], market[sel]);
      value.push({ selection: sel, modelProb: final[sel], marketProb: market[sel], edge: a.edge, ev: a.ev, kelly: a.kelly, stake: a.stake, isValue: a.isValue });
    });
    marketAlignment = 1 - 0.5 * (Math.abs(final.home - mh) + Math.abs(final.draw - md) + Math.abs(final.away - ma));
  }

  // 11) Índice de confianza.
  const agreement = modelAgreement([poisson.oneXtwo, elo1x2]);
  const confidence = confidenceIndex({
    modelAgreement: agreement,
    dataCompleteness: i.odds ? 0.8 : 0.55,
    calibration: 0.6,
    marketAlignment,
    sampleSize: 6,
  });

  // 12) Explicación + narrativa.
  const explanation = composeExplanation([lambdas.explanation]);
  const narrative = buildNarrative(explanation, final, {
    labels: { home: i.homeName, away: i.awayName },
  });

  return {
    lambdaHome: lambdas.lambdaHome,
    lambdaAway: lambdas.lambdaAway,
    poisson,
    elo1x2,
    final,
    montecarlo,
    confidence,
    explanation,
    narrative,
    value,
  };
}
