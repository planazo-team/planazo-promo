# planazo-promo

**Cupones de stock finito.** El click que compite por un cupón. Nada más — y por eso aguanta el pico sin afectar a nadie.

| | |
|---|---|
| **Dueño** | Fabián Andrade |
| **Retos** | **CC-1** (promociones limitadas) · **RT-2** (su lanzamiento se difunde en vivo) |
| **Datos** | Redis (stock) + PostgreSQL (cupones emitidos) |
| **Puerto local sugerido** | `3002` |
| **Contexto general** | [planazo-frontend/docs/contexto.md](https://github.com/planazo-team/planazo-frontend/blob/main/docs/contexto.md) |

---

## Contrato con el gateway

Todo entra por [`planazo-api-gateway`](https://github.com/planazo-team/planazo-api-gateway):

1. **Las rutas aquí NO llevan el prefijo `/api`.** El gateway recibe `/api/promos` y reenvía `/promos`.
2. **No valides el JWT.** El gateway ya lo hizo y te pasa la identidad en headers:

   | Header | Contenido |
   |---|---|
   | `x-user-id` | `u1`…`u6` (cliente) o `b1`,`b2`,`b3` (negocio) |
   | `x-user-role` | `cliente` o `negocio` |
   | `x-user-place-id` | solo negocio: su establecimiento |

3. **El `409` es la respuesta correcta cuando se agota**, no un error. Devuélvelo con `{ code, message }`.

---

## Datos

```
Redis        promo:{id}:stock      entero, con TTL igual a la duración de la promo
PostgreSQL   promos  (id, establishment_id, discount, stock_inicial, expires_at)
             coupons (id, promo_id, user_id, code, redeemed_at)
```

**Por qué dos almacenes:** el contador vive en Redis porque necesita decrementarse de forma indivisible bajo presión; el cupón emitido vive en Postgres porque tiene que sobrevivir a un reinicio. Se escribe en Postgres **solo después** de que Redis confirmó la unidad.

---

## API

| Método | Ruta | Rol | Qué hace |
|---|---|---|---|
| `POST` | `/promos` | negocio | `{discount, stock, duration_s}` — lanza la promoción |
| `GET` | `/promos?zone=` | cliente | Promociones activas de esa zona |
| `POST` | `/promos/:id/claim` | cliente | `200 {code}` o `409` |
| `GET` | `/promos/mine` | cliente | Cupones del usuario |

---

## Mecanismo de CC-1 — decremento atómico

Un script Lua, que Redis ejecuta de forma indivisible (nadie se cuela entre el `DECR` y la comprobación):

```lua
-- KEYS[1] = promo:{id}:stock
local s = redis.call('DECR', KEYS[1])
if s < 0 then
  redis.call('INCR', KEYS[1])   -- deshacer: el stock nunca queda bajo cero
  return -1
end
return s
```

**`-1` → `409`** con mensaje explícito: *"se agotó, te avisamos de la próxima"*. Nunca un error genérico ni un éxito falso — es criterio de aceptación de la historia `U5`.

### Por qué no es el mismo mecanismo que booking

`booking` usa versionado porque su recurso es **compuesto**: una franja con cantidad variable, que el negocio puede editar mientras el cliente decide. Aquí el recurso es **un contador simple**: no hay nada que versionar, solo hay que restar sin que dos resten lo mismo. Usar versionado aquí sería cargar complejidad que no compra nada; usar `DECR` en booking no detectaría la edición concurrente del panel.

---

## Eventos que emite

| Evento | Payload mínimo | Quién lo recibe |
|---|---|---|
| `PROMO.PUSH` | `{promo_id, place_id, zone, discount, expires_at}` | clientes de esa zona |
| `PROMO.WON` | `{promo_id, user_id, code}` | `user:<id>` y el panel del negocio |
| `PROMO.REJECTED` | `{promo_id, user_id, reason}` | `user:<id>` |
| `PROMO.EXPIRED` | `{promo_id}` | clientes de esa zona |

---

## Lo que NO hace

- **No decide quién ve la promoción.** Publica `PROMO.PUSH` con la zona y `realtime` la enruta a quien esté suscrito.
- No abre WebSockets.
- No toca cupos ni reservas — eso es de `booking`, aunque ambos repartan recursos escasos.

---

## Variables de entorno

```bash
PORT=3002
DATABASE_URL=postgresql://user:pass@host:5432/promo
REDIS_URL=redis://localhost:6379
BUS_URL=redis://localhost:6379      # puede ser el mismo Redis
```

---

## Definition of Done

1. **Recurso finito:** prueba de carga con N usuarios reclamando un cupón de stock 1 (o stock M con N>M). Criterio: exactamente el stock inicial de éxitos, el resto `409`, **cero cupones de más**.
2. El rechazo tiene que ser legible por el usuario, no un `500`.
3. Comprobar que al expirar el TTL, la promo deja de aceptar reclamos y emite `PROMO.EXPIRED`.

---

## Despliegue en Railway

1. New Project → Deploy from GitHub repo → `planazo-team/planazo-promo`.
2. Agrega **PostgreSQL** y **Redis** al proyecto; Railway inyecta `DATABASE_URL` y `REDIS_URL`.
3. Pásale la URL pública a Juan Diego: es el `PROMO_URL` del gateway.
