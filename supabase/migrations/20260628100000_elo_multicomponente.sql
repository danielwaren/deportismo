-- Fase 1 (BD): Elo MULTI-COMPONENTE persistido.
-- Created: 2026-06-28
--
-- Acompaña a @sti/model (elo.ts: updateEloComponents). No destructivo:
--   * Se añade team_elo_history.component (default 'general'); las filas
--     existentes quedan como el componente 'general' (sin cambios de valor).
--   * standings_elo y el frontend (latestElo) SOLO leen component='general',
--     así las filas de componentes nuevos no contaminan el ranking principal.
--   * populate_elo_components() mantiene offensive/defensive/home/away
--     (réplica SQL de updateEloComponents) para alimentar las lambdas
--     principistas (lambdas.ts: computeLambdas).

-- 1. Columna de componente -----------------------------------------------------
alter table public.team_elo_history
  add column if not exists component text not null default 'general';

create index if not exists idx_elo_team_component
  on public.team_elo_history(team_id, component, as_of desc);

-- 2. standings_elo: el ranking principal solo usa el Elo general ---------------
drop view if exists public.standings_elo cascade;
create view public.standings_elo as
  with latest_elo as (
    select distinct on (teh.team_id)
      teh.team_id, teh.elo, teh.as_of
    from public.team_elo_history teh
    where teh.component = 'general'
    order by teh.team_id, teh.as_of desc, teh.id desc
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
    t.id as team_id, t.name as team_name, t.short_name, t.logo,
    le.elo as rating, le.as_of as updated_at
  from teams_by_league tbl
  join public.teams t on t.id = tbl.team_id
  left join latest_elo le on le.team_id = t.id
  where le.elo is not null
  order by tbl.league_api_id, position;

-- 3. Mantenimiento de componentes ofensivo/defensivo/local/visitante -----------
-- Réplica en SQL de elo.updateEloComponents: procesa los partidos de grupo de una
-- liga en orden cronológico desde el Elo general previo al torneo y escribe el
-- valor final de cada componente. kBase=24, kGoals=8, gamma=1.0, mu=2.78.
create or replace function public.populate_elo_components(p_league_api bigint)
returns int language plpgsql security definer set search_path=public as $$
declare
  r record; n int := 0;
  kbase numeric := 24; kgoals numeric := 8; gamma numeric := 1.0; mu numeric := 2.78;
  ha numeric;
  h_gen numeric; h_off numeric; h_def numeric; h_hm numeric;
  a_gen numeric; a_off numeric; a_def numeric; a_aw numeric;
  exp_gen numeric; exp_gf numeric; exp_ga numeric;
begin
  create temporary table _comp(team_id bigint primary key, gen numeric, hm numeric, aw numeric, off numeric, def numeric) on commit drop;
  insert into _comp
  select t.team_id, g.elo, g.elo, g.elo, g.elo, g.elo
  from (select distinct team_id from (
          select home_team_id team_id from public.fixtures f join public.leagues l on l.id=f.league_id and l.api_id=p_league_api
          union select away_team_id from public.fixtures f join public.leagues l on l.id=f.league_id and l.api_id=p_league_api
        ) z) t
  join lateral (select elo from public.team_elo_history h where h.team_id=t.team_id and h.component='general' order by as_of asc limit 1) g on true;

  select coalesce(elo_home_adv,0) into ha from public.leagues where api_id=p_league_api limit 1;

  for r in select f.home_team_id hid, f.away_team_id aid, f.home_goals hg, f.away_goals ag
           from public.fixtures f join public.leagues l on l.id=f.league_id and l.api_id=p_league_api
           where f.status='finished' and f.home_goals is not null and f.round like 'Group%'
           order by f.kickoff, f.id loop
    select gen,off,def,hm into h_gen,h_off,h_def,h_hm from _comp where team_id=r.hid;
    select gen,off,def,aw into a_gen,a_off,a_def,a_aw from _comp where team_id=r.aid;

    exp_gen := 1.0/(1.0+power(10,(a_gen-(h_gen+ha))/400.0));
    h_gen := h_gen + kbase*((case when r.hg>r.ag then 1 when r.hg=r.ag then 0.5 else 0 end)-exp_gen);
    a_gen := a_gen + kbase*((case when r.ag>r.hg then 1 when r.ag=r.hg then 0.5 else 0 end)-(1-exp_gen));
    h_hm := h_hm + kbase*((case when r.hg>r.ag then 1 when r.hg=r.ag then 0.5 else 0 end)-exp_gen);
    a_aw := a_aw + kbase*((case when r.ag>r.hg then 1 when r.ag=r.hg then 0.5 else 0 end)-(1-exp_gen));

    exp_gf := (mu/2)*exp(gamma*(h_off - a_def + ha)/400.0);
    exp_ga := (mu/2)*exp(gamma*(a_off - h_def)/400.0);
    h_off := h_off + kgoals*(r.hg - exp_gf);
    h_def := h_def + kgoals*(exp_ga - r.ag);
    a_off := a_off + kgoals*(r.ag - exp_ga);
    a_def := a_def + kgoals*(exp_gf - r.hg);

    update _comp set gen=h_gen,off=h_off,def=h_def,hm=h_hm where team_id=r.hid;
    update _comp set gen=a_gen,off=a_off,def=a_def,aw=a_aw where team_id=r.aid;
    n := n+1;
  end loop;

  delete from public.team_elo_history where component in ('home','away','offensive','defensive')
    and team_id in (select team_id from _comp);
  insert into public.team_elo_history(team_id, elo, component, as_of)
  select team_id, round(hm,2),  'home',      clock_timestamp() from _comp union all
  select team_id, round(aw,2),  'away',      clock_timestamp() from _comp union all
  select team_id, round(off,2), 'offensive', clock_timestamp() from _comp union all
  select team_id, round(def,2), 'defensive', clock_timestamp() from _comp;
  return n;
end $$;

-- Población inicial del Mundial (liga api_id=1).
select public.populate_elo_components(1);
