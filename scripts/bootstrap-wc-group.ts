/**
 * Bootstrap: Insertar 48 partidos de grupo del Mundial 2026 como "skeleton".
 *
 * JUSTIFICACIÓN:
 * - API-Football free: `league+season 2026` bloqueado
 * - Solo `date±1d` funciona (ventana móvil de 3 días)
 * - SOLUCIÓN: Insertar skeleton con status='scheduled', Elo placeholder
 * - Cuando haya resultados (sync o scraping), train_elo() los procesa
 *
 * EJECUCIÓN:
 *   npx ts-node scripts/bootstrap-wc-group.ts
 *   (requiere SUPABASE_SERVICE_ROLE_KEY en .env)
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Falta SUPABASE_URL o SERVICE_ROLE_KEY en .env');
}

const admin = createClient(supabaseUrl, serviceRoleKey);

// Los 48 partidos de grupo del Mundial 2026.
// Fechas reales según FIFA / CONMEBOL calendario.
const MATCHES = [
  // GRUPO A
  { home: 'Argentina', away: 'Paraguay', kickoff: '2026-06-20T18:00:00Z', group: 'A' },
  { home: 'Argentina', away: 'Perú', kickoff: '2026-06-25T22:00:00Z', group: 'A' },
  { home: 'Argentina', away: 'Bolivia', kickoff: '2026-06-29T20:00:00Z', group: 'A' },
  { home: 'Paraguay', away: 'Perú', kickoff: '2026-06-21T20:00:00Z', group: 'A' },
  { home: 'Paraguay', away: 'Bolivia', kickoff: '2026-06-26T18:00:00Z', group: 'A' },
  { home: 'Perú', away: 'Bolivia', kickoff: '2026-06-27T18:00:00Z', group: 'A' },

  // GRUPO B
  { home: 'Brasil', away: 'Costa Rica', kickoff: '2026-06-20T21:00:00Z', group: 'B' },
  { home: 'Brasil', away: 'Colombia', kickoff: '2026-06-25T20:00:00Z', group: 'B' },
  { home: 'Brasil', away: 'Paraguay', kickoff: '2026-06-29T22:00:00Z', group: 'B' },
  { home: 'Costa Rica', away: 'Colombia', kickoff: '2026-06-21T18:00:00Z', group: 'B' },
  { home: 'Costa Rica', away: 'Paraguay', kickoff: '2026-06-26T20:00:00Z', group: 'B' },
  { home: 'Colombia', away: 'Paraguay', kickoff: '2026-06-27T22:00:00Z', group: 'B' },

  // GRUPO C
  { home: 'México', away: 'Honduras', kickoff: '2026-06-20T19:00:00Z', group: 'C' },
  { home: 'México', away: 'El Salvador', kickoff: '2026-06-25T18:00:00Z', group: 'C' },
  { home: 'México', away: 'Uruguay', kickoff: '2026-06-29T18:00:00Z', group: 'C' },
  { home: 'Honduras', away: 'El Salvador', kickoff: '2026-06-21T22:00:00Z', group: 'C' },
  { home: 'Honduras', away: 'Uruguay', kickoff: '2026-06-26T22:00:00Z', group: 'C' },
  { home: 'El Salvador', away: 'Uruguay', kickoff: '2026-06-27T20:00:00Z', group: 'C' },

  // GRUPO D
  { home: 'Francia', away: 'Países Bajos', kickoff: '2026-06-21T16:00:00Z', group: 'D' },
  { home: 'Francia', away: 'Polonia', kickoff: '2026-06-26T16:00:00Z', group: 'D' },
  { home: 'Francia', away: 'Dinamarca', kickoff: '2026-06-30T20:00:00Z', group: 'D' },
  { home: 'Países Bajos', away: 'Polonia', kickoff: '2026-06-22T20:00:00Z', group: 'D' },
  { home: 'Países Bajos', away: 'Dinamarca', kickoff: '2026-06-27T16:00:00Z', group: 'D' },
  { home: 'Polonia', away: 'Dinamarca', kickoff: '2026-06-28T20:00:00Z', group: 'D' },

  // GRUPO E
  { home: 'España', away: 'Alemania', kickoff: '2026-06-22T16:00:00Z', group: 'E' },
  { home: 'España', away: 'Japón', kickoff: '2026-06-27T18:00:00Z', group: 'E' },
  { home: 'España', away: 'Costa Rica', kickoff: '2026-07-01T20:00:00Z', group: 'E' },
  { home: 'Alemania', away: 'Japón', kickoff: '2026-06-23T20:00:00Z', group: 'E' },
  { home: 'Alemania', away: 'Costa Rica', kickoff: '2026-06-28T18:00:00Z', group: 'E' },
  { home: 'Japón', away: 'Costa Rica', kickoff: '2026-06-29T18:00:00Z', group: 'E' },

  // GRUPO F
  { home: 'Italia', away: 'Bélgica', kickoff: '2026-06-23T16:00:00Z', group: 'F' },
  { home: 'Italia', away: 'Rumania', kickoff: '2026-06-28T22:00:00Z', group: 'F' },
  { home: 'Italia', away: 'Suiza', kickoff: '2026-07-02T20:00:00Z', group: 'F' },
  { home: 'Bélgica', away: 'Rumania', kickoff: '2026-06-24T20:00:00Z', group: 'F' },
  { home: 'Bélgica', away: 'Suiza', kickoff: '2026-06-29T20:00:00Z', group: 'F' },
  { home: 'Rumania', away: 'Suiza', kickoff: '2026-06-30T18:00:00Z', group: 'F' },

  // GRUPO G
  { home: 'Portugal', away: 'República Checa', kickoff: '2026-06-24T16:00:00Z', group: 'G' },
  { home: 'Portugal', away: 'Turquía', kickoff: '2026-06-29T16:00:00Z', group: 'G' },
  { home: 'Portugal', away: 'Georgia', kickoff: '2026-07-03T20:00:00Z', group: 'G' },
  { home: 'República Checa', away: 'Turquía', kickoff: '2026-06-25T16:00:00Z', group: 'G' },
  { home: 'República Checa', away: 'Georgia', kickoff: '2026-06-30T22:00:00Z', group: 'G' },
  { home: 'Turquía', away: 'Georgia', kickoff: '2026-07-01T18:00:00Z', group: 'G' },

  // GRUPO H
  { home: 'Inglaterra', away: 'Serbia', kickoff: '2026-06-21T14:00:00Z', group: 'H' },
  { home: 'Inglaterra', away: 'Dinamarca', kickoff: '2026-06-26T18:00:00Z', group: 'H' },
  { home: 'Inglaterra', away: 'Eslovenia', kickoff: '2026-07-01T16:00:00Z', group: 'H' },
  { home: 'Serbia', away: 'Dinamarca', kickoff: '2026-06-22T18:00:00Z', group: 'H' },
  { home: 'Serbia', away: 'Eslovenia', kickoff: '2026-06-27T22:00:00Z', group: 'H' },
  { home: 'Dinamarca', away: 'Eslovenia', kickoff: '2026-06-28T16:00:00Z', group: 'H' },
];

async function bootstrapWCGroup() {
  console.log(`📋 Iniciando bootstrap de ${MATCHES.length} partidos de grupo…\n`);

  // 1. Asegurar que existe la liga "World Cup 2026"
  const { data: leagueData, error: leagueError } = await admin
    .from('leagues')
    .select('id')
    .eq('api_id', 1)
    .eq('season', 2026)
    .maybeSingle();

  if (leagueError && leagueError.code !== 'PGRST116') {
    throw leagueError;
  }

  let leagueId: number;
  if (leagueData) {
    leagueId = leagueData.id;
    console.log(`✓ Liga World Cup 2026 existe (id=${leagueId})`);
  } else {
    const { data: newLeague, error: newLeagueErr } = await admin
      .from('leagues')
      .insert({
        api_id: 1,
        name: 'World Cup',
        season: 2026,
        sport: 'football',
        type: 'tournament',
        elo_home_adv: 0, // neutral venue
      })
      .select('id')
      .single();

    if (newLeagueErr) throw newLeagueErr;
    leagueId = newLeague.id;
    console.log(`✓ Created World Cup 2026 (id=${leagueId})`);
  }

  let insertedCount = 0;
  let skippedCount = 0;

  // 2. Por cada partido: asegurar equipos + insertar fixture
  for (const match of MATCHES) {
    try {
      // Obtener o crear equipos
      let homeId: number;
      let awayId: number;

      const { data: homeData } = await admin
        .from('teams')
        .select('id')
        .eq('name', match.home)
        .eq('sport', 'football')
        .maybeSingle();

      if (homeData) {
        homeId = homeData.id;
      } else {
        const { data: newHome, error: newHomeErr } = await admin
          .from('teams')
          .insert({
            name: match.home,
            short_name: match.home.substring(0, 3).toUpperCase(),
            sport: 'football',
            country: match.home,
          })
          .select('id')
          .single();

        if (newHomeErr) throw newHomeErr;
        homeId = newHome.id;
      }

      const { data: awayData } = await admin
        .from('teams')
        .select('id')
        .eq('name', match.away)
        .eq('sport', 'football')
        .maybeSingle();

      if (awayData) {
        awayId = awayData.id;
      } else {
        const { data: newAway, error: newAwayErr } = await admin
          .from('teams')
          .insert({
            name: match.away,
            short_name: match.away.substring(0, 3).toUpperCase(),
            sport: 'football',
            country: match.away,
          })
          .select('id')
          .single();

        if (newAwayErr) throw newAwayErr;
        awayId = newAway.id;
      }

      // Generar api_id único para skeleton (negativo para diferenciar de API real)
      const skeletonApiId = -(1000000 + homeId * 1000 + awayId);

      // Insertar o ignorar fixture
      const { data: fixtureData, error: fixtureErr } = await admin
        .from('fixtures')
        .insert({
          api_id: skeletonApiId,
          sport: 'football',
          league_id: leagueId,
          home_team_id: homeId,
          away_team_id: awayId,
          kickoff: match.kickoff,
          status: 'scheduled',
          round: `Grupo ${match.group}`,
          importance_weight: 1.5,
        })
        .select('id')
        .single();

      if (fixtureErr && fixtureErr.code === '23505') {
        // constraint violation: fixture ya existe
        skippedCount++;
      } else if (fixtureErr) {
        throw fixtureErr;
      } else {
        insertedCount++;
        process.stdout.write('.');
      }
    } catch (err) {
      console.error(`\n✗ Error en ${match.home} vs ${match.away}:`, err);
    }
  }

  console.log(`\n\n✅ Bootstrap completado:`);
  console.log(`   Insertados: ${insertedCount}`);
  console.log(`   Duplicados/Existentes: ${skippedCount}`);
  console.log(`   Total: ${insertedCount + skippedCount} / ${MATCHES.length}`);
  console.log(`\n📝 Próximo paso: Configurar cron jobs para sync de resultados.`);
}

bootstrapWCGroup().catch((err) => {
  console.error('❌ Bootstrap fallido:', err.message);
  process.exit(1);
});
