// -----------------------------------------------------------------------------
// ENSEMBLE INTELIGENTE — pesos dinámicos (#7).
//
// Los pesos del ensemble dejan de ser fijos: se recalculan a partir del
// RENDIMIENTO reciente de cada modelo (Brier/log-loss de la calibración, #8).
// Un modelo que pierde precisión ve reducido su peso automáticamente.
//
// Para no sobre-reaccionar con pocos datos, los pesos se ENCOGEN hacia un prior
// (los pesos vigentes) según el tamaño de muestra (shrinkage bayesiano simple),
// con un suelo por modelo. Puro y testeable; la persistencia/cron es aparte.
// -----------------------------------------------------------------------------

export interface ModelPerformance {
  /** Brier score reciente del modelo (menor = mejor). Obligatorio. */
  brier: number;
  /** nº de predicciones evaluadas (gobierna la confianza en la métrica). */
  samples: number;
}

export interface DynamicWeightOptions {
  /** pesos a priori (típicamente los vigentes). Si falta, prior uniforme. */
  prior?: Record<string, number>;
  /** muestras para "confiar del todo" en la métrica (def. 40). */
  fullConfidenceSamples?: number;
  /** peso mínimo garantizado por modelo tras normalizar (def. 0.05). */
  floor?: number;
}

const normalize = (w: Record<string, number>): Record<string, number> => {
  const s = Object.values(w).reduce((a, b) => a + Math.max(0, b), 0);
  if (s <= 0) return w;
  const out: Record<string, number> = {};
  for (const k of Object.keys(w)) out[k] = Math.max(0, w[k]!) / s;
  return out;
};

/**
 * Calcula pesos dinámicos del ensemble desde el rendimiento por modelo.
 *
 *   skill_i  = 1 / (brier_i + eps)            (mejor Brier => más skill)
 *   conf_i   = min(samples_i / full, 1)        (confianza en la métrica)
 *   w_i      = (1-conf_i)·prior_i + conf_i·skillNorm_i
 * luego se aplica el suelo y se renormaliza.
 */
export function dynamicWeights(
  perf: Record<string, ModelPerformance>,
  opts: DynamicWeightOptions = {},
): Record<string, number> {
  const ids = Object.keys(perf);
  if (ids.length === 0) return {};
  const full = opts.fullConfidenceSamples ?? 40;
  const floor = opts.floor ?? 0.05;
  const eps = 1e-6;

  const prior = opts.prior ? normalize(opts.prior) : Object.fromEntries(ids.map((id) => [id, 1 / ids.length]));

  const skill = normalize(Object.fromEntries(ids.map((id) => [id, 1 / (perf[id]!.brier + eps)])));

  const blended: Record<string, number> = {};
  for (const id of ids) {
    const conf = Math.max(0, Math.min(1, perf[id]!.samples / full));
    const p = prior[id] ?? 1 / ids.length;
    blended[id] = (1 - conf) * p + conf * (skill[id] ?? 0);
  }

  // suelo + renormalización
  const floored = Object.fromEntries(ids.map((id) => [id, Math.max(floor, blended[id]!)]));
  return normalize(floored);
}
