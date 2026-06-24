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
