-- =============================================================================
-- Entrenamiento AUTOMÁTICO del sistema (pg_cron + pg_net), todo dentro de Supabase.
--
-- Cada 12 h: llama a API-Football (sin servicio externo), añade los partidos
-- nuevos del Mundial, registra los resultados y ACTUALIZA EL ELO con cada
-- resultado terminado. La vista prediction_calibration recalcula el Brier sola.
--
-- LÍMITE FREE: el endpoint date solo da ±1 día -> se sincroniza ayer + hoy.
-- NO automatizado aún: el recálculo de las PROBABILIDADES (Dixon-Coles) de los
-- partidos por jugar usa la librería @sti/model (TS); para automatizarlo se
-- desplegaría una Edge Function programada. El Elo sí se entrena solo.
-- =============================================================================

-- Config bloqueada por RLS (sin políticas => solo service role / SECURITY DEFINER)
create table if not exists public.app_config (k text primary key, v text);
alter table public.app_config enable row level security;
-- Cargar la key como secret (NO commitear la real):
-- insert into public.app_config(k,v) values ('football_key','<API_FOOTBALL_KEY>')
--   on conflict (k) do update set v=excluded.v;

-- Marca de qué fixtures ya entraron al Elo (evita doble conteo).
alter table public.fixtures add column if not exists elo_applied boolean not null default false;

-- ENTRENAMIENTO: aplica el update de Elo a los partidos terminados no procesados.
-- K = 30 * multiplicador por diferencia de goles; ventaja de local 0 (Mundial neutral).
create or replace function public.train_elo() returns int language plpgsql
security definer set search_path=public as $$
declare r record; eh numeric; ea numeric; we numeric; w numeric; k numeric; gd int; mult numeric; n int:=0;
begin
  for r in select * from public.fixtures
           where status='finished' and not elo_applied
             and home_goals is not null and away_goals is not null
           order by kickoff loop
    select elo into eh from public.team_elo_history where team_id=r.home_team_id order by as_of desc limit 1;
    select elo into ea from public.team_elo_history where team_id=r.away_team_id order by as_of desc limit 1;
    eh:=coalesce(eh,1500); ea:=coalesce(ea,1500);
    we:=1.0/(1.0+power(10,(ea-eh)/400.0));
    w := case when r.home_goals>r.away_goals then 1 when r.home_goals<r.away_goals then 0 else 0.5 end;
    gd:=abs(r.home_goals-r.away_goals);
    mult:=case when gd<=1 then 1 when gd=2 then 1.5 else (11+gd)/8.0 end;
    k:=30*mult;
    insert into public.team_elo_history(team_id,elo,as_of,fixture_id) values
      (r.home_team_id, round((eh+k*(w-we))::numeric,2), now(), r.id),
      (r.away_team_id, round((ea+k*(we-w))::numeric,2), now(), r.id);
    update public.fixtures set elo_applied=true where id=r.id;
    n:=n+1;
  end loop;
  return n;
end $$;

-- FETCH: dispara las llamadas (ayer + hoy) y guarda los request_id de pg_net.
create or replace function public.auto_fetch() returns void language plpgsql
security definer set search_path=public as $$
declare apikey text; r1 bigint; r2 bigint;
begin
  select v into apikey from public.app_config where k='football_key';
  r1 := net.http_get(url:='https://v3.football.api-sports.io/fixtures?date='||to_char((now() at time zone 'utc')::date-1,'YYYY-MM-DD'),
                     headers:=jsonb_build_object('x-apisports-key',apikey));
  r2 := net.http_get(url:='https://v3.football.api-sports.io/fixtures?date='||to_char((now() at time zone 'utc')::date,'YYYY-MM-DD'),
                     headers:=jsonb_build_object('x-apisports-key',apikey));
  insert into public.app_config(k,v) values ('last_fetch_ids', r1||','||r2)
  on conflict (k) do update set v=excluded.v;
end $$;

-- PROCESS: lee las respuestas, upserta equipos+fixtures del Mundial (league 1),
-- actualiza resultados y entrena el Elo.
create or replace function public.auto_process() returns text language plpgsql
security definer set search_path=public as $$
declare ids bigint[]; fx jsonb; lid bigint; hid bigint; aid bigint; trained int; up int:=0;
begin
  select string_to_array(v,',')::bigint[] into ids from public.app_config where k='last_fetch_ids';
  select id into lid from public.leagues where api_id=1 and season=2026;
  for fx in
    select f from net._http_response resp, jsonb_array_elements(resp.content::jsonb->'response') f
    where resp.id = any(ids) and (resp.content::jsonb->'errors')='[]'::jsonb and f->'league'->>'id'='1'
  loop
    insert into public.teams(api_id,sport,name,short_name,country,logo) values
      ((fx->'teams'->'home'->>'id')::bigint,'football',fx->'teams'->'home'->>'name',upper(left(fx->'teams'->'home'->>'name',3)),fx->'teams'->'home'->>'name',fx->'teams'->'home'->>'logo')
      on conflict (api_id,sport) do nothing;
    insert into public.teams(api_id,sport,name,short_name,country,logo) values
      ((fx->'teams'->'away'->>'id')::bigint,'football',fx->'teams'->'away'->>'name',upper(left(fx->'teams'->'away'->>'name',3)),fx->'teams'->'away'->>'name',fx->'teams'->'away'->>'logo')
      on conflict (api_id,sport) do nothing;
    select id into hid from public.teams where api_id=(fx->'teams'->'home'->>'id')::bigint and sport='football';
    select id into aid from public.teams where api_id=(fx->'teams'->'away'->>'id')::bigint and sport='football';
    insert into public.fixtures(api_id,sport,league_id,home_team_id,away_team_id,kickoff,status,round,importance_weight,home_goals,away_goals)
    values ((fx->'fixture'->>'id')::bigint,'football',lid,hid,aid,(fx->'fixture'->>'date')::timestamptz,
      (case when fx->'fixture'->'status'->>'short'='FT' then 'finished' else 'scheduled' end)::fixture_status,
      fx->'league'->>'round',1.30,(fx->'goals'->>'home')::int,(fx->'goals'->>'away')::int)
    on conflict (api_id,sport) do update set
      status=excluded.status, home_goals=excluded.home_goals, away_goals=excluded.away_goals;
    up := up+1;
  end loop;
  trained := public.train_elo();
  return 'fixtures_sync='||up||' elo_trained='||trained;
end $$;

-- PROGRAMACIÓN (pipeline 100% automático, 2 ciclos diarios, 4 req/día):
--   :00 fetch (resultados) -> :10 process (registra + entrena Elo)
--   -> :15 recompute (Edge Function recompute-models recalcula probabilidades
--      Dixon-Coles de los partidos por jugar con el Elo recién entrenado).
select cron.schedule('wc-fetch-am',     '0 6 * * *',   $$select public.auto_fetch();$$);
select cron.schedule('wc-process-am',   '10 6 * * *',  $$select public.auto_process();$$);
select cron.schedule('wc-fetch-pm',     '0 18 * * *',  $$select public.auto_fetch();$$);
select cron.schedule('wc-process-pm',   '10 18 * * *', $$select public.auto_process();$$);

-- Recompute via Edge Function (verify_jwt=false; clave publishable):
select cron.schedule('wc-recompute-am', '15 6 * * *',
  $$select net.http_post(url:='https://<PROJECT>.supabase.co/functions/v1/recompute-models',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer <PUBLISHABLE_KEY>'),
    body:='{}'::jsonb)$$);
select cron.schedule('wc-recompute-pm', '15 18 * * *',
  $$select net.http_post(url:='https://<PROJECT>.supabase.co/functions/v1/recompute-models',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer <PUBLISHABLE_KEY>'),
    body:='{}'::jsonb)$$);
