/** Probabilidad implícita de una cuota decimal, sin desmargen. */
export function impliedProb(decimalOdds: number): number {
  return decimalOdds > 1 ? 1 / decimalOdds : 0;
}

/**
 * Quita el margen del bookie ("vig") repartiendo proporcionalmente sobre el set
 * de cuotas de un mercado, para comparar contra el modelo en igualdad.
 */
export function devig(decimalOdds: number[]): number[] {
  const raw = decimalOdds.map(impliedProb);
  const overround = raw.reduce((s, p) => s + p, 0);
  return overround > 0 ? raw.map((p) => p / overround) : raw;
}

export interface ValueSignal {
  edge: number;     // modelProb - marketProb
  isValue: boolean; // edge >= threshold
}

/**
 * Detecta value: el modelo asigna más probabilidad que el mercado por encima de
 * un umbral configurable (ensemble_config.value_threshold, p.ej. 0.05).
 */
export function valueSignal(
  modelProb: number,
  marketProb: number,
  threshold = 0.05,
): ValueSignal {
  const edge = modelProb - marketProb;
  return { edge, isValue: edge >= threshold };
}

// -----------------------------------------------------------------------------
// EXPECTED VALUE, KELLY y STAKE (#9).
// -----------------------------------------------------------------------------

/** Margen del bookie ("vig") de un mercado: suma de implícitas − 1. */
export function bookMargin(decimalOdds: number[]): number {
  return decimalOdds.reduce((s, o) => s + impliedProb(o), 0) - 1;
}

/**
 * Valor esperado por unidad apostada: EV = p·(odds−1) − (1−p) = p·odds − 1.
 * EV > 0 => apuesta con valor positivo a largo plazo.
 */
export function expectedValue(modelProb: number, decimalOdds: number): number {
  return modelProb * decimalOdds - 1;
}

/**
 * Fracción de Kelly: f* = (b·p − q) / b, con b = odds−1, q = 1−p. Se acota a
 * [0,1] (nunca negativa: si no hay valor, no se apuesta).
 */
export function kellyFraction(modelProb: number, decimalOdds: number): number {
  const b = decimalOdds - 1;
  if (b <= 0) return 0;
  const f = (b * modelProb - (1 - modelProb)) / b;
  return Math.max(0, Math.min(1, f));
}

export interface ValueAnalysis {
  edge: number; // overlay: modelProb − marketProb (devigado)
  ev: number; // valor esperado por unidad
  overlayPct: number; // edge en %
  kelly: number; // fracción de Kelly completa
  stake: number; // stake sugerido = bankroll · kelly · kellyFraction
  isValue: boolean;
}

/**
 * Análisis de valor completo para una selección: compara prob del modelo vs
 * cuota, y sugiere stake con Kelly FRACCIONADO (def. 1/4, más conservador y
 * robusto a errores de estimación). `marketProb` debe venir DEVIGADO (devig()).
 */
export function analyzeValue(
  modelProb: number,
  decimalOdds: number,
  marketProb: number,
  opts: { bankroll?: number; kellyFraction?: number; threshold?: number } = {},
): ValueAnalysis {
  const bankroll = opts.bankroll ?? 100;
  const kf = opts.kellyFraction ?? 0.25;
  const threshold = opts.threshold ?? 0.05;
  const edge = modelProb - marketProb;
  const kelly = kellyFraction(modelProb, decimalOdds);
  return {
    edge,
    ev: expectedValue(modelProb, decimalOdds),
    overlayPct: edge * 100,
    kelly,
    stake: bankroll * kelly * kf,
    isValue: edge >= threshold,
  };
}
