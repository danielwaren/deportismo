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
