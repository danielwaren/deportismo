// Tipos compartidos del modelo. Sin dependencias de UI ni de Supabase: TS puro,
// importable tanto desde Node (frontend/tests) como desde Deno (Edge Functions).

export interface EnsembleWeights {
  poisson: number;
  elo: number;
  context: number;
}

export interface EloParams {
  homeAdvantage: number; // puntos Elo. Por defecto +65 (ver README).
  kBase: number;         // k-factor base; se escala por importancia del partido.
}

export interface DixonColesParams {
  rho: number;           // corrección de marcadores bajos (típ. -0.1..-0.2)
  decayHalflife: number; // vida media (en nº de partidos) del decaimiento temporal
}

/** Probabilidades 1X2 (deben sumar 1). */
export interface Outcome1x2 {
  home: number;
  draw: number;
  away: number;
}

/** Salida completa del modelo Poisson/Dixon-Coles para un partido. */
export interface PoissonOutput {
  lambdaHome: number;
  lambdaAway: number;
  scoreMatrix: number[][]; // [golesHome][golesAway] = probabilidad
  oneXtwo: Outcome1x2;
  over: { '1.5': number; '2.5': number; '3.5': number };
  btts: number;            // ambos marcan
  mostLikelyScore: [number, number];
}

/** Modificadores contextuales (el "ojo del trader"), normalizados ~[-1, 1]. */
export interface ContextFactors {
  injuriesHome: number;
  injuriesAway: number;
  formHome: number;
  formAway: number;
  restAdvantage: number; // a favor del local si > 0
  h2h: number;           // pesa menos que la forma
  pressure: number;      // importancia/etapa del torneo
}
