-- Tablas de posiciones (oficial + ELO)
-- Created: 2026-06-28
-- FIXED: 2026-06-28 - Corregido filtrado por liga en ambas views

-- Tabla de posiciones oficial: puntos acumulados (3W + 1D + 0L), filtrada por liga
create or replace view public.standings_official as
  with team_points as (
    select
      f.league_id,
      f.home_team_id as team_id,
      sum(case when f.home_goals > f.away_goals then 3 when f.home_goals = f.away_goals then 1 else 0 end) as points,
      sum(case when f.home_goals > f.away_goals then 1 else 0 end) as wins,
      sum(case when f.home_goals = f.away_goals then 1 else 0 end) as draws,
      sum(case when f.home_goals < f.away_goals then 1 else 0 end) as losses,
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
      count(*) as played
    from public.fixtures f
    where f.status = 'finished' and f.home_goals is not null and f.away_goals is not null
    group by f.league_id, f.away_team_id
  )
  select
    row_number() over (partition by tp.league_id order by sum(tp.points) desc, sum(tp.played) desc) as position,
    tp.league_id,
    t.id as team_id,
    t.name as team_name,
    t.short_name,
    t.logo,
    sum(tp.points)::int as points,
    sum(tp.played)::int as played,
    sum(tp.wins)::int as wins,
    sum(tp.draws)::int as draws,
    sum(tp.losses)::int as losses
  from team_points tp
  join public.teams t on t.id = tp.team_id
  group by tp.league_id, t.id, t.name, t.short_name, t.logo
  order by tp.league_id, position;

-- Ranking Elo: último Elo por equipo, FILTRADO por liga (solo equipos que jugaron en esa liga)
create or replace view public.standings_elo as
  with latest_elo as (
    select distinct on (teh.team_id)
      teh.team_id,
      teh.elo,
      teh.as_of
    from public.team_elo_history teh
    order by teh.team_id, teh.as_of desc
  ),
  teams_by_league as (
    select distinct league_id, team_id
    from (
      select f.league_id, f.home_team_id as team_id from public.fixtures f
      union all
      select f.league_id, f.away_team_id as team_id from public.fixtures f
    ) x
  )
  select
    row_number() over (partition by tbl.league_id order by le.elo desc) as position,
    tbl.league_id,
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
  order by tbl.league_id, position;

-- Inicializar Elo para equipos del Mundial (1500 placeholder)
insert into public.team_elo_history (team_id, elo, as_of)
select distinct t.id, 1500, now()
from public.teams t
where t.api_id < 0
and not exists (
  select 1 from public.team_elo_history teh where teh.team_id = t.id
)
on conflict do nothing;
