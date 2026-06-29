import { describe, it, expect } from 'vitest';
import {
  poissonPmf,
  buildScoreMatrix,
  decayWeights,
  expectedScore,
  eloToOneXtwo,
  updateElo,
  impliedProb,
  devig,
  valueSignal,
  eloToLambdas,
  blend1x2,
  combineEnsemble,
  contextModifier,
  injurySeverity,
  formScore,
  restAdvantage,
  h2hScore,
  brierScore,
  logLoss,
  reliabilityBins,
  defaultComponents,
  updateEloComponents,
  eloToAttackStrength,
  eloToDefenseStrength,
  computeLambdas,
  rankFactors,
  multFactor,
  xgReliability,
  xgAttackStrength,
  xgDefenseStrength,
  xgAdjustedStrengths,
  weightedFormScore,
  dynamicContextScore,
  simulateMatch,
  samplePoisson,
  mulberry32,
  dynamicWeights,
  calibrationError,
  tradingMetrics,
  bankrollCurve,
  maxDrawdown,
  profitFactor,
  sharpeRatio,
  expectedValue,
  kellyFraction,
  analyzeValue,
  bookMargin,
  analyzeMovement,
  closingLineValue,
  confidenceIndex,
  modelAgreement,
  composeExplanation,
  buildNarrative,
  predictionSummary,
} from '../src/index';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('Poisson / Dixon-Coles', () => {
  it('poissonPmf coincide con valores conocidos', () => {
    // P(0; lambda=2) = e^-2 ≈ 0.1353
    expect(poissonPmf(0, 2)).toBeCloseTo(Math.exp(-2), 6);
    // P(2; lambda=2) = 2 e^-2 ≈ 0.2707
    expect(poissonPmf(2, 2)).toBeCloseTo(2 * Math.exp(-2), 6);
  });

  it('la matriz de marcador suma 1 y los mercados son coherentes', () => {
    const out = buildScoreMatrix(1.6, 1.1);
    const flat = out.scoreMatrix.flat();
    expect(sum(flat)).toBeCloseTo(1, 6);
    expect(out.oneXtwo.home + out.oneXtwo.draw + out.oneXtwo.away).toBeCloseTo(1, 6);
    // Con localía ofensiva mayor, P(home) > P(away).
    expect(out.oneXtwo.home).toBeGreaterThan(out.oneXtwo.away);
    // over2.5 < over1.5 (monotonía).
    expect(out.over['2.5']).toBeLessThan(out.over['1.5']);
    expect(out.btts).toBeGreaterThan(0);
  });

  it('decayWeights da más peso a lo reciente', () => {
    const [recent, old] = decayWeights([0, 8], 8);
    expect(recent).toBe(1);
    expect(old).toBeCloseTo(0.5, 6); // a una vida media, mitad de peso
  });
});

describe('Elo', () => {
  it('expectedScore es 0.5 entre iguales y crece con la localía', () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 6);
    expect(expectedScore(1500, 1500, 65)).toBeGreaterThan(0.5);
  });

  it('eloToOneXtwo suma 1 y respeta el favoritismo', () => {
    const p = eloToOneXtwo(1600, 1500);
    expect(p.home + p.draw + p.away).toBeCloseTo(1, 6);
    expect(p.home).toBeGreaterThan(p.away);
  });

  it('updateElo sube el rating al ganar contra lo esperado', () => {
    const before = 1500;
    const after = updateElo(before, 0.5, 1);
    expect(after).toBeGreaterThan(before);
  });
});

describe('Ensemble', () => {
  it('eloToLambdas: iguales -> mismas lambdas; favorito -> lambda mayor', () => {
    const eq = eloToLambdas(1500, 1500);
    expect(eq.lambdaHome).toBeCloseTo(eq.lambdaAway, 6);
    expect(eq.lambdaHome).toBeCloseTo(1.39, 6); // mu/2 con mu=2.78 (calibrado)
    const fav = eloToLambdas(1665, 1490);
    expect(fav.lambdaHome).toBeGreaterThan(fav.lambdaAway);
  });

  it('blend1x2 suma 1 y queda entre ambas fuentes', () => {
    const a = { home: 0.6, draw: 0.25, away: 0.15 };
    const b = { home: 0.4, draw: 0.3, away: 0.3 };
    const m = blend1x2(a, b, 0.5);
    expect(m.home + m.draw + m.away).toBeCloseTo(1, 6);
    expect(m.home).toBeGreaterThan(b.home);
    expect(m.home).toBeLessThan(a.home);
  });
});

describe('Contexto', () => {
  it('injurySeverity pondera por importancia y satura en 1', () => {
    expect(injurySeverity([])).toBe(0);
    expect(injurySeverity([0.3, 0.2])).toBeCloseTo(0.5, 6);
    expect(injurySeverity([0.8, 0.7])).toBe(1); // satura
  });

  it('formScore premia ganar a rivales fuertes', () => {
    const vsFuerte = formScore([{ result: 'W', opponentElo: 1700, teamElo: 1500, ageInMatches: 0 }]);
    const vsDebil = formScore([{ result: 'W', opponentElo: 1300, teamElo: 1500, ageInMatches: 0 }]);
    expect(vsFuerte).toBeGreaterThan(0);
    expect(vsFuerte).toBeGreaterThan(vsDebil);
  });

  it('restAdvantage favorece a quien descansó más', () => {
    expect(restAdvantage(6, 3)).toBeGreaterThan(0);
    expect(restAdvantage(3, 6)).toBeLessThan(0);
  });

  it('h2hScore resume el historial directo', () => {
    expect(h2hScore(['home', 'home', 'draw'])).toBeGreaterThan(0);
    expect(h2hScore(['away', 'away'])).toBe(-1);
  });

  it('contextModifier: bajas del rival favorecen al local', () => {
    const base = {
      injuriesHome: 0, injuriesAway: 0, formHome: 0, formAway: 0,
      restAdvantage: 0, h2h: 0, pressure: 0,
    };
    expect(contextModifier(base)).toBeCloseTo(0, 6);
    expect(contextModifier({ ...base, injuriesAway: 0.8 })).toBeGreaterThan(0);
    expect(contextModifier({ ...base, injuriesHome: 0.8 })).toBeLessThan(0);
  });
});

describe('combineEnsemble', () => {
  it('iguales y sin contexto -> 1X2 simétrico y suma 1', () => {
    const r = combineEnsemble({ eloHome: 1500, eloAway: 1500, homeAdvantage: 0 });
    expect(r.final.home + r.final.draw + r.final.away).toBeCloseTo(1, 6);
    expect(r.final.home).toBeCloseTo(r.final.away, 6);
  });

  it('contexto positivo sube la probabilidad del local', () => {
    const sin = combineEnsemble({ eloHome: 1500, eloAway: 1500 });
    const con = combineEnsemble({ eloHome: 1500, eloAway: 1500, context: 1 });
    expect(con.final.home).toBeGreaterThan(sin.final.home);
    expect(con.lambdaHome).toBeGreaterThan(con.lambdaAway);
  });
});

describe('Calibración', () => {
  const perfecto = [
    { prob: 1, outcome: 1 as const },
    { prob: 0, outcome: 0 as const },
  ];
  const malo = [
    { prob: 0, outcome: 1 as const },
    { prob: 1, outcome: 0 as const },
  ];

  it('brierScore: 0 perfecto, 1 pésimo', () => {
    expect(brierScore(perfecto)).toBeCloseTo(0, 6);
    expect(brierScore(malo)).toBeCloseTo(1, 6);
    expect(brierScore([{ prob: 0.5, outcome: 1 }])).toBeCloseTo(0.25, 6);
  });

  it('logLoss penaliza la confianza equivocada', () => {
    expect(logLoss(perfecto)).toBeLessThan(0.01);
    expect(logLoss(malo)).toBeGreaterThan(10);
  });

  it('reliabilityBins reparte los puntos y mide la frecuencia real', () => {
    const pts = [
      { prob: 0.05, outcome: 0 as const },
      { prob: 0.15, outcome: 0 as const },
      { prob: 0.95, outcome: 1 as const },
    ];
    const bins = reliabilityBins(pts, 10);
    expect(bins).toHaveLength(10);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(3);
    expect(bins[9]!.observed).toBe(1); // el de prob 0.95 acertó
  });
});

describe('Elo multi-componente (F1)', () => {
  it('defaultComponents arranca todos al base', () => {
    const c = defaultComponents(1500);
    expect(c.general).toBe(1500);
    expect(c.offensive).toBe(1500);
    expect(c.defensive).toBe(1500);
  });

  it('ganar 3-0 sube general y ofensivo; baja nada defensivo malo', () => {
    const prev = defaultComponents(1500);
    const opp = { general: 1500, offensive: 1500, defensive: 1500 };
    const { next, explanation } = updateEloComponents(prev, {
      isHome: true, goalsFor: 3, goalsAgainst: 0, opponent: opp,
    });
    expect(next.general).toBeGreaterThan(prev.general); // ganó
    expect(next.offensive).toBeGreaterThan(prev.offensive); // marcó más de lo esperado
    expect(next.defensive).toBeGreaterThan(prev.defensive); // no encajó (0 vs esperado>0)
    expect(next.home).toBeGreaterThan(prev.home); // jugó de local
    expect(next.away).toBe(prev.away); // no tocó el de visitante
    expect(explanation.factors.length).toBeGreaterThanOrEqual(3);
  });

  it('encajar más de lo esperado baja el Elo defensivo', () => {
    const prev = defaultComponents(1500);
    const opp = { general: 1500, offensive: 1500, defensive: 1500 };
    const { next } = updateEloComponents(prev, {
      isHome: false, goalsFor: 0, goalsAgainst: 4, opponent: opp,
    });
    expect(next.defensive).toBeLessThan(prev.defensive);
    expect(next.away).toBeLessThan(prev.away); // perdió de visitante
    expect(next.home).toBe(prev.home);
  });

  it('mapeo Elo->fuerza: ataque alto >1, defensa fuerte <1', () => {
    expect(eloToAttackStrength(1500, 1500)).toBeCloseTo(1, 6);
    expect(eloToAttackStrength(1600, 1500)).toBeGreaterThan(1);
    expect(eloToDefenseStrength(1600, 1500)).toBeLessThan(1); // mejor defensa => rival marca menos
  });
});

describe('Lambdas principistas (F1)', () => {
  it('equipos medios sin contexto -> lambda ~ media de liga', () => {
    const r = computeLambdas({
      leagueAvgGoals: 1.35, homeAttack: 1, awayDefense: 1, awayAttack: 1, homeDefense: 1,
    });
    expect(r.lambdaHome).toBeCloseTo(1.35, 6);
    expect(r.lambdaAway).toBeCloseTo(1.35, 6);
  });

  it('localía y mejor ataque suben la lambda local y se explican', () => {
    const r = computeLambdas({
      leagueAvgGoals: 1.35, homeAttack: 1.2, awayDefense: 1, awayAttack: 1, homeDefense: 1,
      homeAdvantage: 1.1, formHome: 0.5, injuriesAway: 0.4,
    });
    expect(r.lambdaHome).toBeGreaterThan(1.35);
    // hay factores explicables y rankFactors los ordena por relevancia
    const ranked = rankFactors(r.explanation);
    expect(ranked.length).toBeGreaterThan(3);
    expect(Math.abs(ranked[0]!.impact)).toBeGreaterThanOrEqual(Math.abs(ranked[ranked.length - 1]!.impact));
    expect(r.explanation.summary).toContain('λ');
  });

  it('lesiones del local reducen su lambda', () => {
    const sano = computeLambdas({ leagueAvgGoals: 1.35, homeAttack: 1, awayDefense: 1, awayAttack: 1, homeDefense: 1 });
    const tocado = computeLambdas({ leagueAvgGoals: 1.35, homeAttack: 1, awayDefense: 1, awayAttack: 1, homeDefense: 1, injuriesHome: 0.8 });
    expect(tocado.lambdaHome).toBeLessThan(sano.lambdaHome);
  });

  it('combineEnsemble acepta lambdas principistas como override', () => {
    const r = combineEnsemble({ eloHome: 1500, eloAway: 1500, lambdas: { lambdaHome: 2.0, lambdaAway: 0.8 } });
    // la supremacía de goles se refleja en el 1X2
    expect(r.lambdaHome).toBeGreaterThan(r.lambdaAway);
    expect(r.final.home).toBeGreaterThan(r.final.away);
  });

  it('multFactor formatea el multiplicador como porcentaje', () => {
    expect(multFactor('x', 'X', 1.08).detail).toBe('+8%');
    expect(multFactor('x', 'X', 0.95).detail).toBe('-5%');
  });
});

describe('xG (#3)', () => {
  it('fiabilidad crece con partidos y satura', () => {
    expect(xgReliability(0)).toBe(0);
    expect(xgReliability(3)).toBeCloseTo(0.5, 6);
    expect(xgReliability(12)).toBe(1);
  });

  it('fuerzas xG: generar más xG que la media -> ataque>1; conceder menos -> defensa<1', () => {
    expect(xgAttackStrength(1.35, 1.35)).toBeCloseTo(1, 6);
    expect(xgAttackStrength(2.0, 1.35)).toBeGreaterThan(1);
    expect(xgDefenseStrength(0.8, 1.35)).toBeLessThan(1);
  });

  it('sin datos xG devuelve la fuerza base intacta', () => {
    const r = xgAdjustedStrengths(1.2, 0.9, 1.35, undefined);
    expect(r.attack).toBe(1.2);
    expect(r.defense).toBe(0.9);
    expect(r.explanation.factors).toHaveLength(0);
  });

  it('con xG mezcla hacia la señal xG y explica', () => {
    const base = 1.0;
    const r = xgAdjustedStrengths(base, base, 1.35, {
      matches: 6, xgForPerGame: 2.0, xgAgainstPerGame: 0.8,
    });
    expect(r.attack).toBeGreaterThan(base); // generó mucho xG
    expect(r.defense).toBeLessThan(base); // concedió poco xG
    expect(r.explanation.factors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Forma inteligente (#4)', () => {
  it('pondera por jornada explícita: lo reciente pesa más', () => {
    const recienteW = weightedFormScore([
      { result: 'W', opponentElo: 1500, teamElo: 1500, ageInMatches: 0 },
      { result: 'L', opponentElo: 1500, teamElo: 1500, ageInMatches: 4 },
    ]);
    const recienteL = weightedFormScore([
      { result: 'L', opponentElo: 1500, teamElo: 1500, ageInMatches: 0 },
      { result: 'W', opponentElo: 1500, teamElo: 1500, ageInMatches: 4 },
    ]);
    expect(recienteW).toBeGreaterThan(recienteL); // misma W y L, pero la reciente manda
  });

  it('ganar a rival fuerte puntúa más que a uno débil', () => {
    const fuerte = weightedFormScore([{ result: 'W', opponentElo: 1750, teamElo: 1500, ageInMatches: 0 }]);
    const debil = weightedFormScore([{ result: 'W', opponentElo: 1300, teamElo: 1500, ageInMatches: 0 }]);
    expect(fuerte).toBeGreaterThan(debil);
  });
});

describe('Context Score dinámico (#5)', () => {
  it('sin datos -> 0 y sin factores con impacto', () => {
    const r = dynamicContextScore({});
    expect(r.score).toBeCloseTo(0, 6);
  });

  it('lesiones del rival y altitud favorecen al local; viaje del local resta', () => {
    const r = dynamicContextScore({ injuriesAway: 0.8, altitudeAdvantage: 0.6 });
    expect(r.score).toBeGreaterThan(0);
    const r2 = dynamicContextScore({ travelHome: 0.9 });
    expect(r2.score).toBeLessThan(0);
    expect(r.explanation.factors.length).toBeGreaterThan(0);
    expect(r.explanation.summary).toContain('Contexto');
  });

  it('la importancia amplifica la señal existente', () => {
    const base = dynamicContextScore({ injuriesAway: 0.5 });
    const amplificado = dynamicContextScore({ injuriesAway: 0.5, competitionImportance: 1 });
    expect(Math.abs(amplificado.score)).toBeGreaterThan(Math.abs(base.score));
  });
});

describe('Monte Carlo (#6)', () => {
  it('mulberry32 es determinista', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect(a()).toBe(b());
  });

  it('samplePoisson ~ media lambda en muchas muestras', () => {
    const rng = mulberry32(7);
    let s = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) s += samplePoisson(1.6, rng);
    expect(s / N).toBeGreaterThan(1.4);
    expect(s / N).toBeLessThan(1.8);
  });

  it('MC aproxima el Dixon-Coles analítico para las mismas lambdas', () => {
    const dc = buildScoreMatrix(1.7, 1.1);
    const mc = simulateMatch(1.7, 1.1, { runs: 40000, seed: 123 });
    expect(mc.oneXtwo.home + mc.oneXtwo.draw + mc.oneXtwo.away).toBeCloseTo(1, 6);
    // dentro de ~3 puntos del analítico (Poisson independiente vs DC).
    expect(Math.abs(mc.oneXtwo.home - dc.oneXtwo.home)).toBeLessThan(0.03);
    expect(mc.over['2.5']!).toBeGreaterThan(0);
    expect(mc.over['1.5']!).toBeGreaterThan(mc.over['2.5']!); // monotonía
    expect(mc.avgTotalGoals).toBeGreaterThan(2.5);
    expect(mc.handicap.find((h) => h.line === -1)!.homeCover).toBeLessThan(
      mc.handicap.find((h) => h.line === 1)!.homeCover,
    );
  });
});

describe('Ensemble dinámico (#7)', () => {
  it('con pocas muestras se queda cerca del prior', () => {
    const w = dynamicWeights(
      { poisson: { brier: 0.2, samples: 1 }, elo: { brier: 0.25, samples: 1 } },
      { prior: { poisson: 0.7, elo: 0.3 } },
    );
    expect(w.poisson!).toBeGreaterThan(0.6);
  });

  it('un modelo con peor Brier pierde peso al haber datos', () => {
    const w = dynamicWeights({
      bueno: { brier: 0.15, samples: 100 },
      malo: { brier: 0.30, samples: 100 },
    });
    expect(w.bueno!).toBeGreaterThan(w.malo!);
    expect(w.bueno! + w.malo!).toBeCloseTo(1, 6);
  });
});

describe('Calibración trading (#8)', () => {
  it('calibrationError: 0 si predicho == observado', () => {
    const pts = [
      { prob: 0.9, outcome: 1 as const }, { prob: 0.9, outcome: 1 as const },
      { prob: 0.1, outcome: 0 as const }, { prob: 0.1, outcome: 0 as const },
    ];
    expect(calibrationError(pts)).toBeLessThan(0.15);
  });

  it('tradingMetrics calcula ROI, hitRate y CLV', () => {
    const m = tradingMetrics([
      { stake: 1, odds: 2.0, won: true, closingOdds: 1.8 },
      { stake: 1, odds: 2.0, won: false, closingOdds: 2.1 },
    ]);
    expect(m.bets).toBe(2);
    expect(m.staked).toBe(2);
    expect(m.profit).toBeCloseTo(0, 6); // +1 y -1
    expect(m.roi).toBeCloseTo(0, 6);
    expect(m.hitRate).toBeCloseTo(0.5, 6);
    expect(m.clv).toBeGreaterThan(0); // apostó 2.0 con cierres 1.8/2.1 => CLV+ medio
  });

  it('bankrollCurve, drawdown, profitFactor y sharpe sobre una serie', () => {
    const bets = [
      { stake: 1, odds: 2.0, won: true },   // +1
      { stake: 1, odds: 2.0, won: false },  // -1
      { stake: 1, odds: 2.0, won: false },  // -1
      { stake: 1, odds: 3.0, won: true },   // +2
    ];
    const curve = bankrollCurve(bets, 100);
    expect(curve[0]).toBe(100);
    expect(curve[curve.length - 1]).toBe(101); // +1 -1 -1 +2
    expect(maxDrawdown(curve)).toBeGreaterThan(0); // hubo caída tras el pico 101
    expect(profitFactor(bets)).toBeCloseTo(3 / 2, 6); // ganancias 3, pérdidas 2
    expect(Number.isFinite(sharpeRatio(bets))).toBe(true);
  });

  it('profitFactor infinito sin pérdidas; drawdown 0 en curva creciente', () => {
    expect(profitFactor([{ stake: 1, odds: 2, won: true }])).toBe(Infinity);
    expect(maxDrawdown([100, 110, 120])).toBe(0);
  });
});

describe('Valor / EV / Kelly (#9)', () => {
  it('expectedValue positivo cuando el modelo supera la cuota', () => {
    expect(expectedValue(0.6, 2.0)).toBeCloseTo(0.2, 6); // 0.6*2-1
    expect(expectedValue(0.4, 2.0)).toBeLessThan(0);
  });

  it('kellyFraction: 0 sin valor, positiva con valor', () => {
    expect(kellyFraction(0.4, 2.0)).toBe(0); // sin ventaja
    expect(kellyFraction(0.6, 2.0)).toBeGreaterThan(0);
  });

  it('analyzeValue sugiere stake con Kelly fraccionado', () => {
    const a = analyzeValue(0.6, 2.0, 0.5, { bankroll: 100, kellyFraction: 0.25 });
    expect(a.isValue).toBe(true);
    expect(a.ev).toBeCloseTo(0.2, 6);
    expect(a.stake).toBeGreaterThan(0);
    expect(a.stake).toBeLessThan(100 * a.kelly); // fraccionado < Kelly completo
  });

  it('bookMargin detecta el overround', () => {
    expect(bookMargin([2.0, 2.0])).toBeCloseTo(0, 6); // mercado justo
    expect(bookMargin([1.9, 1.9])).toBeGreaterThan(0); // con margen
  });
});

describe('Movimiento de mercado (#10)', () => {
  it('detecta acortamiento y steam', () => {
    const r = analyzeMovement([
      { t: 1, odds: 2.5 }, { t: 2, odds: 2.4 }, { t: 3, odds: 2.1 },
    ]);
    expect(r.direction).toBe('shortening');
    expect(r.pctMove).toBeLessThan(0);
    expect(r.steam).toBe(true); // 2.4 -> 2.1 es -12.5%
  });

  it('mercado estable no marca steam', () => {
    const r = analyzeMovement([{ t: 1, odds: 2.0 }, { t: 2, odds: 2.01 }]);
    expect(r.direction).toBe('stable');
    expect(r.steam).toBe(false);
  });

  it('closingLineValue positivo si se apostó por encima del cierre', () => {
    expect(closingLineValue(2.1, 1.9)).toBeGreaterThan(0);
    expect(closingLineValue(1.8, 2.0)).toBeLessThan(0);
  });
});

describe('Índice de confianza (#11)', () => {
  it('modelAgreement: 1 si todos coinciden, baja con discrepancia', () => {
    const same = modelAgreement([
      { home: 0.5, draw: 0.3, away: 0.2 }, { home: 0.5, draw: 0.3, away: 0.2 },
    ]);
    expect(same).toBeCloseTo(1, 6);
    const diff = modelAgreement([
      { home: 0.8, draw: 0.1, away: 0.1 }, { home: 0.2, draw: 0.1, away: 0.7 },
    ]);
    expect(diff).toBeLessThan(same);
  });

  it('confidenceIndex 0-100 con desglose; sube con mejores señales', () => {
    const bajo = confidenceIndex({ modelAgreement: 0.2, dataCompleteness: 0.2, calibration: 0.2, marketAlignment: 0.2, sampleSize: 1 });
    const alto = confidenceIndex({ modelAgreement: 0.95, dataCompleteness: 0.9, calibration: 0.9, marketAlignment: 0.8, sampleSize: 12 });
    expect(alto.score).toBeGreaterThan(bajo.score);
    expect(alto.score).toBeLessThanOrEqual(100);
    expect(alto.breakdown).toHaveLength(5);
  });
});

describe('Explainable AI (#12)', () => {
  it('composeExplanation funde y deduplica por key', () => {
    const a = { factors: [{ key: 'x', label: 'X', value: 1, unit: 'mult' as const, impact: 0.2, detail: '+20%' }] };
    const b = { factors: [{ key: 'x', label: 'X', value: 1.1, unit: 'mult' as const, impact: 0.3, detail: '+30%' }, { key: 'y', label: 'Y', value: 1, unit: 'mult' as const, impact: 0.1, detail: '+10%' }] };
    const c = composeExplanation([a, b, undefined]);
    expect(c.factors).toHaveLength(2); // x deduplicado
    expect(c.factors.find((f) => f.key === 'x')!.detail).toBe('+30%'); // gana el último
  });

  it('predictionSummary y buildNarrative arman el "por qué -> conclusión"', () => {
    expect(predictionSummary({ home: 0.72, draw: 0.18, away: 0.1 })).toContain('72%');
    const expl = { factors: [
      { key: 'home_attack', label: 'Ataque local', value: 1.12, unit: 'mult' as const, impact: 0.4, detail: '+12%' },
      { key: 'rest', label: 'Descanso', value: 1.02, unit: 'mult' as const, impact: 0.05, detail: '+2%' },
    ] };
    const n = buildNarrative(expl, { home: 0.72, draw: 0.18, away: 0.1 });
    expect(n).toContain('Ataque local +12%');
    expect(n).toContain('→');
    expect(n).toContain('72%');
  });
});

describe('Value / mercado', () => {
  it('impliedProb invierte la cuota decimal', () => {
    expect(impliedProb(2)).toBeCloseTo(0.5, 6);
  });

  it('devig normaliza a suma 1', () => {
    const probs = devig([2.0, 3.5, 4.0]);
    expect(sum(probs)).toBeCloseTo(1, 6);
  });

  it('valueSignal marca value sobre el umbral', () => {
    expect(valueSignal(0.6, 0.5, 0.05).isValue).toBe(true);
    expect(valueSignal(0.52, 0.5, 0.05).isValue).toBe(false);
  });
});
