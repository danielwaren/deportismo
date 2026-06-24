interface Props {
  home: number;
  draw: number;
  away: number;
  labels?: [string, string, string];
}

const fmt = (x: number) => `${(x * 100).toFixed(1)}%`;

// Barra 1X2 de tres segmentos, estilo terminal.
export default function Prob1x2({ home, draw, away, labels = ['1', 'X', '2'] }: Props) {
  return (
    <div>
      <div className="flex h-7 w-full overflow-hidden rounded-md border border-terminal-border">
        <div
          className="flex items-center justify-center bg-signal-up/80 text-[11px] font-medium text-black"
          style={{ width: `${home * 100}%` }}
        >
          {home > 0.12 ? fmt(home) : ''}
        </div>
        <div
          className="flex items-center justify-center bg-terminal-muted/60 text-[11px] font-medium text-black"
          style={{ width: `${draw * 100}%` }}
        >
          {draw > 0.12 ? fmt(draw) : ''}
        </div>
        <div
          className="flex items-center justify-center bg-signal-info/80 text-[11px] font-medium text-black"
          style={{ width: `${away * 100}%` }}
        >
          {away > 0.12 ? fmt(away) : ''}
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-terminal-muted">
        <span>{labels[0]} {fmt(home)}</span>
        <span>{labels[1]} {fmt(draw)}</span>
        <span>{labels[2]} {fmt(away)}</span>
      </div>
    </div>
  );
}
