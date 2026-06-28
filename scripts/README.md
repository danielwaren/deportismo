# Scripts de operación

## `bootstrap-wc-group.ts`

Inserta los 48 partidos de grupo del Mundial 2026 como "skeleton" (plantilla).

**Por qué:**
- API-Football free: `league+season 2026` está BLOQUEADO
- Solo endpoint `date±1d` funciona (ventana móvil 3 días)
- Solución: insertar skeleton con `status='scheduled'`, Elo placeholder
- Cuando haya resultados (sync o scraping), `train_elo()` los procesa automáticamente

**Ejecución:**
```bash
npx ts-node scripts/bootstrap-wc-group.ts
```

**Requisitos:**
- `.env` con `SUPABASE_SERVICE_ROLE_KEY` (la del proyecto, no anon key)
- Conexión a Internet (Supabase)

**Salida esperada:**
```
✅ Bootstrap completado:
   Insertados: 48
   Duplicados/Existentes: 0
   Total: 48 / 48

📝 Próximo paso: Configurar cron jobs para sync de resultados.
```

**Notas:**
- El script es **idempotente**: ejecutarlo múltiples veces es seguro (solo inserta nuevos)
- Los equipos se crean si no existen (con short_name automático)
- Los api_id son NEGATIVOS para distinguir skeleton de API reales
- El status es `'scheduled'` hasta que haya resultado (status='finished', home_goals/away_goals)
- Una vez que un partido tiene resultado, `train_elo()` aplica el update de Elo automáticamente

---

## Flujo completo: Carga → Sync → Elo

1. **Bootstrap** (este script)
   - Inserta 48 fixtures skeleton en `fixtures` con `status='scheduled'`
   
2. **Sync** (vía `sync-fixtures` Edge Function o scraping)
   - Obtiene resultados de API-Football (cuando salga v2 de API que soporte 2026)
   - O scraping de sitios oficiales (CONMEBOL, etc.)
   - Actualiza `home_goals`, `away_goals`, `status='finished'`
   
3. **Elo Training** (automático vía `train_elo()` en Postgres)
   - El cron job `auto-process` (05:10 UTC) llama `train_elo()`
   - Lee fixtures donde `status='finished'` y `elo_applied=false`
   - Aplica delta Elo usando fórmula Dixon-Coles
   - Marca `elo_applied=true`

---

## Calibración pre-16avos

Antes de activar value bets en fase de 16avos:

1. ✅ Tener toda la fase de grupos procesada (48 partidos resueltos)
2. ✅ Validar Brier score en training set (target < 0.20)
3. ✅ Revisar spread de Elo (debe estar realista, no colapsar a [1500, 1600])
4. ✅ Reentrenar con pesos optimizados (Poisson, Elo, contexto)
5. ✅ Activar `flagged_value=true` solo para edges > 5%

**Fecha target:** 2026-07-01 (día después de última jornada grupos)
