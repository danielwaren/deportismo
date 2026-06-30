// -----------------------------------------------------------------------------
// MODELO ML: regresión logística multinomial (softmax) para 1X2.
//
// Es un modelo de Machine Learning real (entrenable por descenso de gradiente),
// TS puro, interpretable (los pesos = importancia de cada feature) y enchufable
// al ensemble vía PredictionModel. Sirve de PRIMER miembro ML; XGBoost/LightGBM
// se añaden después implementando la misma interface sobre el mismo feature
// store (features.ts). Incluye estandarización de features (media/desv) para un
// entrenamiento estable.
// -----------------------------------------------------------------------------

import type { Outcome1x2 } from './types';
import type { ModelPrediction, PredictionModel } from './model';
import { type Explanation, emptyExplanation, addFactor } from './explain';

/** 0 = gana local, 1 = empate, 2 = gana visitante. */
export type Label1x2 = 0 | 1 | 2;

export interface TrainSample {
  features: number[];
  label: Label1x2;
}

export interface LogRegWeights {
  w: number[][]; // [3 clases][n features]
  b: number[]; // [3]
  mean: number[]; // estandarización por feature
  std: number[];
  featureNames: string[];
}

const softmax = (z: number[]): number[] => {
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0) || 1;
  return e.map((v) => v / s);
};

const standardizeVec = (x: number[], mean: number[], std: number[]) =>
  x.map((v, j) => (v - mean[j]!) / (std[j]! || 1));

/** Calcula media y desviación por feature sobre el set de entrenamiento. */
export function featureStats(samples: TrainSample[]): { mean: number[]; std: number[] } {
  const n = samples[0]?.features.length ?? 0;
  const mean = new Array(n).fill(0);
  const std = new Array(n).fill(0);
  for (const s of samples) for (let j = 0; j < n; j++) mean[j] += s.features[j]! / samples.length;
  for (const s of samples) for (let j = 0; j < n; j++) std[j] += (s.features[j]! - mean[j]) ** 2 / samples.length;
  for (let j = 0; j < n; j++) std[j] = Math.sqrt(std[j]) || 1;
  return { mean, std };
}

export interface TrainOptions {
  epochs?: number;
  lr?: number; // tasa de aprendizaje
  l2?: number; // regularización
}

/** Entrena la regresión logística softmax por descenso de gradiente. */
export function trainLogReg(samples: TrainSample[], featureNames: string[], opts: TrainOptions = {}): LogRegWeights {
  const epochs = opts.epochs ?? 300;
  const lr = opts.lr ?? 0.3;
  const l2 = opts.l2 ?? 1e-3;
  const n = samples[0]?.features.length ?? 0;
  const { mean, std } = featureStats(samples);
  const X = samples.map((s) => standardizeVec(s.features, mean, std));

  const w: number[][] = [0, 1, 2].map(() => new Array(n).fill(0));
  const b = [0, 0, 0];

  for (let ep = 0; ep < epochs; ep++) {
    const gw: number[][] = [0, 1, 2].map(() => new Array(n).fill(0));
    const gb = [0, 0, 0];
    for (let i = 0; i < X.length; i++) {
      const x = X[i]!;
      const logits = [0, 1, 2].map((c) => b[c]! + w[c]!.reduce((acc, wj, j) => acc + wj * x[j]!, 0));
      const p = softmax(logits);
      for (let c = 0; c < 3; c++) {
        const err = p[c]! - (samples[i]!.label === c ? 1 : 0);
        gb[c]! += err / X.length;
        for (let j = 0; j < n; j++) gw[c]![j]! += (err * x[j]!) / X.length;
      }
    }
    for (let c = 0; c < 3; c++) {
      b[c]! -= lr * gb[c]!;
      for (let j = 0; j < n; j++) w[c]![j]! -= lr * (gw[c]![j]! + l2 * w[c]![j]!);
    }
  }
  return { w, b, mean, std, featureNames };
}

/** Probabilidades [home, draw, away] para un vector de features. */
export function predictLogRegRaw(weights: LogRegWeights, features: number[]): [number, number, number] {
  const x = standardizeVec(features, weights.mean, weights.std);
  const logits = [0, 1, 2].map((c) => weights.b[c]! + weights.w[c]!.reduce((acc, wj, j) => acc + wj * x[j]!, 0));
  const p = softmax(logits);
  return [p[0]!, p[1]!, p[2]!];
}

export function predictLogReg(weights: LogRegWeights, features: number[]): Outcome1x2 {
  const [home, draw, away] = predictLogRegRaw(weights, features);
  return { home, draw, away };
}

/**
 * Envuelve unos pesos entrenados como un PredictionModel enchufable al ensemble.
 * La explicación lista la contribución de cada feature al logit local−visita
 * (peso·valor estandarizado), aprovechando la interpretabilidad del modelo.
 */
export function createLogRegModel(weights: LogRegWeights, version = '1.0.0'): PredictionModel<number[]> {
  return {
    id: 'logreg',
    version,
    predict(features: number[]): ModelPrediction {
      const [home, draw, away] = predictLogRegRaw(weights, features);
      const x = standardizeVec(features, weights.mean, weights.std);
      const expl: Explanation = emptyExplanation();
      // contribución de cada feature a (logit_home − logit_away)
      for (let j = 0; j < weights.featureNames.length; j++) {
        const contrib = (weights.w[0]![j]! - weights.w[2]![j]!) * x[j]!;
        if (Math.abs(contrib) < 1e-6) continue;
        addFactor(expl, {
          key: `ml_${weights.featureNames[j]}`,
          label: weights.featureNames[j]!,
          value: contrib,
          unit: 'raw',
          impact: Math.tanh(contrib),
          detail: `${contrib >= 0 ? '+' : ''}${contrib.toFixed(2)}`,
        });
      }
      expl.summary = `ML local/empate/visita ${(home * 100).toFixed(0)}/${(draw * 100).toFixed(0)}/${(away * 100).toFixed(0)}`;
      return { oneXtwo: { home, draw, away }, explanation: expl };
    },
  };
}
