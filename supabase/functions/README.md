# Edge Functions (Fase 2)

Todas las llamadas a API-Football viven aquí (Deno + service role). El frontend
NUNCA llama a la API directamente; la `API_FOOTBALL_KEY` es un secret de Supabase.

Funciones previstas:

| Función          | Qué hace                                   | Caché / refresco            |
|------------------|--------------------------------------------|-----------------------------|
| `sync-standings` | Rankings y tabla de la liga                | semanal                     |
| `sync-teams`     | Equipos + jugadores (importance_proxy)     | mensual                     |
| `sync-injuries`  | Lesionados/suspendidos                     | 24 h                        |
| `sync-fixtures`  | Calendario y resultados                    | diario / 1-2 min en vivo*   |
| `sync-odds`      | Cuotas pre-match                           | al entrar a watchlist       |
| `run-model`      | Ejecuta `@sti/model` y persiste salidas    | bajo demanda                |

`_shared/`:
- `apiFootball.ts` — fetch con rate-limit (10 req/min) + caché (`api_cache`).
- `quota.ts` — presupuesto diario (`api_request_log`): RECHAZA si se superan 100/día.
- `cache.ts` — get/set en `api_cache` con TTL por tipo de dato.

\* El refresco en vivo cada 1-2 min está previsto en el diseño pero **no es viable
con el plan free** (cuota + odds in-play de pago). Ver README raíz, "Limitaciones".
