import { admin } from './supabaseAdmin.ts';

// TTL por tipo de dato (segundos). Política: lo que cambia poco se cachea mucho.
export const TTL = {
  standings: 7 * 24 * 3600, // semanal
  teams: 30 * 24 * 3600,    // mensual
  injuries: 24 * 3600,      // 24 h
  fixtures: 3600,           // 1 h (calendario); en vivo no es viable en free
  odds: 6 * 3600,           // pre-match
} as const;

export async function getCached(endpoint: string, paramsHash: string): Promise<unknown | null> {
  const { data } = await admin
    .from('api_cache')
    .select('response, expires_at')
    .eq('endpoint', endpoint)
    .eq('params_hash', paramsHash)
    .maybeSingle();

  if (data && new Date(data.expires_at) > new Date()) return data.response;
  return null;
}

export async function setCached(
  endpoint: string,
  paramsHash: string,
  response: unknown,
  ttlSeconds: number,
): Promise<void> {
  const now = new Date();
  await admin.from('api_cache').upsert(
    {
      endpoint,
      params_hash: paramsHash,
      response,
      fetched_at: now.toISOString(),
      expires_at: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
    },
    { onConflict: 'endpoint,params_hash' },
  );
}
