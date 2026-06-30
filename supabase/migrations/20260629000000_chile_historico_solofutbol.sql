-- Histórico de la Primera chilena desde solofutbol.cl (2020-2025) — jun 2026.
--
-- Fuente alternativa a API-Football (que en free no da temporadas chilenas
-- recientes). Las páginas "Resultados Nacional YYYY" de solofutbol.cl son una
-- MATRIZ todos-contra-todos (fila=local, col=visita, celda "H x A"), exportada
-- de Excel (windows-1252). Se descargan con pg_net (la red de Supabase sí sale)
-- y se parsean con ingest_solofutbol().
--
-- Detalles de parsing resueltos:
--   * Encoding: el contenido son bytes latin1 en columna UTF8 -> se recupera con
--     convert_from(textsend(content),'LATIN1') (Ñ, tildes correctas).
--   * Marcadores rotos: algunos vienen "1<span>…</span>x0" con U+00A0 dentro ->
--     se quitan tags, se reemplaza chr(160) y &nbsp; y se colapsa whitespace
--     antes de extraer con regex tolerante (\d+\s*x\s*\d+).
--   * Walk de la matriz: fila i tiene N-1 marcadores (sin la diagonal), que
--     mapean a columnas j≠i en orden ascendente.
-- Verificado: campeones reconstruidos == reales (UC 2020/2021, Colo Colo
-- 2022/2024, Huachipato 2023, Coquimbo 2025).
--
-- Tras cargar, se RESETEA el Elo chileno y se reentrena cronológicamente
-- (2020->2026), dando un Elo multi-temporada realista (Colo Colo/Coquimbo/UC/UCH
-- arriba). Las temporadas se guardan como filas leagues(api_id=265, season=YYYY).

create or replace function public.ingest_solofutbol(p_resp_id bigint, p_season int, p_team_names text[])
returns int language plpgsql as $$
declare
  html text; scores text[]; team_ids bigint[] := '{}';
  league_id bigint; tname text; tid bigint; new_apiid bigint;
  nt int := array_length(p_team_names,1);
  i int; j int; k int; cell text; hg int; ag int; n int := 0; idx int;
begin
  -- decodifica latin1 -> UTF8, quita tags, normaliza nbsp (entidad y U+00A0), colapsa
  select regexp_replace(
           replace(replace(regexp_replace(convert_from(textsend(content),'LATIN1'),'<[^>]+>',' ','g'), chr(160), ' '), '&nbsp;', ' '),
         '\s+',' ','g')
    into html from net._http_response where id = p_resp_id;
  if html is null then raise exception 'sin respuesta %', p_resp_id; end if;

  select array_agg(m[1] || '-' || m[2] order by rn) into scores
  from (select m, row_number() over () rn from regexp_matches(html, '(\d+)\s*x\s*(\d+)', 'g') m) z;
  if array_length(scores,1) <> nt*(nt-1) then
    raise exception 'temporada %: % marcadores, esperaba %', p_season, array_length(scores,1), nt*(nt-1);
  end if;

  select id into league_id from public.leagues where api_id=265 and season=p_season and sport='football';
  if league_id is null then
    insert into public.leagues(api_id,name,season,sport,type,elo_home_adv)
    values (265,'Primera División',p_season,'football','league',65) returning id into league_id;
  end if;

  foreach tname in array p_team_names loop
    select id into tid from public.teams where name=tname and sport='football' limit 1;
    if tid is null then
      select coalesce(min(api_id),-300)-1 into new_apiid from public.teams;
      insert into public.teams(api_id,name,short_name,sport,country)
      values (new_apiid,tname,upper(substr(tname,1,3)),'football','Chile') returning id into tid;
    end if;
    team_ids := team_ids || tid;
  end loop;

  for i in 1..nt loop
    k := 0;
    for j in 1..nt loop
      if j = i then continue; end if;
      idx := (i-1)*(nt-1) + k + 1; k := k + 1;
      cell := scores[idx];
      hg := split_part(cell,'-',1)::int; ag := split_part(cell,'-',2)::int;
      insert into public.fixtures(api_id,sport,league_id,home_team_id,away_team_id,kickoff,status,round,home_goals,away_goals,elo_applied,importance_weight)
      values (-(7000000 + p_season*10000 + (i-1)*100 + (j-1)), 'football', league_id,
        team_ids[i], team_ids[j], (p_season::text||'-03-01')::timestamptz + (n || ' hours')::interval,
        'finished', 'Temporada '||p_season, hg, ag, false, 1.0)
      on conflict (api_id, sport) do nothing;
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

-- standings_official / standings_elo: SOLO la temporada más reciente por api_id
-- (si no, las múltiples temporadas chilenas se sumarían en una sola tabla).
drop view if exists public.standings_official cascade;
create view public.standings_official as
  with cur as (
    select l.id, l.api_id from public.leagues l
    join (select api_id, max(season) mx from public.leagues group by api_id) m on m.api_id=l.api_id and m.mx=l.season
  ),
  team_points as (
    select f.league_id, f.home_team_id team_id,
      sum(case when f.home_goals>f.away_goals then 3 when f.home_goals=f.away_goals then 1 else 0 end) points,
      sum(case when f.home_goals>f.away_goals then 1 else 0 end) wins,
      sum(case when f.home_goals=f.away_goals then 1 else 0 end) draws,
      sum(case when f.home_goals<f.away_goals then 1 else 0 end) losses,
      sum(f.home_goals) gf, sum(f.away_goals) gc, count(*) played
    from public.fixtures f
    where f.status='finished' and f.home_goals is not null and f.league_id in (select id from cur)
    group by f.league_id, f.home_team_id
    union all
    select f.league_id, f.away_team_id,
      sum(case when f.away_goals>f.home_goals then 3 when f.away_goals=f.home_goals then 1 else 0 end),
      sum(case when f.away_goals>f.home_goals then 1 else 0 end),
      sum(case when f.away_goals=f.home_goals then 1 else 0 end),
      sum(case when f.away_goals<f.home_goals then 1 else 0 end),
      sum(f.away_goals), sum(f.home_goals), count(*)
    from public.fixtures f
    where f.status='finished' and f.home_goals is not null and f.league_id in (select id from cur)
    group by f.league_id, f.away_team_id
  )
  select
    row_number() over (partition by c.api_id order by sum(tp.points) desc, (sum(tp.gf)-sum(tp.gc)) desc, sum(tp.gf) desc) as position,
    c.api_id as league_id, t.id as team_id, t.name as team_name, t.short_name, t.logo,
    sum(tp.points)::int points, sum(tp.played)::int played, sum(tp.wins)::int wins, sum(tp.draws)::int draws,
    sum(tp.losses)::int losses, sum(tp.gf)::int goals_for, sum(tp.gc)::int goals_against, (sum(tp.gf)-sum(tp.gc))::int goal_diff
  from team_points tp join public.teams t on t.id=tp.team_id join cur c on c.id=tp.league_id
  group by c.api_id, t.id, t.name, t.short_name, t.logo order by c.api_id, position;

drop view if exists public.standings_elo cascade;
create view public.standings_elo as
  with cur as (
    select l.id, l.api_id from public.leagues l
    join (select api_id, max(season) mx from public.leagues group by api_id) m on m.api_id=l.api_id and m.mx=l.season
  ),
  latest_elo as (
    select distinct on (teh.team_id) teh.team_id, teh.elo, teh.as_of
    from public.team_elo_history teh where teh.component='general'
    order by teh.team_id, teh.as_of desc, teh.id desc
  ),
  teams_by_league as (
    select distinct c.api_id as league_api_id, x.team_id
    from (select league_id, home_team_id team_id from public.fixtures union all select league_id, away_team_id from public.fixtures) x
    join cur c on c.id = x.league_id
  )
  select row_number() over (partition by tbl.league_api_id order by le.elo desc) as position,
    tbl.league_api_id league_id, t.id team_id, t.name team_name, t.short_name, t.logo, le.elo rating, le.as_of updated_at
  from teams_by_league tbl join public.teams t on t.id=tbl.team_id
  left join latest_elo le on le.team_id=t.id where le.elo is not null
  order by tbl.league_api_id, position;
