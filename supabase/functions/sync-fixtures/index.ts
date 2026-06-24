import { apiFootball } from '../_shared/apiFootball.ts';
import { TTL } from '../_shared/cache.ts';
import { admin } from '../_shared/supabaseAdmin.ts';
import { mapStatus, upsertLeague, upsertTeam } from '../_shared/upsert.ts';

// sync-fixtures — punto de entrada del calendario.
//
// COSTE DE CUOTA: 1 sola request por llamada (un /fixtures?date=...). Para los
// partidos de selección de hoy (Suiza-Canadá, Bosnia-Catar) basta con esto y
// luego filtrar por nombre de equipo del lado del servidor.
//
// Body JSON admitido (todo opcional):
//   { "date": "2026-06-24" }                      -> todos los fixtures del día
//   { "date": "...", "teamNames": ["Switzerland","Canada","Bosnia","Qatar"] }
//   { "league": 1, "season": 2026 }               -> por competición
//
// Ejemplo:
//   curl -X POST $URL/functions/v1/sync-fixtures \
//     -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
//     -d '{"date":"2026-06-24","teamNames":["Switzerland","Canada","Bosnia and Herzegovina","Qatar"]}'

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const params: Record<string, string | number> = {};
    if (body.date) params.date = body.date;
    if (body.league) params.league = body.league;
    if (body.season) params.season = body.season;
    if (Object.keys(params).length === 0) {
      return Response.json({ error: 'Indica "date" o "league"+"season".' }, { status: 400 });
    }

    const data = await apiFootball<any>('fixtures', params, TTL.fixtures);
    let items: any[] = data?.response ?? [];

    // Filtro por nombre de equipo (ahorra escrituras; no gasta cuota extra).
    if (Array.isArray(body.teamNames) && body.teamNames.length) {
      const wanted = body.teamNames.map((n: string) => n.toLowerCase());
      items = items.filter((it) => {
        const h = it.teams?.home?.name?.toLowerCase() ?? '';
        const a = it.teams?.away?.name?.toLowerCase() ?? '';
        return wanted.some((w: string) => h.includes(w) || a.includes(w));
      });
    }

    const synced: number[] = [];
    for (const it of items) {
      const leagueId = await upsertLeague({
        id: it.league.id,
        name: it.league.name,
        country: it.league.country,
        season: it.league.season,
      });
      const homeId = await upsertTeam(it.teams.home);
      const awayId = await upsertTeam(it.teams.away);

      const { data: fx, error } = await admin
        .from('fixtures')
        .upsert(
          {
            api_id: it.fixture.id,
            sport: 'football',
            league_id: leagueId,
            home_team_id: homeId,
            away_team_id: awayId,
            kickoff: it.fixture.date,
            status: mapStatus(it.fixture.status?.short ?? 'NS'),
            round: it.league.round,
            home_goals: it.goals?.home ?? null,
            away_goals: it.goals?.away ?? null,
          },
          { onConflict: 'api_id,sport' },
        )
        .select('id')
        .single();
      if (error) throw error;
      synced.push(fx.id);
    }

    return Response.json({ matched: items.length, fixtureIds: synced });
  } catch (e) {
    const status = e?.name === 'QuotaError' ? 429 : e?.name === 'RateLimitError' ? 429 : 500;
    return Response.json({ error: String(e?.message ?? e) }, { status });
  }
});
