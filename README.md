# Sports Trader Intelligence

**En vivo:** https://sports-trader-intelligence.vercel.app
**Supabase:** proyecto `xpgzhasnabtucjlbxuun` (región us-east-2) · esquema + seed aplicados.


Aplicación de análisis y predicción de fútbol orientada a **trading deportivo**:
genera probabilidades estadísticamente fundamentadas, las compara contra las
cuotas del mercado para detectar *value bets*, y mantiene memoria histórica
persistente de equipos y partidos para medir la calibración del modelo en el
tiempo.

> No es asesoría de apuestas. Es una herramienta de análisis cuantitativo.

## Stack

- **Frontend:** Astro + React + Tailwind CSS (estilo terminal de trading).
- **Backend/DB:** Supabase (Postgres + Edge Functions + Auth).
- **Datos:** API-Football (`v3.football.api-sports.io`), plan free (100 req/día, 10 req/min).
- **Despliegue objetivo:** Vercel (frontend) + Supabase (backend).

## Principio de seguridad

La **API key de API-Football nunca toca el cliente**. Todas las llamadas se hacen
desde Edge Functions de Supabase, que cachean en Postgres. El frontend solo lee
de Supabase con la *anon key*.

## Modelo (ensemble)

Tres componentes combinados con pesos editables (`ensemble_config` en BD):

1. **Poisson / Dixon-Coles** (peso 0.50) — fuerza de ataque/defensa con
   decaimiento exponencial hacia partidos recientes, corrección Dixon-Coles para
   marcadores bajos, matriz de marcador exacto → 1X2, over/under, BTTS, hándicap.
2. **Elo** (peso 0.30) — base 1500, **localía +65** (rango literatura 60–100,
   recalibrable por liga), **k=24** escalado por importancia del partido,
   empate vía Bradley-Terry-Davidson.
3. **Ajuste contextual** (peso 0.20) — lesiones ponderadas por importancia del
   jugador, forma reciente ponderada por rival, descanso/viaje, presión del
   torneo, H2H (peso bajo, deliberado).

Los pesos son un punto de partida y se recalibran con Brier score / log-loss
reales (vista `prediction_calibration`).

## Estructura

```
src/                 Frontend Astro + islas React
  pages/             dashboard, match/[id], calibration, admin
  components/        QuotaMeter, etc.
  lib/supabase.ts    cliente (solo anon key)
packages/model/      @sti/model — librería del modelo, TS puro, testeada
supabase/
  schema.sql         esquema completo + RLS
  functions/         Edge Functions (Fase 2)
```

## Configurar y correr en local

1. **Dependencias**
   ```bash
   npm install
   ```
2. **Variables de entorno** (frontend): copia `.env.example` a `.env` y rellena
   `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY`.
3. **Base de datos**: en tu proyecto Supabase, ejecuta `supabase/schema.sql`
   (SQL Editor o `supabase db push`).
4. **Secret de API-Football** (NUNCA en el repo ni en el frontend):
   ```bash
   supabase secrets set API_FOOTBALL_KEY=tu_clave
   supabase secrets set API_FOOTBALL_HOST=v3.football.api-sports.io
   ```
5. **Frontend**
   ```bash
   npm run dev
   ```
6. **Tests del modelo**
   ```bash
   npm test
   ```

## Limitaciones conocidas (honestas)

- **Cuota free durísima (100 req/día).** Un partido bien analizado consume ~5
  llamadas. El sistema funciona por **watchlist manual**: solo los partidos que
  marcas consumen cuota en profundidad. `api_request_log` actúa como presupuesto
  y **bloquea** llamadas al agotarse.
- **Temporadas/ligas del plan free.** El plan free restringe datos a ciertas
  temporadas/ligas. **Verifica la cobertura con tu cuenta** antes de fijar una
  liga; el esquema no asume ninguna.
- **Sin datos realmente en vivo.** Las cuotas in-play y el refresco cada 1-2 min
  requieren plan de pago; con free solo hay pre-match.
- **Tenis: sin API.** API-Sports **no ofrece tenis**. El esquema es
  sport-agnostic (un jugador = un "team", Elo por superficie ya contemplado),
  pero el tenis requiere otra fuente de datos aún por definir. Implementamos
  fútbol primero.
- **Contexto cualitativo manual.** Las "notas de contexto" (lesión de último
  momento, ambiente, decisión del DT) se pueblan **manualmente / editorialmente**
  (`context_notes`). No hay scraping de fuentes no autorizadas.

## Roadmap por fases

1. ✅ **Esquema + arquitectura** — `schema.sql` con RLS, scaffolding.
2. ✅ **Edge Functions + sync** — cliente API-Football (caché + cuota + rate-limit),
   `sync-fixtures/injuries/odds`.
3. ✅ **Modelo completo** — Dixon-Coles + Elo + contexto, `run-model`, 21 tests.
4. ✅ **Frontend conectado** — dashboard, ficha de partido, modo demo.
5. ✅ **Calibración + admin** — Brier/log-loss + reliability diagram, editor de pesos.

**Estado del despliegue:**
- ✅ Frontend en Vercel (adapter `@astrojs/vercel`), conectado a Supabase real.
- ✅ Supabase: esquema + RLS + seed (Suiza-Canadá, Bosnia-Catar) + salida del
  modelo precalculada. Advisors de seguridad resueltos.
- ⏳ **Pendiente (requiere tu API key):** cargar el secret `API_FOOTBALL_KEY` y
  desplegar las Edge Functions de sync. `run-model` y `sync-odds` importan
  `@sti/model` por ruta relativa: para desplegarlas hay que *vendorizar* esos
  archivos dentro de `supabase/functions/` (Deno no resuelve fuera del directorio
  de la función). Mientras tanto, la app funciona con los datos sembrados.

> Re-desplegar: `npm run build && npx vercel deploy --prebuilt --prod`. Las claves
> `PUBLIC_SUPABASE_*` se *inlinean* en build desde `.env`; en Vercel conviene
> añadirlas también como Environment Variables del proyecto para builds remotos.

## Entrenamiento automático

El sistema se **entrena solo** vía `pg_cron` + `pg_net` (todo dentro de Supabase,
ver `supabase/automation.sql`). Dos veces al día llama a API-Football, añade los
partidos nuevos, registra resultados y **actualiza el Elo de cada equipo** con
cada resultado (aprendizaje online). La vista `prediction_calibration` recalcula
el Brier score sola.

El pipeline es **100% automático** (6 cron jobs, 2 ciclos/día):
`:00` fetch resultados → `:10` registra + **entrena Elo** → `:15` la Edge Function
`recompute-models` **recalcula las probabilidades** Dixon-Coles de los partidos por
jugar con el Elo recién entrenado.

- **Honestidad de calibración:** las predicciones de partidos ya jugados quedan
  *congeladas* en su valor pre-partido (recompute solo toca fixtures `scheduled`).
- La Edge Function vendoriza el modelo (`supabase/functions/recompute-models/model.ts`)
  porque Deno no resuelve imports relativos sin extensión; mantenerla en sync con
  `packages/model`.

## Modo demo

Sin `PUBLIC_SUPABASE_*`, la app arranca en **modo demo**: puebla la UI con dos
partidos de ejemplo y calcula el modelo en el cliente (etiquetado en pantalla).
Con Supabase configurado, lee datos reales y el modelo viene de `run-model`.
