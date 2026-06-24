import { admin } from './supabaseAdmin.ts';

/** Estado API-Football (short) -> enum fixture_status de la BD. */
export function mapStatus(short: string): string {
  if (['FT', 'AET', 'PEN'].includes(short)) return 'finished';
  if (['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'].includes(short)) return 'live';
  if (short === 'PST') return 'postponed';
  if (['CANC', 'ABD', 'AWD', 'WO'].includes(short)) return 'cancelled';
  return 'scheduled';
}

/** Upsert por (api_id, ...) devolviendo el id local. */
export async function upsertTeam(api: {
  id: number;
  name: string;
  logo?: string;
}): Promise<number> {
  const { data, error } = await admin
    .from('teams')
    .upsert(
      { api_id: api.id, sport: 'football', name: api.name, logo: api.logo },
      { onConflict: 'api_id,sport' },
    )
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function upsertLeague(api: {
  id: number;
  name: string;
  country?: string;
  season: number;
}): Promise<number> {
  const { data, error } = await admin
    .from('leagues')
    .upsert(
      { api_id: api.id, sport: 'football', name: api.name, country: api.country, season: api.season },
      { onConflict: 'api_id,season,sport' },
    )
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}
