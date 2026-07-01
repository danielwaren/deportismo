-- xG por equipo (FootyStats) — Primera chilena 2026. jul 2026.
--
-- FBref bloquea el scraping server-side (403); FootyStats también bloquea pg_net
-- pero es accesible por WebFetch. Se leyó la tabla xG (16 equipos, xG a favor y
-- xGC en contra por partido, temporada 2026) y se carga aquí. El modelo la usa
-- vía xgAdjustedStrengths (packages/model/xg.ts): mezcla geométrica de la fuerza
-- ataque/defensa basada en Elo con la basada en xG, ponderada por fiabilidad.
-- Refresco MANUAL (WebFetch), no automatable por cron (FootyStats bloquea pg_net).

create table if not exists public.team_xg (
  team_id      bigint not null references public.teams(id) on delete cascade,
  season       int not null,
  matches      int not null default 0,
  xg_for       numeric(5,2) not null,
  xg_against   numeric(5,2) not null,
  source       text default 'footystats',
  updated_at   timestamptz not null default now(),
  primary key (team_id, season)
);
alter table public.team_xg enable row level security;
do $$ begin
  create policy "team_xg_read" on public.team_xg for select using (true);
exception when duplicate_object then null; end $$;

-- Datos 2026 (FootyStats). team_id según public.teams.
insert into public.team_xg(team_id, season, matches, xg_for, xg_against) values
 (174,2026,15,1.71,0.96),(185,2026,15,1.50,1.32),(176,2026,15,1.48,1.21),(178,2026,15,1.45,1.52),
 (180,2026,15,1.43,1.13),(181,2026,15,1.40,1.40),(171,2026,15,1.39,1.20),(182,2026,15,1.36,1.25),
 (173,2026,15,1.34,1.55),(183,2026,15,1.34,1.46),(177,2026,15,1.31,1.72),(175,2026,15,1.29,1.62),
 (186,2026,15,1.28,1.39),(179,2026,15,1.20,1.38),(172,2026,15,1.20,1.40),(184,2026,15,1.18,1.34)
on conflict (team_id,season) do update
  set xg_for=excluded.xg_for, xg_against=excluded.xg_against, matches=excluded.matches, updated_at=now();
