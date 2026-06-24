import type { ReliabilityBin } from '@sti/model';

// Reliability diagram en SVG (sin librería de charts). Eje X = prob. predicha,
// eje Y = frecuencia real. La diagonal es la calibración perfecta; los puntos por
// encima = el modelo subestima, por debajo = sobreestima. Radio ∝ nº de muestras.
const S = 260;
const PAD = 28;
const x = (v: number) => PAD + v * (S - 2 * PAD);
const y = (v: number) => S - PAD - v * (S - 2 * PAD);

export default function ReliabilityDiagram({ bins }: { bins: ReliabilityBin[] }) {
  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const pts = bins.filter((b) => b.count > 0);

  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="w-full max-w-sm" role="img" aria-label="Reliability diagram">
      {/* marco */}
      <rect x={PAD} y={PAD} width={S - 2 * PAD} height={S - 2 * PAD} fill="none" stroke="#1c2533" />
      {/* diagonal perfecta */}
      <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="#5b6b7f" strokeDasharray="4 4" />
      {/* gridlines */}
      {[0.25, 0.5, 0.75].map((g) => (
        <g key={g}>
          <line x1={x(g)} y1={PAD} x2={x(g)} y2={S - PAD} stroke="#11161f" />
          <line x1={PAD} y1={y(g)} x2={S - PAD} y2={y(g)} stroke="#11161f" />
        </g>
      ))}
      {/* línea del modelo */}
      <polyline
        fill="none"
        stroke="#38bdf8"
        strokeWidth="1.5"
        points={pts.map((b) => `${x(b.meanPredicted)},${y(b.observed)}`).join(' ')}
      />
      {/* puntos */}
      {pts.map((b, i) => (
        <circle
          key={i}
          cx={x(b.meanPredicted)}
          cy={y(b.observed)}
          r={3 + 5 * (b.count / maxCount)}
          fill="#22c55e"
          fillOpacity={0.75}
        />
      ))}
      {/* etiquetas ejes */}
      <text x={S / 2} y={S - 6} textAnchor="middle" fontSize="9" fill="#5b6b7f">prob. predicha</text>
      <text x={10} y={S / 2} textAnchor="middle" fontSize="9" fill="#5b6b7f" transform={`rotate(-90 10 ${S / 2})`}>
        frecuencia real
      </text>
    </svg>
  );
}
