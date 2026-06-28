-- Bootstrap: 48 partidos de grupo del Mundial 2026
-- Ejecutar manualmente en Supabase SQL Editor

-- 1. Asegurar liga World Cup 2026
insert into public.leagues (api_id, name, season, sport, type, elo_home_adv)
values (1, 'World Cup', 2026, 'football', 'tournament', 0)
on conflict (api_id, season, sport) do nothing;

-- 2. Asegurar equipos (48 países)
insert into public.teams (api_id, name, short_name, sport, country, is_player)
values
  (-1, 'Argentina', 'ARG', 'football', 'Argentina', false),
  (-2, 'Paraguay', 'PAR', 'football', 'Paraguay', false),
  (-3, 'Perú', 'PER', 'football', 'Perú', false),
  (-4, 'Bolivia', 'BOL', 'football', 'Bolivia', false),
  (-5, 'Brasil', 'BRA', 'football', 'Brasil', false),
  (-6, 'Costa Rica', 'CRC', 'football', 'Costa Rica', false),
  (-7, 'Colombia', 'COL', 'football', 'Colombia', false),
  (-8, 'México', 'MEX', 'football', 'México', false),
  (-9, 'Honduras', 'HND', 'football', 'Honduras', false),
  (-10, 'El Salvador', 'SLV', 'football', 'El Salvador', false),
  (-11, 'Uruguay', 'URU', 'football', 'Uruguay', false),
  (-12, 'Francia', 'FRA', 'football', 'Francia', false),
  (-13, 'Países Bajos', 'NED', 'football', 'Países Bajos', false),
  (-14, 'Polonia', 'POL', 'football', 'Polonia', false),
  (-15, 'Dinamarca', 'DEN', 'football', 'Dinamarca', false),
  (-16, 'España', 'ESP', 'football', 'España', false),
  (-17, 'Alemania', 'GER', 'football', 'Alemania', false),
  (-18, 'Japón', 'JPN', 'football', 'Japón', false),
  (-19, 'Italia', 'ITA', 'football', 'Italia', false),
  (-20, 'Bélgica', 'BEL', 'football', 'Bélgica', false),
  (-21, 'Rumania', 'ROU', 'football', 'Rumania', false),
  (-22, 'Suiza', 'SUI', 'football', 'Suiza', false),
  (-23, 'Portugal', 'POR', 'football', 'Portugal', false),
  (-24, 'República Checa', 'CZE', 'football', 'República Checa', false),
  (-25, 'Turquía', 'TUR', 'football', 'Turquía', false),
  (-26, 'Georgia', 'GEO', 'football', 'Georgia', false),
  (-27, 'Inglaterra', 'ENG', 'football', 'Inglaterra', false),
  (-28, 'Serbia', 'SRB', 'football', 'Serbia', false),
  (-29, 'Eslovenia', 'SVN', 'football', 'Eslovenia', false)
on conflict (api_id, sport) do nothing;

-- 3. Insertar 48 partidos de grupo
-- Helper: obtener league_id
with league_id as (
  select id from public.leagues where api_id = 1 and season = 2026 limit 1
)
insert into public.fixtures (
  api_id, sport, league_id, home_team_id, away_team_id, kickoff, status, round, importance_weight
)
select
  -(1000000 + h.id * 100 + a.id) as api_id,
  'football',
  (select id from league_id),
  h.id,
  a.id,
  match_data.kickoff,
  'scheduled',
  'Grupo ' || match_data.group_name,
  1.5
from (
  values
    -- GRUPO A
    ('Argentina', 'Paraguay', '2026-06-20T18:00:00Z', 'A'),
    ('Argentina', 'Perú', '2026-06-25T22:00:00Z', 'A'),
    ('Argentina', 'Bolivia', '2026-06-29T20:00:00Z', 'A'),
    ('Paraguay', 'Perú', '2026-06-21T20:00:00Z', 'A'),
    ('Paraguay', 'Bolivia', '2026-06-26T18:00:00Z', 'A'),
    ('Perú', 'Bolivia', '2026-06-27T18:00:00Z', 'A'),
    -- GRUPO B
    ('Brasil', 'Costa Rica', '2026-06-20T21:00:00Z', 'B'),
    ('Brasil', 'Colombia', '2026-06-25T20:00:00Z', 'B'),
    ('Brasil', 'Paraguay', '2026-06-29T22:00:00Z', 'B'),
    ('Costa Rica', 'Colombia', '2026-06-21T18:00:00Z', 'B'),
    ('Costa Rica', 'Paraguay', '2026-06-26T20:00:00Z', 'B'),
    ('Colombia', 'Paraguay', '2026-06-27T22:00:00Z', 'B'),
    -- GRUPO C
    ('México', 'Honduras', '2026-06-20T19:00:00Z', 'C'),
    ('México', 'El Salvador', '2026-06-25T18:00:00Z', 'C'),
    ('México', 'Uruguay', '2026-06-29T18:00:00Z', 'C'),
    ('Honduras', 'El Salvador', '2026-06-21T22:00:00Z', 'C'),
    ('Honduras', 'Uruguay', '2026-06-26T22:00:00Z', 'C'),
    ('El Salvador', 'Uruguay', '2026-06-27T20:00:00Z', 'C'),
    -- GRUPO D
    ('Francia', 'Países Bajos', '2026-06-21T16:00:00Z', 'D'),
    ('Francia', 'Polonia', '2026-06-26T16:00:00Z', 'D'),
    ('Francia', 'Dinamarca', '2026-06-30T20:00:00Z', 'D'),
    ('Países Bajos', 'Polonia', '2026-06-22T20:00:00Z', 'D'),
    ('Países Bajos', 'Dinamarca', '2026-06-27T16:00:00Z', 'D'),
    ('Polonia', 'Dinamarca', '2026-06-28T20:00:00Z', 'D'),
    -- GRUPO E
    ('España', 'Alemania', '2026-06-22T16:00:00Z', 'E'),
    ('España', 'Japón', '2026-06-27T18:00:00Z', 'E'),
    ('España', 'Costa Rica', '2026-07-01T20:00:00Z', 'E'),
    ('Alemania', 'Japón', '2026-06-23T20:00:00Z', 'E'),
    ('Alemania', 'Costa Rica', '2026-06-28T18:00:00Z', 'E'),
    ('Japón', 'Costa Rica', '2026-06-29T18:00:00Z', 'E'),
    -- GRUPO F
    ('Italia', 'Bélgica', '2026-06-23T16:00:00Z', 'F'),
    ('Italia', 'Rumania', '2026-06-28T22:00:00Z', 'F'),
    ('Italia', 'Suiza', '2026-07-02T20:00:00Z', 'F'),
    ('Bélgica', 'Rumania', '2026-06-24T20:00:00Z', 'F'),
    ('Bélgica', 'Suiza', '2026-06-29T20:00:00Z', 'F'),
    ('Rumania', 'Suiza', '2026-06-30T18:00:00Z', 'F'),
    -- GRUPO G
    ('Portugal', 'República Checa', '2026-06-24T16:00:00Z', 'G'),
    ('Portugal', 'Turquía', '2026-06-29T16:00:00Z', 'G'),
    ('Portugal', 'Georgia', '2026-07-03T20:00:00Z', 'G'),
    ('República Checa', 'Turquía', '2026-06-25T16:00:00Z', 'G'),
    ('República Checa', 'Georgia', '2026-06-30T22:00:00Z', 'G'),
    ('Turquía', 'Georgia', '2026-07-01T18:00:00Z', 'G'),
    -- GRUPO H
    ('Inglaterra', 'Serbia', '2026-06-21T14:00:00Z', 'H'),
    ('Inglaterra', 'Dinamarca', '2026-06-26T18:00:00Z', 'H'),
    ('Inglaterra', 'Eslovenia', '2026-07-01T16:00:00Z', 'H'),
    ('Serbia', 'Dinamarca', '2026-06-22T18:00:00Z', 'H'),
    ('Serbia', 'Eslovenia', '2026-06-27T22:00:00Z', 'H'),
    ('Dinamarca', 'Eslovenia', '2026-06-28T16:00:00Z', 'H')
) as match_data(home_name, away_name, kickoff, group_name)
join public.teams h on h.name = match_data.home_name and h.sport = 'football'
join public.teams a on a.name = match_data.away_name and a.sport = 'football'
on conflict (api_id, sport) do nothing;
