// -----------------------------------------------------------------------------
// Contrato de EXPLICABILIDAD.
//
// Filosofía del proyecto: la app no debe decir solo "gana el local", sino POR QUÉ.
// Cada función del modelo que produce un número puede además emitir la lista de
// factores que lo justifican, con su contribución direccional. La UI (Fase 5) y
// el panel "Explainable AI" consumen esta estructura; aquí solo se define y se
// rellena de forma pura y testeable. No depende de UI ni de Supabase.
// -----------------------------------------------------------------------------

/** Unidad natural del valor de un factor (para que la UI lo formatee bien). */
export type FactorUnit =
  | 'elo' // puntos Elo (p.ej. +120)
  | 'mult' // multiplicador sobre la lambda/probabilidad (1.0 = neutro)
  | 'goals' // goles esperados (p.ej. +0.30)
  | 'prob' // probabilidad/porcentaje
  | 'days' // días (descanso)
  | 'score' // índice normalizado [-1, 1]
  | 'raw';

/** Una contribución explicable de un factor concreto a una predicción. */
export interface FactorContribution {
  /** clave estable y única dentro de la explicación (p.ej. 'home_attack'). */
  key: string;
  /** etiqueta legible (p.ej. 'Ataque local'). */
  label: string;
  /** valor del factor en su `unit` natural. */
  value: number;
  unit: FactorUnit;
  /**
   * Efecto direccional SOBRE EL LOCAL, normalizado ~[-1, 1]: positivo favorece al
   * local, negativo al visitante. Sirve para ordenar por relevancia y colorear.
   */
  impact: number;
  /** texto ya formateado para mostrar (p.ej. '+8%', '+0.30 goles'). */
  detail: string;
}

export interface Explanation {
  factors: FactorContribution[];
  /** resumen opcional de una línea, generado por quien compone la predicción. */
  summary?: string;
}

export function emptyExplanation(): Explanation {
  return { factors: [] };
}

/** Añade un factor (muta y devuelve la misma explicación, para encadenar). */
export function addFactor(e: Explanation, f: FactorContribution): Explanation {
  e.factors.push(f);
  return e;
}

/** Formatea un multiplicador como porcentaje con signo: 1.08 -> '+8%'. */
export function fmtMult(m: number): string {
  const pct = Math.round((m - 1) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

/** Formatea un valor con signo y unidad simple: (0.3,'goles') -> '+0.30 goles'. */
export function fmtSigned(value: number, unit: string, digits = 2): string {
  const s = value >= 0 ? '+' : '';
  return `${s}${value.toFixed(digits)} ${unit}`.trim();
}

/**
 * Helper para registrar un factor MULTIPLICATIVO (el caso dominante en el cálculo
 * de lambdas): traduce el multiplicador a `impact` y `detail` de forma consistente.
 * `impactSign` = +1 si subir el multiplicador favorece al local, -1 si al visitante.
 */
export function multFactor(
  key: string,
  label: string,
  mult: number,
  impactSign: 1 | -1 = 1,
): FactorContribution {
  return {
    key,
    label,
    value: mult,
    unit: 'mult',
    impact: impactSign * Math.tanh((mult - 1) * 3),
    detail: fmtMult(mult),
  };
}

/** Ordena los factores por relevancia (|impact|) descendente. */
export function rankFactors(e: Explanation): FactorContribution[] {
  return [...e.factors].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
}
