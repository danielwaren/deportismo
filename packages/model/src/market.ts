// -----------------------------------------------------------------------------
// MOVIMIENTO DEL MERCADO (#10).
//
// Primitivas puras para analizar una SERIE TEMPORAL de cuotas de una selección:
// cuánto se ha movido, en qué dirección (acortando = entra dinero al favorito;
// drifting = se aleja), detección de "steam move" (movimiento brusco y rápido,
// señal de dinero "sharp") y Closing Line Value. La captura/persistencia del
// histórico es responsabilidad de la BD (odds + cron); aquí solo el análisis.
// -----------------------------------------------------------------------------

export interface OddsTick {
  t: number; // marca temporal (ms epoch) o índice de orden
  odds: number; // cuota decimal en ese instante
}

export type MoveDirection = 'shortening' | 'drifting' | 'stable';

export interface MovementResult {
  open: number; // primera cuota
  current: number; // última cuota
  pctMove: number; // (current − open) / open  (negativo = acortó)
  direction: MoveDirection;
  steam: boolean; // ¿hubo un movimiento brusco?
  maxStepDropPct: number; // mayor caída porcentual en un solo paso
}

export interface MovementOptions {
  /** umbral de cuota estable (def. 1.5% de variación total). */
  stableThreshold?: number;
  /** caída porcentual en un paso para marcar steam (def. 6%). */
  steamStepPct?: number;
}

/** Analiza una serie de cuotas (ordenada por t ascendente). */
export function analyzeMovement(series: OddsTick[], opts: MovementOptions = {}): MovementResult {
  const stableTh = opts.stableThreshold ?? 0.015;
  const steamTh = opts.steamStepPct ?? 0.06;
  if (series.length === 0) {
    return { open: 0, current: 0, pctMove: 0, direction: 'stable', steam: false, maxStepDropPct: 0 };
  }
  const sorted = [...series].sort((a, b) => a.t - b.t);
  const open = sorted[0]!.odds;
  const current = sorted[sorted.length - 1]!.odds;
  const pctMove = open > 0 ? (current - open) / open : 0;

  let maxStepDropPct = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!.odds;
    const cur = sorted[i]!.odds;
    if (prev > 0) {
      const drop = (prev - cur) / prev; // positivo = la cuota bajó (acortó)
      if (drop > maxStepDropPct) maxStepDropPct = drop;
    }
  }

  const direction: MoveDirection =
    Math.abs(pctMove) < stableTh ? 'stable' : pctMove < 0 ? 'shortening' : 'drifting';

  return { open, current, pctMove, direction, steam: maxStepDropPct >= steamTh, maxStepDropPct };
}

/**
 * Closing Line Value: cuánto mejor que el cierre se apostó.
 *   CLV = betOdds / closingOdds − 1   (positivo = se batió la línea de cierre)
 * Es el mejor predictor a largo plazo de rentabilidad.
 */
export function closingLineValue(betOdds: number, closingOdds: number): number {
  return closingOdds > 1 ? betOdds / closingOdds - 1 : 0;
}
