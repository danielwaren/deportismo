// Métricas de calibración del modelo. Puras y testeables. Operan sobre eventos
// binarios (una selección 1X2 ocurrió o no), que es lo que expone la vista
// prediction_calibration: { prob = probabilidad asignada, outcome = 0|1 }.

export interface CalibrationPoint {
  prob: number;
  outcome: 0 | 1;
}

/** Brier score = media((p - o)^2). 0 = perfecto, 0.25 = azar (p=0.5), 1 = peor. */
export function brierScore(points: CalibrationPoint[]): number {
  if (points.length === 0) return 0;
  const s = points.reduce((acc, p) => acc + (p.prob - p.outcome) ** 2, 0);
  return s / points.length;
}

/** Log-loss (entropía cruzada). Penaliza fuerte la confianza equivocada. */
export function logLoss(points: CalibrationPoint[], eps = 1e-15): number {
  if (points.length === 0) return 0;
  const s = points.reduce((acc, { prob, outcome }) => {
    const p = Math.min(1 - eps, Math.max(eps, prob));
    return acc + (outcome === 1 ? -Math.log(p) : -Math.log(1 - p));
  }, 0);
  return s / points.length;
}

export interface ReliabilityBin {
  lower: number;
  upper: number;
  meanPredicted: number; // x del reliability diagram
  observed: number; // y: frecuencia real observada en el bin
  count: number;
}

/**
 * Bins para el reliability diagram: agrupa por probabilidad predicha y compara
 * la media predicha (x) contra la frecuencia real (y). Un modelo bien calibrado
 * cae sobre la diagonal y = x.
 */
export function reliabilityBins(points: CalibrationPoint[], nBins = 10): ReliabilityBin[] {
  const bins: ReliabilityBin[] = [];
  for (let i = 0; i < nBins; i++) {
    const lower = i / nBins;
    const upper = (i + 1) / nBins;
    const inBin = points.filter((p) => p.prob >= lower && (p.prob < upper || (i === nBins - 1 && p.prob <= upper)));
    const count = inBin.length;
    bins.push({
      lower,
      upper,
      count,
      meanPredicted: count ? inBin.reduce((a, p) => a + p.prob, 0) / count : (lower + upper) / 2,
      observed: count ? inBin.reduce((a, p) => a + p.outcome, 0) / count : 0,
    });
  }
  return bins;
}
