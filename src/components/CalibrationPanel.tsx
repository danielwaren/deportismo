import { useEffect, useState } from 'react';
import { brierScore, logLoss, reliabilityBins, type CalibrationPoint } from '@sti/model';
import { getCalibrationPoints, isConfigured } from '../lib/queries';
import ReliabilityDiagram from './ReliabilityDiagram';

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="panel p-4">
      <div className="label">{label}</div>
      <div className="tabular mt-1 text-2xl">{value}</div>
      <div className="mt-1 text-[11px] text-terminal-muted">{hint}</div>
    </div>
  );
}

export default function CalibrationPanel() {
  const [pts, setPts] = useState<CalibrationPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getCalibrationPoints()
      .then((p) => active && setPts(p))
      .catch((e) => active && setError(String(e?.message ?? e)));
    return () => {
      active = false;
    };
  }, []);

  if (error) return <p className="text-sm text-signal-down">Error: {error}</p>;
  if (!pts) return <p className="text-sm text-terminal-muted">Cargando calibración…</p>;

  if (pts.length === 0) {
    return (
      <p className="text-sm text-terminal-muted">
        Aún no hay predicciones resueltas. La calibración aparece cuando hay partidos
        terminados con predicción registrada.
      </p>
    );
  }

  const brier = brierScore(pts);
  const ll = logLoss(pts);
  const bins = reliabilityBins(pts, 10);

  return (
    <div className="space-y-4">
      {!isConfigured && (
        <span className="inline-block rounded bg-signal-warn/20 px-2 py-0.5 text-[11px] text-signal-warn">
          modo demo · dataset ilustrativo
        </span>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Brier score" value={brier.toFixed(3)} hint="0 = perfecto · 0.25 = azar" />
        <Metric label="Log-loss" value={ll.toFixed(3)} hint="menor es mejor" />
        <Metric label="Muestras" value={String(pts.length)} hint="predicciones resueltas" />
      </div>

      <div className="panel p-4">
        <div className="label mb-2">Reliability diagram</div>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <ReliabilityDiagram bins={bins} />
          <p className="max-w-xs text-xs text-terminal-muted">
            Cada punto es un decil de probabilidad. Si caen sobre la diagonal, el modelo
            está bien calibrado. Por encima = subestima; por debajo = sobreestima (exceso
            de confianza). El tamaño del punto refleja cuántas predicciones cayeron ahí.
          </p>
        </div>
      </div>
    </div>
  );
}
