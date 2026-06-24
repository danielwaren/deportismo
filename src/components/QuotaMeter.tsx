import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Medidor de cuota diaria de API-Football. Lee el conteo del día desde
// api_request_log vía una RPC/función (se implementa en Fase 2). Por ahora
// muestra el presupuesto y un estado de carga: el frontend NUNCA llama a la API.
const DAILY_BUDGET = 100;

export default function QuotaMeter() {
  const [used, setUsed] = useState<number | null>(null);

  useEffect(() => {
    // Fase 2: reemplazar por supabase.rpc('api_requests_today').
    // De momento dejamos el placeholder sin tocar cuota real.
    let active = true;
    (async () => {
      const { data } = await supabase.rpc('api_requests_today').then(
        (r) => r,
        () => ({ data: null }),
      );
      if (active) setUsed(typeof data === 'number' ? data : 0);
    })();
    return () => {
      active = false;
    };
  }, []);

  const remaining = used === null ? null : DAILY_BUDGET - used;
  const pct = used === null ? 0 : Math.min(100, (used / DAILY_BUDGET) * 100);
  const tone = pct > 85 ? 'bg-signal-down' : pct > 60 ? 'bg-signal-warn' : 'bg-signal-up';

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <span className="label">Cuota API-Football (hoy)</span>
        <span className="tabular text-sm">
          {used === null ? '—' : `${used} / ${DAILY_BUDGET}`}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-terminal-border">
        <div className={`h-full ${tone} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-terminal-muted">
        {remaining === null
          ? 'Conectando…'
          : `${remaining} solicitudes restantes · 10 req/min`}
      </p>
    </div>
  );
}
