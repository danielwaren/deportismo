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
