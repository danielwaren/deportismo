-- Tablas de posiciones (oficial + ELO)
-- Created: 2026-06-28
--
-- Ambas views se exponen por league.api_id (1 = Mundial, 265 = Primera de Chile),
-- que es como filtra todo el frontend. NO usar el primary key de leagues: el id
-- de Chile es 15 pero su api_id es 265 (no coinciden).

-- Tabla oficial: puntos acumulados (3 victoria, 1 empate, 0 derrota) por liga.
-- Solo cuenta fixtures 'finished' con marcador. Suma local + visita por equipo.
-- Desempate: puntos -> diferencia de gol -> goles a favor (estándar de liga).
create or replace view public.standings_official as
  with team_points as (
    select
      f.league_id,
      f.home_team_id as team_id,
      sum(case when f.home_goals > f.away_goals then 3 when f.home_goals = f.away_goals then 1 else 0 end) as points,
      sum(case when f.home_goals > f.away_goals then 1 else 0 end) as wins,
      sum(case when f.home_goals = f.away_goals then 1 else 0 end) as draws,
      sum(case when f.home_goals < f.away_goals then 1 else 0 end) as losses,
      sum(f.home_goals) as gf,
      sum(f.away_goals) as gc,
      count(*) as played
    from public.fixtures f
    where f.status = 'finished' and f.home_goals is not null and f.away_goals is not null
    group by f.league_id, f.home_team_id

    union all

    select
      f.league_id,
      f.away_team_id as team_id,
      sum(case when f.away_goals > f.home_goals then 3 when f.away_goals = f.home_goals then 1 else 0 end) as points,
      sum(case when f.away_goals > f.home_goals then 1 else 0 end) as wins,
      sum(case when f.away_goals = f.home_goals then 1 else 0 end) as draws,
      sum(case when f.away_goals < f.home_goals then 1 else 0 end) as losses,
      sum(f.away_goals) as gf,
      sum(f.home_goals) as gc,
      count(*) as played
    from public.fixtures f
    where f.status = 'finished' and f.home_goals is not null and f.away_goals is not null
    group by f.league_id, f.away_team_id
  )
  select
    row_number() over (
      partition by l.api_id
      order by sum(tp.points) desc, (sum(tp.gf) - sum(tp.gc)) desc, sum(tp.gf) desc
    ) as position,
    l.api_id as league_id,
    t.id as team_id,
    t.name as team_name,
    t.short_name,
    t.logo,
    sum(tp.points)::int as points,
    sum(tp.played)::int as played,
    sum(tp.wins)::int as wins,
    sum(tp.draws)::int as draws,
    sum(tp.losses)::int as losses,
    sum(tp.gf)::int as goals_for,
    sum(tp.gc)::int as goals_against,
    (sum(tp.gf) - sum(tp.gc))::int as goal_diff
  from team_points tp
  join public.teams t on t.id = tp.team_id
  join public.leagues l on l.id = tp.league_id
  group by l.api_id, t.id, t.name, t.short_name, t.logo
  order by l.api_id, position;

-- Ranking Elo por liga: último Elo de cada equipo que ha jugado en esa liga.
-- Particiona por api_id para no mezclar equipos chilenos con los del Mundial.
create or replace view public.standings_elo as
  with latest_elo as (
    select distinct on (teh.team_id)
      teh.team_id, teh.elo, teh.as_of
    from public.team_elo_history teh
    order by teh.team_id, teh.as_of desc
  ),
  teams_by_league as (
    select distinct l.api_id as league_api_id, x.team_id
    from (
      select f.league_id, f.home_team_id as team_id from public.fixtures f
      union all
      select f.league_id, f.away_team_id as team_id from public.fixtures f
    ) x
    join public.leagues l on l.id = x.league_id
  )
  select
    row_number() over (partition by tbl.league_api_id order by le.elo desc) as position,
    tbl.league_api_id as league_id,
    t.id as team_id,
    t.name as team_name,
    t.short_name,
    t.logo,
    le.elo as rating,
    le.as_of as updated_at
  from teams_by_league tbl
  join public.teams t on t.id = tbl.team_id
  left join latest_elo le on le.team_id = t.id
  where le.elo is not null
  order by tbl.league_api_id, position;
