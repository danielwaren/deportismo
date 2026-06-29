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

/**
 * Expected Calibration Error (#8): media ponderada |confianza − acierto| sobre
 * los bins. 0 = perfectamente calibrado. Resume el reliability diagram en un nº.
 */
export function calibrationError(points: CalibrationPoint[], nBins = 10): number {
  if (points.length === 0) return 0;
  const bins = reliabilityBins(points, nBins);
  let ece = 0;
  for (const b of bins) {
    if (b.count === 0) continue;
    ece += (b.count / points.length) * Math.abs(b.meanPredicted - b.observed);
  }
  return ece;
}

// -----------------------------------------------------------------------------
// MÉTRICAS DE TRADING (#8): ROI, Yield, CLV. Operan sobre apuestas liquidadas.
// -----------------------------------------------------------------------------

export interface SettledBet {
  stake: number; // importe apostado
  odds: number; // cuota decimal a la que se apostó
  won: boolean; // ¿ganó?
  closingOdds?: number; // cuota de cierre (para CLV)
}

export interface TradingMetrics {
  bets: number;
  staked: number;
  profit: number; // beneficio neto
  roi: number; // profit / staked
  yield: number; // == roi (alias habitual en apuestas), en %
  hitRate: number; // fracción de aciertos
  clv: number; // closing line value medio (positivo = batir el cierre)
}

/**
 * Calcula ROI/Yield/HitRate/CLV de un conjunto de apuestas liquidadas.
 *   profit_i = won ? stake·(odds−1) : −stake
 *   CLV_i    = odds/closingOdds − 1  (cuánto mejor que el cierre se apostó)
 */
export function tradingMetrics(bets: SettledBet[]): TradingMetrics {
  if (bets.length === 0) {
    return { bets: 0, staked: 0, profit: 0, roi: 0, yield: 0, hitRate: 0, clv: 0 };
  }
  let staked = 0;
  let profit = 0;
  let wins = 0;
  let clvSum = 0;
  let clvN = 0;
  for (const b of bets) {
    staked += b.stake;
    profit += b.won ? b.stake * (b.odds - 1) : -b.stake;
    if (b.won) wins++;
    if (b.closingOdds && b.closingOdds > 1) {
      clvSum += b.odds / b.closingOdds - 1;
      clvN++;
    }
  }
  const roi = staked > 0 ? profit / staked : 0;
  return {
    bets: bets.length,
    staked,
    profit,
    roi,
    yield: roi * 100,
    hitRate: wins / bets.length,
    clv: clvN > 0 ? clvSum / clvN : 0,
  };
}

const betProfit = (b: SettledBet) => (b.won ? b.stake * (b.odds - 1) : -b.stake);

/** Curva de crecimiento de banca: saldo tras cada apuesta (incluye el inicial). */
export function bankrollCurve(bets: SettledBet[], start = 100): number[] {
  const curve = [start];
  let bank = start;
  for (const b of bets) {
    bank += betProfit(b);
    curve.push(bank);
  }
  return curve;
}

/** Máximo drawdown (caída pico-valle) de una curva, como fracción [0,1]. */
export function maxDrawdown(curve: number[]): number {
  let peak = curve[0] ?? 0;
  let mdd = 0;
  for (const v of curve) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? (peak - v) / peak : 0;
    if (dd > mdd) mdd = dd;
  }
  return mdd;
}

/** Profit factor = ganancias brutas / pérdidas brutas. >1 = rentable. */
export function profitFactor(bets: SettledBet[]): number {
  let win = 0;
  let loss = 0;
  for (const b of bets) {
    const p = betProfit(b);
    if (p >= 0) win += p;
    else loss += -p;
  }
  return loss > 0 ? win / loss : win > 0 ? Infinity : 0;
}

/** Sharpe ratio de los retornos por apuesta (media/desviación). */
export function sharpeRatio(bets: SettledBet[]): number {
  if (bets.length < 2) return 0;
  const rets = bets.map((b) => betProfit(b) / b.stake);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  const sd = Math.sqrt(variance);
  return sd > 0 ? mean / sd : 0;
}
