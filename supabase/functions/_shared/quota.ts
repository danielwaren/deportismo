import { admin } from './supabaseAdmin.ts';

// Presupuesto DURO de la cuota de API-Football (plan free).
const DAILY_BUDGET = Number(Deno.env.get('DAILY_REQUEST_BUDGET') ?? '100');
const PER_MINUTE = 10;

export class QuotaError extends Error {}
export class RateLimitError extends Error {}

/**
 * Reserva una unidad de cuota ANTES de llamar a API-Football. Cuenta las filas
 * de api_request_log de hoy (presupuesto diario) y del último minuto (10 req/min).
 * Lanza si se supera cualquiera de los dos límites. Devuelve el restante diario.
 *
 * Nota: hay una ventana de carrera mínima, aceptable para un único usuario de
 * bajo volumen. Si en el futuro hay concurrencia, mover a una RPC atómica.
 */
export async function reserveQuota(endpoint: string): Promise<{ remaining: number }> {
  const today = new Date().toISOString().slice(0, 10);

  const { count: dayCount } = await admin
    .from('api_request_log')
    .select('*', { count: 'exact', head: true })
    .eq('day', today);

  if ((dayCount ?? 0) >= DAILY_BUDGET) {
    throw new QuotaError(
      `Cuota diaria agotada (${DAILY_BUDGET}). Reintentar mañana o usar solo caché.`,
    );
  }

  const since = new Date(Date.now() - 60_000).toISOString();
  const { count: minuteCount } = await admin
    .from('api_request_log')
    .select('*', { count: 'exact', head: true })
    .gte('called_at', since);

  if ((minuteCount ?? 0) >= PER_MINUTE) {
    throw new RateLimitError(`Límite de ${PER_MINUTE} req/min alcanzado. Reintentar en unos segundos.`);
  }

  await admin.from('api_request_log').insert({ endpoint });
  return { remaining: DAILY_BUDGET - (dayCount ?? 0) - 1 };
}

/** Cuántas solicitudes se han usado hoy (para el QuotaMeter del frontend). */
export async function requestsToday(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { count } = await admin
    .from('api_request_log')
    .select('*', { count: 'exact', head: true })
    .eq('day', today);
  return count ?? 0;
}
