import { apiFootball } from '../_shared/apiFootball.ts';
import { TTL } from '../_shared/cache.ts';
import { admin } from '../_shared/supabaseAdmin.ts';

// sync-injuries — lesionados/suspendidos por fixture. COSTE: 1 request.
// Body: { "fixtureApiId": 12345 }  (id de API-Football del partido)
//
// Cobertura: en amistosos de selección la cobertura de lesiones suele ser pobre.
// El hueco se cubre manualmente vía context_notes (ver README).

Deno.serve(async (req) => {
  try {
    const { fixtureApiId } = await req.json().catch(() => ({}));
    if (!fixtureApiId) {
      return Response.json({ error: 'Falta "fixtureApiId".' }, { status: 400 });
    }

    const data = await apiFootball<any>('injuries', { fixture: fixtureApiId }, TTL.injuries);
    const rows: any[] = data?.response ?? [];

    let upserts = 0;
    for (const r of rows) {
      // Resolver el jugador local por api_id (debe existir vía sync-teams).
      const { data: player } = await admin
        .from('players')
        .select('id')
        .eq('api_id', r.player.id)
        .maybeSingle();
      if (!player) continue;

      const status = /susp/i.test(r.player.reason ?? '') ? 'suspended' : 'injured';
      await admin.from('player_status').insert({
        player_id: player.id,
        status,
        reason: r.player.reason,
        source: 'api-football',
      });
      upserts++;
    }

    return Response.json({ found: rows.length, recorded: upserts });
  } catch (e) {
    const status = ['QuotaError', 'RateLimitError'].includes(e?.name) ? 429 : 500;
    return Response.json({ error: String(e?.message ?? e) }, { status });
  }
});
