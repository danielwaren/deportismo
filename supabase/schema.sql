-- =============================================================================
-- Sports Trader Intelligence — Esquema de base de datos (Supabase / Postgres)
-- Fase 1. Diseño sport-agnostic (football primero; tennis encaja sin rediseño).
--
-- Principios:
--   * El frontend SOLO lee de estas tablas. Las Edge Functions (service role)
--     escriben y bypassean RLS.
--   * Datos de referencia (ligas, equipos, Elo) cambian poco -> caché agresivo.
--   * Fixtures/odds en vivo cambian rápido -> caché corto, solo bajo watchlist.
--   * Todo lo que consume cuota de API-Football pasa por api_request_log, que
--     ACTÚA COMO PRESUPUESTO DIARIO (100 req/día en plan free).
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- ENUMS
-- -----------------------------------------------------------------------------
do $$ begin
  create type sport_type           as enum ('football','tennis');
exception when duplicate_object then null; end $$;

do $$ begin
  create type league_type          as enum ('league','cup','friendly','qualifier','tournament');
exception when duplicate_object then null; end $$;

do $$ begin
  create type fixture_status        as enum ('scheduled','live','finished','postponed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type player_availability   as enum ('available','injured','suspended','doubtful');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app_role              as enum ('admin','viewer');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Helper: trigger updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- =============================================================================
-- AUTH / ROLES
-- =============================================================================

-- profiles: extiende auth.users con un rol de aplicación. Soporta el panel admin.
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       app_role not null default 'viewer',
  created_at timestamptz not null default now()
);

-- Helper usado por las políticas RLS: ¿el usuario actual es admin?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  );
$$;

-- =============================================================================
-- REFERENCIA (cambian poco — caché agresivo: standings semanal, equipos mensual)
-- =============================================================================

create table if not exists public.leagues (
  id          bigint generated always as identity primary key,
  api_id      bigint not null,                       -- id en API-Football
  sport       sport_type not null default 'football',
  name        text not null,
  country     text,
  type        league_type not null default 'league',
  season      int not null,                          -- importante: el plan free
                                                      -- restringe temporadas
  logo        text,
  elo_home_adv numeric not null default 65,           -- ventaja de local (0 en
                                                      -- torneos neutros como el Mundial)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (api_id, season, sport)
);
create trigger trg_leagues_updated before update on public.leagues
  for each row execute function public.set_updated_at();

create table if not exists public.teams (
  id          bigint generated always as identity primary key,
  api_id      bigint not null,
  sport       sport_type not null default 'football',
  name        text not null,
  short_name  text,
  country     text,
  logo        text,
  -- En tennis un "team" es un jugador individual; surface_pref ayuda al Elo.
  is_player   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (api_id, sport)
);
create trigger trg_teams_updated before update on public.teams
  for each row execute function public.set_updated_at();

-- Relación equipo<->liga<->temporada (un equipo juega varias competiciones).
create table if not exists public.team_leagues (
  team_id    bigint not null references public.teams(id) on delete cascade,
  league_id  bigint not null references public.leagues(id) on delete cascade,
  primary key (team_id, league_id)
);

create table if not exists public.players (
  id               bigint generated always as identity primary key,
  api_id           bigint not null,
  team_id          bigint references public.teams(id) on delete set null,
  name             text not null,
  position         text,
  -- Proxies de importancia (se CALCULAN al sincronizar, no se inventan).
  season_minutes   int  default 0,
  season_goals     int  default 0,
  season_assists   int  default 0,
  importance_proxy numeric(6,3) default 0,   -- 0..1, normalizado dentro del equipo
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (api_id)
);
create trigger trg_players_updated before update on public.players
  for each row execute function public.set_updated_at();

-- Estado de disponibilidad. Guardamos HISTORIAL (valid_from), no solo el actual,
-- para poder reconstruir el contexto de una predicción pasada.
create table if not exists public.player_status (
  id          bigint generated always as identity primary key,
  player_id   bigint not null references public.players(id) on delete cascade,
  status      player_availability not null default 'available',
  reason      text,
  source      text,                          -- 'api-football' | 'manual' | ...
  valid_from  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists idx_player_status_player on public.player_status(player_id, valid_from desc);

-- =============================================================================
-- PARTIDOS E HISTÓRICO
-- =============================================================================

create table if not exists public.fixtures (
  id                bigint generated always as identity primary key,
  api_id            bigint not null,
  sport             sport_type not null default 'football',
  league_id         bigint references public.leagues(id) on delete set null,
  home_team_id      bigint not null references public.teams(id) on delete cascade,
  away_team_id      bigint not null references public.teams(id) on delete cascade,
  kickoff           timestamptz not null,
  status            fixture_status not null default 'scheduled',
  round             text,
  -- Peso de importancia del partido (final eliminación vs amistoso): modula el
  -- k-factor de Elo y el ajuste contextual. 0.5 amistoso .. 1.5 decisivo.
  importance_weight numeric(4,2) not null default 1.0,
  home_goals        int,
  away_goals        int,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (api_id, sport)
);
create trigger trg_fixtures_updated before update on public.fixtures
  for each row execute function public.set_updated_at();
create index if not exists idx_fixtures_kickoff on public.fixtures(kickoff);
create index if not exists idx_fixtures_home    on public.fixtures(home_team_id);
create index if not exists idx_fixtures_away    on public.fixtures(away_team_id);
create index if not exists idx_fixtures_league  on public.fixtures(league_id);
-- El H2H se DERIVA de esta tabla (no se duplica): consultar fixtures donde
-- {home,away} = {team_a,team_b} ordenado por kickoff desc, limit 10.

-- Serie temporal de Elo. NO guardamos solo el Elo actual: la historia permite
-- auditar el modelo y reconstruir ratings en cualquier fecha.
create table if not exists public.team_elo_history (
  id          bigint generated always as identity primary key,
  team_id     bigint not null references public.teams(id) on delete cascade,
  elo         numeric(7,2) not null,
  surface     text,                          -- tennis: 'clay'|'hard'|'grass'
  as_of       timestamptz not null default now(),
  fixture_id  bigint references public.fixtures(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_elo_team on public.team_elo_history(team_id, as_of desc);

-- Watchlist manual: SOLO los fixtures aquí consumen cuota en profundidad
-- (odds, lesiones, alineaciones, estadísticas). Es la palanca anti-cuota.
create table if not exists public.watchlist (
  user_id     uuid not null references auth.users(id) on delete cascade,
  fixture_id  bigint not null references public.fixtures(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, fixture_id)
);

-- =============================================================================
-- MODELO (ensemble) Y MERCADO
-- =============================================================================

create table if not exists public.model_versions (
  id          bigint generated always as identity primary key,
  version     text not null unique,          -- 'dc-elo-ctx-0.1.0'
  description text,
  created_at  timestamptz not null default now()
);

-- Pesos del ensemble, EDITABLES y VERSIONADOS (no hardcodeados). is_active marca
-- la configuración vigente. El admin la ajusta desde el panel.
create table if not exists public.ensemble_config (
  id              bigint generated always as identity primary key,
  version         text not null unique,
  is_active       boolean not null default false,
  -- Pesos del ensemble (deben sumar ~1; se normalizan en código).
  poisson_weight  numeric(4,3) not null default 0.50,
  elo_weight      numeric(4,3) not null default 0.30,
  context_weight  numeric(4,3) not null default 0.20,
  -- Parámetros Elo (documentados en el README: por qué +65 y k=24).
  elo_home_adv    numeric(6,2) not null default 65,
  elo_k_base      numeric(5,2) not null default 24,
  -- Dixon-Coles.
  dc_rho          numeric(5,3) not null default -0.10,   -- corrección marcadores bajos
  decay_halflife  numeric(5,1) not null default 8.0,      -- vida media (partidos) del decaimiento
  form_window      int         not null default 10,        -- nº de partidos para forma
  -- Trading.
  value_threshold numeric(4,3) not null default 0.05,     -- edge mínimo para flag de value
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_ensemble_updated before update on public.ensemble_config
  for each row execute function public.set_updated_at();
-- Solo una config activa a la vez.
create unique index if not exists uq_ensemble_active on public.ensemble_config(is_active) where is_active;

-- Salida COMPLETA del modelo para un fixture. Guarda un snapshot de los pesos
-- usados (weights_snapshot) para que, al retunear el ensemble, las predicciones
-- históricas sigan siendo interpretables y la calibración no se corrompa.
create table if not exists public.match_model_outputs (
  id               bigint generated always as identity primary key,
  fixture_id       bigint not null references public.fixtures(id) on delete cascade,
  model_version    text references public.model_versions(version),
  lambda_home      numeric(6,3),              -- goles esperados local
  lambda_away      numeric(6,3),              -- goles esperados visita
  prob_home        numeric(5,4),              -- 1
  prob_draw        numeric(5,4),              -- X
  prob_away        numeric(5,4),              -- 2
  prob_over_15     numeric(5,4),
  prob_over_25     numeric(5,4),
  prob_over_35     numeric(5,4),
  prob_btts        numeric(5,4),              -- ambos marcan
  ah_line          numeric(4,2),              -- hándicap asiático básico sugerido
  most_likely_score text,                     -- '2-1'
  score_matrix     jsonb,                     -- matriz de marcador exacto
  weights_snapshot jsonb,                     -- copia de ensemble_config usada
  created_at       timestamptz not null default now(),
  unique (fixture_id, model_version)
);
create index if not exists idx_outputs_fixture on public.match_model_outputs(fixture_id);

-- Cuotas del mercado (pre-match en plan free; in-play requiere plan pago).
create table if not exists public.odds (
  id            bigint generated always as identity primary key,
  fixture_id    bigint not null references public.fixtures(id) on delete cascade,
  bookmaker     text,
  market        text not null,               -- '1x2' | 'over_under_2.5' | 'btts' ...
  selection     text not null,               -- 'home' | 'over' | 'yes' ...
  odds          numeric(7,3) not null,
  implied_prob  numeric(5,4),                 -- 1/odds normalizado (sin margen)
  captured_at   timestamptz not null default now()
);
create index if not exists idx_odds_fixture on public.odds(fixture_id, market);

-- Capa de comparación modelo vs mercado -> value bets.
create table if not exists public.predictions (
  id            bigint generated always as identity primary key,
  fixture_id    bigint not null references public.fixtures(id) on delete cascade,
  model_version text references public.model_versions(version),
  market        text not null,
  selection     text not null,
  model_prob    numeric(5,4) not null,
  market_prob   numeric(5,4),
  value_edge    numeric(6,4),                 -- model_prob - market_prob
  flagged_value boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_predictions_fixture on public.predictions(fixture_id);

-- Vista de calibración: une predicciones con el resultado real para medir
-- Brier score / log-loss y construir el reliability diagram en el frontend.
create or replace view public.prediction_calibration
with (security_invoker = true) as
select
  p.id,
  p.fixture_id,
  p.market,
  p.selection,
  p.model_prob,
  f.status,
  f.home_goals,
  f.away_goals,
  -- outcome = 1 si la selección 1x2 acertó (otros mercados se resuelven en código).
  case
    when f.status <> 'finished' then null
    when p.market = '1x2' and p.selection = 'home' then (f.home_goals > f.away_goals)::int
    when p.market = '1x2' and p.selection = 'draw' then (f.home_goals = f.away_goals)::int
    when p.market = '1x2' and p.selection = 'away' then (f.home_goals < f.away_goals)::int
    else null
  end as outcome,
  p.created_at
from public.predictions p
join public.fixtures f on f.id = p.fixture_id;

-- =============================================================================
-- CONTEXTO CUALITATIVO Y OPERACIÓN
-- =============================================================================

-- Notas de contexto: el campo cualitativo (decisiones del DT, ambiente, lesión
-- de último momento). Se puebla MANUALMENTE o vía proceso editorial — sin
-- scraping de fuentes no autorizadas (ver README).
create table if not exists public.context_notes (
  id          bigint generated always as identity primary key,
  fixture_id  bigint references public.fixtures(id) on delete cascade,
  team_id     bigint references public.teams(id) on delete cascade,
  note        text not null,
  author      text,
  created_at  timestamptz not null default now()
);

-- Caché crudo de respuestas de API-Football (reuso de datos).
create table if not exists public.api_cache (
  id           bigint generated always as identity primary key,
  endpoint     text not null,
  params_hash  text not null,
  response     jsonb not null,
  fetched_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  unique (endpoint, params_hash)
);
create index if not exists idx_api_cache_expiry on public.api_cache(expires_at);

-- Log/presupuesto de la cuota diaria. El cliente HTTP compartido inserta aquí
-- ANTES de cada llamada y rechaza si day_count >= límite (100 free).
create table if not exists public.api_request_log (
  id          bigint generated always as identity primary key,
  endpoint    text not null,
  day         date not null default (now() at time zone 'utc')::date,
  called_at   timestamptz not null default now()
);
create index if not exists idx_api_log_day on public.api_request_log(day);

-- RPC pública para el QuotaMeter del frontend: cuántas solicitudes se han usado
-- hoy. SECURITY DEFINER para poder leer api_request_log (que el cliente no toca).
create or replace function public.api_requests_today()
returns int language sql security definer set search_path = public stable as $$
  select count(*)::int
  from public.api_request_log
  where day = (now() at time zone 'utc')::date;
$$;
grant execute on function public.api_requests_today() to anon, authenticated;

-- =============================================================================
-- VISTAS DE STANDINGS (tablas de posiciones)
--   Ambas se exponen por league.api_id (1 = Mundial, 265 = Primera de Chile),
--   que es como filtra el frontend. OJO: el primary key de leagues NO coincide
--   con api_id (Chile tiene id=15 pero api_id=265) -> hay que mapear por api_id.
-- =============================================================================

-- Tabla oficial: puntos acumulados (3 victoria, 1 empate, 0 derrota) por liga.
-- Suma local + visita de cada equipo sobre fixtures 'finished' con marcador.
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

-- Ranking Elo por liga: último Elo de cada equipo que jugó en esa liga.
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

-- =============================================================================
-- ROW LEVEL SECURITY
--   * Lectura pública de datos de referencia/modelo (anon + authenticated).
--   * Escritura de config/notas: solo admin.
--   * Caché y log de API: SOLO service role (sin políticas -> cliente sin acceso).
--   * Las Edge Functions usan service role y bypassean RLS.
-- =============================================================================

-- Tablas de solo-lectura pública.
do $$
declare t text;
begin
  foreach t in array array[
    'leagues','teams','team_leagues','players','player_status','fixtures',
    'team_elo_history','model_versions','ensemble_config','match_model_outputs',
    'odds','predictions'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      create policy "public_read_%1$s" on public.%1$I
        for select using (true);
    $f$, t);
  end loop;
end $$;

-- profiles: cada usuario ve/edita su propia fila; admin ve todas.
alter table public.profiles enable row level security;
create policy "profiles_self_read"  on public.profiles for select using (auth.uid() = user_id or public.is_admin());
create policy "profiles_self_write" on public.profiles for update using (auth.uid() = user_id);

-- watchlist: privada por usuario.
alter table public.watchlist enable row level security;
create policy "watchlist_owner_all" on public.watchlist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- context_notes: lectura pública, escritura solo admin.
alter table public.context_notes enable row level security;
create policy "notes_public_read" on public.context_notes for select using (true);
create policy "notes_admin_write" on public.context_notes for all
  using (public.is_admin()) with check (public.is_admin());

-- ensemble_config: la edición (UPDATE/INSERT/DELETE) es solo admin; la lectura
-- ya quedó pública arriba.
create policy "ensemble_admin_write" on public.ensemble_config for insert with check (public.is_admin());
create policy "ensemble_admin_update" on public.ensemble_config for update using (public.is_admin());

-- api_cache y api_request_log: RLS habilitado y SIN políticas => ningún rol de
-- cliente (anon/authenticated) puede leer ni escribir. Solo service role.
alter table public.api_cache       enable row level security;
alter table public.api_request_log enable row level security;

-- =============================================================================
-- SEED MÍNIMO: una versión de modelo y una config de ensemble activa por defecto.
-- =============================================================================
insert into public.model_versions (version, description)
values ('dc-elo-ctx-0.1.0', 'Ensemble inicial: Dixon-Coles + Elo + ajuste contextual')
on conflict (version) do nothing;

insert into public.ensemble_config (version, is_active, notes)
values ('config-0.1.0', true,
  'Pesos iniciales por defecto. Poisson 0.50 / Elo 0.30 / Contexto 0.20. Revisar tras calibración real.')
on conflict (version) do nothing;
