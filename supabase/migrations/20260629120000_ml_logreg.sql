-- Modelo ML (regresión logística softmax) como miembro del ensemble — jun 2026.
--
-- El motor vive en packages/model (features.ts + logreg.ts). Aquí:
--   * ml_training_samples: features PRE-PARTIDO (sin look-ahead) + resultado.
--     El Elo general tiene historial por partido (train_elo guarda una fila por
--     fixture), así que el Elo de cada equipo ANTES de un partido se obtiene con
--     lag() sobre team_elo_history. 1732 partidos entrenables.
--   * ml_models: pesos entrenados (jsonb), lectura pública.
-- La edge function train-ml entrena (logreg vendorizado) y guarda los pesos;
-- recompute-models y el frontend (predict.ts) los cargan y mezclan el 1X2 ML
-- (25%) en el ensemble. Cron ml-train-am/pm (06:12/18:12) re-entrena.

create or replace view public.ml_training_samples as
with hist as (
  select team_id, fixture_id, elo,
    lag(elo) over (partition by team_id order by as_of, id) as pre
  from public.team_elo_history where component = 'general'
),
pre as (select fixture_id, team_id, pre from hist where fixture_id is not null and pre is not null)
select
  f.id as fixture_id,
  hp.pre as home_elo, ap.pre as away_elo,
  coalesce(l.elo_home_adv, 0) as home_adv,
  case when f.home_goals > f.away_goals then 0
       when f.home_goals = f.away_goals then 1 else 2 end as label
from public.fixtures f
join public.leagues l on l.id = f.league_id
join pre hp on hp.fixture_id = f.id and hp.team_id = f.home_team_id
join pre ap on ap.fixture_id = f.id and ap.team_id = f.away_team_id
where f.status = 'finished' and f.home_goals is not null;

create table if not exists public.ml_models (
  id          text primary key,
  version     text not null,
  weights     jsonb not null,
  n_samples   int not null,
  trained_at  timestamptz not null default now()
);
alter table public.ml_models enable row level security;
do $$ begin
  create policy "ml_models_public_read" on public.ml_models for select using (true);
exception when duplicate_object then null; end $$;
