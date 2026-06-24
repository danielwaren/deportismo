import { reserveQuota } from './quota.ts';
import { getCached, setCached } from './cache.ts';

const HOST = Deno.env.get('API_FOOTBALL_HOST') ?? 'v3.football.api-sports.io';

/**
 * Punto ÚNICO de acceso a API-Football. Orden estricto:
 *   1. Caché (api_cache) — si hay y no expiró, se devuelve sin gastar cuota.
 *   2. reserveQuota() — respeta 100/día y 10/min; lanza si se supera.
 *   3. fetch real + guardar en caché.
 * La API key vive como secret (API_FOOTBALL_KEY); jamás llega al cliente.
 */
export async function apiFootball<T = any>(
  path: string,
  params: Record<string, string | number> = {},
  ttlSeconds = 3600,
): Promise<T> {
  const search = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  );
  search.sort();
  const paramsHash = search.toString();

  const cached = await getCached(path, paramsHash);
  if (cached !== null) return cached as T;

  await reserveQuota(path);

  const key = Deno.env.get('API_FOOTBALL_KEY');
  if (!key) throw new Error('Falta el secret API_FOOTBALL_KEY.');

  const res = await fetch(`https://${HOST}/${path}?${paramsHash}`, {
    headers: { 'x-apisports-key': key },
  });
  if (!res.ok) {
    throw new Error(`API-Football ${path} -> ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as T;
  await setCached(path, paramsHash, json, ttlSeconds);
  return json;
}
