-- Tablas de posiciones (oficial + ELO)
-- Created: 2026-06-28

-- Tabla de posiciones oficial: puntos acumulados (3W + 1D + 0L)
create or replace view public.standings_official as
  with match_results as (
    select
      f.league_id,
      f.home_team_id as team_id,
      case
        when f.home_goals > f.away_goals then 3
        when f.home_goals = f.away_goals then 1
        else 0
      end as points,
      case
        when f.home_goals > f.away_goals then 1
        else 0
      end as wins,
      case
        when f.home_goals = f.away_goals then 1
        else 0
      end as draws,
      case
        when f.home_goals < f.away_goals then 1
        else 0
      end as losses
    from public.fixtures f
    where f.status = 'finished' and f.home_goals is not null and f.away_goals is not null

    union all

    select
      f.league_id,
      f.away_team_id as team_id,
      case
        when f.away_goals > f.home_goals then 3
        when f.away_goals = f.home_goals then 1
        else 0
      end as points,
      case
        when f.away_goals > f.home_goals then 1
        else 0
      end as wins,
      case
        when f.away_goals = f.home_goals then 1
        else 0
      end as draws,
      case
        when f.away_goals < f.home_goals then 1
        else 0
      end as losses
    from public.fixtures f
    where f.status = 'finished' and f.home_goals is not null and f.away_goals is not null
  )
  select
    row_number() over (partition by l.id order by
      sum(mr.points) desc,
      count(*) desc) as position,
    l.id as league_id,
    t.id as team_id,
    t.name as team_name,
    t.short_name,
    t.logo,
    sum(mr.points)::int as points,
    count(*)::int as played,
    sum(mr.wins)::int as wins,
    sum(mr.draws)::int as draws,
    sum(mr.losses)::int as losses
  from public.leagues l
  join public.teams t on true
  left join match_results mr on mr.league_id = l.id and mr.team_id = t.id
  where l.season = 2026
  group by l.id, t.id, t.name, t.short_name, t.logo
  order by l.id, position;

-- Ranking Elo: último Elo registrado por equipo
create or replace view public.standings_elo as
  with latest_elo as (
    select distinct on (team_id)
      team_id,
      elo,
      as_of
    from public.team_elo_history
    order by team_id, as_of desc
  )
  select
    row_number() over (order by le.elo desc) as position,
    t.id as team_id,
    t.name as team_name,
    t.short_name,
    t.logo,
    le.elo as rating,
    le.as_of as updated_at
  from latest_elo le
  join public.teams t on t.id = le.team_id
  where le.elo is not null
  order by position;
