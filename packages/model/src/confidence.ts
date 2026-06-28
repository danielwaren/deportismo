// -----------------------------------------------------------------------------
// ÍNDICE DE CONFIANZA 0–100 (#11).
//
// No basta con mostrar "72% victoria local": hay que decir CUÁNTO fiarse de ese
// 72%. El índice agrega varias señales de calidad de la predicción y devuelve un
// número 0–100 CON DESGLOSE (cada componente con su aporte), para el velocímetro
// y el panel "por qué". Todos los inputs son [0,1] y opcionales.
// -----------------------------------------------------------------------------

import type { FactorContribution } from './explain';
import type { Outcome1x2 as O } from './types';

export interface ConfidenceInputs {
  /** acuerdo entre miembros del ensemble [0,1] (1 = todos coinciden). */
  modelAgreement?: number;
  /** completitud de datos [0,1] (xG, forma, lesiones, localía disponibles). */
  dataCompleteness?: number;
  /** calidad de calibración [0,1] (1 = bien calibrado; = 1 − ECE escalado). */
  calibration?: number;
  /** alineación/edge con el mercado [0,1]. */
  marketAlignment?: number;
  /** tamaño de muestra de datos del partido (partidos), satura ~10. */
  sampleSize?: number;
}

/** Pesos de cada componente del índice (suman 1). Tuneables. */
export const CONFIDENCE_WEIGHTS = {
  modelAgreement: 0.3,
  dataCompleteness: 0.2,
  calibration: 0.25,
  marketAlignment: 0.15,
  sampleSize: 0.1,
} as const;

export interface ConfidenceResult {
  score: number; // 0–100
  breakdown: FactorContribution[]; // contribución de cada componente
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Acuerdo del ensemble a partir de las 1X2 de cada miembro: 1 − distancia de
 * variación total media al consenso. 1 = todos predicen lo mismo.
 */
export function modelAgreement(predictions: O[]): number {
  if (predictions.length <= 1) return 1;
  const mean: O = { home: 0, draw: 0, away: 0 };
  for (const p of predictions) {
    mean.home += p.home / predictions.length;
    mean.draw += p.draw / predictions.length;
    mean.away += p.away / predictions.length;
  }
  let tvd = 0;
  for (const p of predictions) {
    tvd +=
      0.5 * (Math.abs(p.home - mean.home) + Math.abs(p.draw - mean.draw) + Math.abs(p.away - mean.away));
  }
  return clamp01(1 - tvd / predictions.length);
}

/** Calcula el índice de confianza 0–100 con desglose por componente. */
export function confidenceIndex(i: ConfidenceInputs): ConfidenceResult {
  const W = CONFIDENCE_WEIGHTS;
  const parts: Array<{ key: string; label: string; weight: number; value: number }> = [
    { key: 'model_agreement', label: 'Acuerdo de modelos', weight: W.modelAgreement, value: clamp01(i.modelAgreement ?? 0.5) },
    { key: 'data_completeness', label: 'Completitud de datos', weight: W.dataCompleteness, value: clamp01(i.dataCompleteness ?? 0.5) },
    { key: 'calibration', label: 'Calibración', weight: W.calibration, value: clamp01(i.calibration ?? 0.5) },
    { key: 'market_alignment', label: 'Alineación de mercado', weight: W.marketAlignment, value: clamp01(i.marketAlignment ?? 0.5) },
    { key: 'sample_size', label: 'Muestra', weight: W.sampleSize, value: clamp01((i.sampleSize ?? 0) / 10) },
  ];

  let score01 = 0;
  const breakdown: FactorContribution[] = parts.map((p) => {
    const contrib = p.weight * p.value;
    score01 += contrib;
    return {
      key: p.key,
      label: p.label,
      value: Math.round(p.value * 100),
      unit: 'prob',
      impact: contrib,
      detail: `${Math.round(contrib * 100)}/${Math.round(p.weight * 100)}`,
    };
  });

  return { score: Math.round(clamp01(score01) * 100), breakdown };
}
