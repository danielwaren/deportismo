import { apiFootball } from '../_shared/apiFootball.ts';
import { TTL } from '../_shared/cache.ts';
import { admin } from '../_shared/supabaseAdmin.ts';
import { devig, impliedProb } from '../../../packages/model/src/value.ts';

// sync-odds — cuotas pre-match por fixture. COSTE: 1 request.
// Body: { "fixtureApiId": 12345, "fixtureId": 7 }
// fixtureId = id LOCAL (de la tabla fixtures) para enlazar las cuotas.
//
// Solo pre-match: las cuotas in-play (live) requieren plan de pago.

Deno.serve(async (req) => {
  try {
    const { fixtureApiId, fixtureId } = await req.json().catch(() => ({}));
    if (!fixtureApiId || !fixtureId) {
      return Response.json({ error: 'Faltan "fixtureApiId" y "fixtureId".' }, { status: 400 });
    }

    const data = await apiFootball<any>('odds', { fixture: fixtureApiId }, TTL.odds);
    const books: any[] = data?.response?.[0]?.bookmakers ?? [];

    const rows: any[] = [];
    for (const bk of books) {
      for (const bet of bk.bets ?? []) {
        // Nos quedamos con el mercado 1X2 ("Match Winner").
        if (!/match winner|1x2/i.test(bet.name)) continue;
        const odds = bet.values.map((v: any) => Number(v.odd));
        const fair = devig(odds); // probabilidad sin margen del bookie
        bet.values.forEach((v: any, i: number) => {
          const sel = /home|1/i.test(v.value) ? 'home' : /away|2/i.test(v.value) ? 'away' : 'draw';
          rows.push({
            fixture_id: fixtureId,
            bookmaker: bk.name,
            market: '1x2',
            selection: sel,
            odds: Number(v.odd),
            implied_prob: fair[i] ?? impliedProb(Number(v.odd)),
          });
        });
      }
    }

    if (rows.length) await admin.from('odds').insert(rows);
    return Response.json({ bookmakers: books.length, oddsRows: rows.length });
  } catch (e) {
    const status = ['QuotaError', 'RateLimitError'].includes(e?.name) ? 429 : 500;
    return Response.json({ error: String(e?.message ?? e) }, { status });
  }
});
