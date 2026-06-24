-- =============================================================================
-- Seed de demostración — partidos del 2026-06-24:
--   * Suiza vs Canadá
--   * Bosnia y Herzegovina vs Catar
--
-- Permite ver los partidos y correr el modelo SIN gastar cuota de API-Football.
-- api_id NEGATIVOS = sentinela "pendiente de reconciliar con la API" (cuando
-- corras sync-fixtures, los datos reales sustituyen estos placeholders).
-- Los Elo son PLACEHOLDERS (ballpark World Football Elo), NO ratings oficiales;
-- se sobrescriben en cuanto entre historia real.
-- =============================================================================

insert into public.leagues (api_id, sport, name, country, type, season)
values (-100, 'football', 'Internacional (selecciones)', 'World', 'friendly', 2026)
on conflict (api_id, season, sport) do nothing;

insert into public.teams (api_id, sport, name, short_name, country) values
  (-1, 'football', 'Suiza',                  'SUI', 'Switzerland'),
  (-2, 'football', 'Canadá',                 'CAN', 'Canada'),
  (-3, 'football', 'Bosnia y Herzegovina',   'BIH', 'Bosnia and Herzegovina'),
  (-4, 'football', 'Catar',                  'QAT', 'Qatar')
on conflict (api_id, sport) do nothing;

-- Elo placeholder inicial (serie temporal arranca aquí).
insert into public.team_elo_history (team_id, elo, as_of)
select t.id, e.elo, timestamptz '2026-06-24 00:00:00+00'
from public.teams t
join (values
  ('Suiza', 1665),
  ('Canadá', 1490),
  ('Bosnia y Herzegovina', 1520),
  ('Catar', 1480)
) as e(name, elo) on e.name = t.name
where t.api_id in (-1, -2, -3, -4);

-- Fixture 1: Suiza vs Canadá (kickoff placeholder).
insert into public.fixtures
  (api_id, sport, league_id, home_team_id, away_team_id, kickoff, status, round, importance_weight)
select -1001, 'football', l.id, h.id, a.id,
       timestamptz '2026-06-24 18:00:00+00', 'scheduled', 'Demo', 1.0
from public.leagues l, public.teams h, public.teams a
where l.api_id = -100 and h.api_id = -1 and a.api_id = -2
on conflict (api_id, sport) do nothing;

-- Fixture 2: Bosnia y Herzegovina vs Catar.
insert into public.fixtures
  (api_id, sport, league_id, home_team_id, away_team_id, kickoff, status, round, importance_weight)
select -1002, 'football', l.id, h.id, a.id,
       timestamptz '2026-06-24 20:45:00+00', 'scheduled', 'Demo', 1.0
from public.leagues l, public.teams h, public.teams a
where l.api_id = -100 and h.api_id = -3 and a.api_id = -4
on conflict (api_id, sport) do nothing;
