# planazo-promo

**Cupones de stock finito.** El click que compite por un cupón. Nada más — y por eso aguanta el pico sin afectar a nadie.

| | |
|---|---|
| **Dueño** | Fabián Andrade |
| **Retos** | **CC-1** (promociones limitadas) · **RT-2** (su lanzamiento se difunde en vivo) |
| **Datos** | Redis (stock) + PostgreSQL (cupones emitidos) |
| **Puerto local sugerido** | `3002` |
| **Producción** | Railway, solo por red privada: `http://planazo-promo.railway.internal:3002` |
| **Contexto general** | [planazo-frontend/docs/contexto.md](https://github.com/planazo-team/planazo-frontend/blob/main/docs/contexto.md) |

**Escenario 4 (Disponibilidad):** `docker compose up` en este repo levanta 2
réplicas de este servicio + un balanceador Nginx propio (`nginx.conf`),
publicado en el mismo puerto `3002` de siempre. Requiere que
`planazo-infra` ya esté arriba (crea la red compartida `planazo-net` y
`postgres-promo`/`redis`). Detalle completo:
[`planazo-infra/ESCENARIO-04-DISPONIBILIDAD.md`](https://github.com/planazo-team/planazo-infra/blob/main/ESCENARIO-04-DISPONIBILIDAD.md).

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
Redis        promo:{id}:reclamos   set de usuarios que ya reclamaron (uno por persona)
Redis        game:puesto:{1..3}    zset usuario → momento en que quedó en ese puesto
PostgreSQL   esquema promo         promos, cupones (UNIQUE promo+usuario), lugares, puestos
```

**Reclamar es un solo script Lua** (`src/promo/stock.store.ts`): comprueba que quede stock, que la persona no haya reclamado ya y, si la promo es *solo ganadores*, que haya quedado entre los primeros `puestos` de una partida del minijuego terminada **después** del lanzamiento; y solo entonces resta. Nadie se cuela entre la comprobación y la resta.

**Solo ganadores:** promo escucha `GAME.PARTIDA_FINALIZADA` en el bus (lo publica planazo-game), anota el podio y avisa a cada premiado con `PROMO.UNLOCKED` en `user:<id>`. También escucha `PLACE.CREATED` (booking) para que los negocios nuevos puedan lanzar promociones.

**Si Redis se vacía**, al arrancar se reconstruye el stock de las promos vigentes desde los cupones entregados en PostgreSQL, y los puestos de los últimos 3 días.

**Por qué el contador vive aparte:** necesita decrementarse de forma indivisible bajo presión, y eso lo hace Redis con un script Lua. Sin `REDIS_URL` el servicio usa un contador en memoria con la misma regla (solo para desarrollo).

---

## API

| Método | Ruta | Rol | Qué hace |
|---|---|---|---|
| `POST` | `/promos` | negocio | `{placeId, title, discount, stock, durationS}` → `201 Promo` (`expiresAt` epoch ms, `initialStock = stock`) |
| `GET` | `/promos?zone=` | cliente/negocio | `Promo[]` activas: `stock > 0` y no vencidas (`zone` opcional: `zona-g` \| `zona-t`) |
| `POST` | `/promos/:id/claim` | cliente | `200 Coupon` o `409 PROMO_AGOTADA` / `409 PROMO_VENCIDA` / `404` |
| `GET` | `/promos/mine` | cliente | `Coupon[]` del usuario |

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
| `PROMO.PUSH` | la `Promo` completa | `zone:<zona>`, `place:<id>` |
| `PROMO.WON` | `{promoId, placeId, stock, winner, userId}` | `zone:<zona>`, `place:<id>`, `user:<id>` |
| `PROMO.EXPIRED` | `{promoId, placeId}` (solo si quedaba stock) | `zone:<zona>`, `place:<id>` |

---

## Lo que NO hace

- **No decide quién ve la promoción.** Publica `PROMO.PUSH` con la zona y `realtime` la enruta a quien esté suscrito.
- No abre WebSockets.
- No toca cupos ni reservas — eso es de `booking`, aunque ambos repartan recursos escasos.

---

## Variables de entorno

Ver [`.env.example`](.env.example). Las que importan:

```bash
PORT=3002
GATEWAY_KEY=...                     # la misma que el gateway; sin ella no se exige (desarrollo)
REDIS_URL=redis://...               # contador de stock (CC-1). Sin ella: memoria, solo desarrollo
BUS_URL=redis://...                 # bus de eventos; puede ser el mismo Redis
SEED_PROMOS=false                   # opcional: no lanzar las 3 promociones de ejemplo al arrancar
```

---

## Definition of Done

1. **Recurso finito:** prueba de carga con N usuarios reclamando un cupón de stock 1 (o stock M con N>M). Criterio: exactamente el stock inicial de éxitos, el resto `409`, **cero cupones de más**.
2. El rechazo tiene que ser legible por el usuario, no un `500`.
3. Comprobar que al expirar el TTL, la promo deja de aceptar reclamos y emite `PROMO.EXPIRED`.

---

## Correr en local

```bash
nvm use            # Node 20
npm install
cp .env.example .env
npm run start:dev  # http://localhost:3002/health
```

`npm test` corre las pruebas del servicio, incluida la de CC-1 (10 reclamos simultáneos contra stock 2 → exactamente 2 cupones y 8 `PROMO_AGOTADA`). La prueba de carga real está en `planazo-infra/k6/cc1-promo-claim.js`.

## Despliegue en Railway

Ya está desplegado desde GitHub (`main`) por `planazo-infra/scripts/railway-deploy-core.sh`, con `PORT=3002`, `GATEWAY_KEY`, `REDIS_URL=${{Redis.REDIS_URL}}` y `BUS_URL=${{Redis.REDIS_URL}}`, sin dominio público. El gateway llega por `PROMO_URL=http://planazo-promo.railway.internal:3002`. Cada push a `main` redespliega; como las promociones y los cupones viven en memoria, un redespliegue los reinicia (el stock en Redis sí sobrevive, por eso el servicio vuelve a lanzar las tres promociones de ejemplo).

Queda abierto del issue #3: cupones y promociones en PostgreSQL (punto 2) y correr `k6/cc1-promo-claim.js` contra Railway (punto 7).
