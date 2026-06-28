// -----------------------------------------------------------------------------
// Contrato común de MODELO PREDICTIVO.
//
// Todo motor que produzca un 1X2 (Dixon-Coles, Elo, y en el futuro XGBoost,
// LightGBM, una red neuronal, etc.) implementa esta interfaz. Así el ensemble
// puede tratarlos de forma uniforme y añadir nuevos modelos SIN tocar el resto
// del sistema (objetivo de la Fase 7 "Machine Learning").
// -----------------------------------------------------------------------------

import type { Outcome1x2 } from './types';
import type { Explanation } from './explain';

/** Salida estándar de cualquier modelo: probabilidades + por qué. */
export interface ModelPrediction {
  oneXtwo: Outcome1x2;
  explanation: Explanation;
  /** confianza propia del modelo en [0,1] (opcional; el índice global es Fase 4). */
  confidence?: number;
}

/**
 * Un modelo predictivo enchufable. `I` es su tipo de entrada (cada modelo define
 * el suyo: el Poisson necesita lambdas, el Elo ratings, un ML un vector de
 * features). El ensemble los combina vía sus `oneXtwo`.
 */
export interface PredictionModel<I = unknown> {
  /** identificador estable: 'dixon-coles' | 'elo' | 'xgboost' | ... */
  id: string;
  version: string;
  predict(input: I): ModelPrediction;
}

/** Miembro del ensemble: un modelo + su peso (que la Fase 3 hará dinámico). */
export interface EnsembleMember<I = unknown> {
  model: PredictionModel<I>;
  weight: number;
}
