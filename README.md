# WhatsApp Health Service v2

Servicio de monitoreo de salud para bots de WhatsApp. Envia mensajes simulando un cliente real, mide latencia de respuesta y clasifica el estado de cada bot. Notifica a Slack cuando hay problemas y persiste metricas en Datum V2.

**Stack:** Baileys + TypeScript + ESM | ~50 MB RAM (vs ~650 MB con whatsapp-web.js + Chromium)

## Arquitectura

```
               +-------------------+
               |    node-cron      |
               | (cada N minutos)  |
               +--------+----------+
                        |
                        v
               +--------+----------+
               |    runCycle()      |
               |    cycle.ts        |
               +--------+----------+
                        |
         +--------------+--------------+
         |              |              |
         v              v              v
   +-----------+  +-----------+  +-----------+
   | fetchBots |  | loadConfig|  | sendToAll |
   | bots.ts   |  | config.ts |  | sender.ts |
   +-----------+  +-----------+  +-----+-----+
         |              |              |
         v              v              v
   +-----------+              +--------+--------+
   | Datum V2  |              | waitForResponses|
   | datum.ts  |              | receiver.ts     |
   +-----------+              +--------+--------+
                                       |
                              +--------+--------+
                              |                 |
                              v                 v
                        +-----------+     +-----------+
                        | notifySlack|    | saveMetrics|
                        | slack.ts   |    | metrics.ts |
                        +-----------+     +-----------+
                              |                 |
                              v                 v
                        +-----------+     +-----------+
                        | Slack API |     | Datum V2  |
                        +-----------+     +-----------+
```

## Flujo del Ciclo de Monitoreo

```
1. FETCH     → Obtener bots activos de Datum V2 (is_active=true)
2. CONFIG    → Cargar umbrales de clasificacion desde Datum V2
3. LISTEN    → Registrar listener de respuestas (messages.upsert)
4. SEND      → Enviar mensaje aleatorio a cada bot (orden aleatorio, delay 2-8s)
5. RECEIVE   → Capturar respuestas, medir latencia, resolver LID → phone
6. CLASSIFY  → OK (≤5s) | SLOW (≤10s) | DOWN (timeout)
7. NOTIFY    → Slack: mensaje principal + hilo con detalles (solo si hay problemas)
8. PERSIST   → Guardar ciclo y metricas por bot en Datum V2
```

### Detalle: Envio y Recepcion

El listener se registra **antes** de enviar mensajes. Esto evita perder respuestas de bots rapidos que contestan antes de que termine el envio completo.

```
t=0s   → Registrar listener messages.upsert
t=0s   → Enviar a Bot A (delay aleatorio 2-8s)
t=3s   → Bot A responde → capturado ✓ (listener ya activo)
t=6s   → Enviar a Bot B
t=9s   → Bot B responde → capturado ✓
t=13s  → Enviar a Bot C
t=16s  → Bot C responde → capturado ✓
t=16s  → Todos respondieron → resolver antes del timeout
```

### Detalle: Resolucion LID

WhatsApp Business accounts responden desde JIDs en formato LID (`240509662564439@lid`) en lugar del formato tradicional (`593967723442@s.whatsapp.net`). El receiver resuelve LID → phone usando el mapping interno de Baileys:

```
1. Busqueda directa: sendRecords.get(jid)
2. Si @lid → sock.signalRepository.lidMapping.getPNForLID(lid)
3. Fallback  → getLIDForPN() por cada bot tracked
```

## Estructura del Proyecto

```
src/
├── index.ts          Entry point: conexion + cron scheduling
├── connection.ts     Baileys socket, auth, QR, auto-reconnect
├── cycle.ts          Orquestacion del ciclo de monitoreo
├── sender.ts         Envio de mensajes con delay aleatorio
├── receiver.ts       Escucha respuestas, clasifica latencia
├── slack.ts          Notificaciones Slack (Web API + threads)
├── config.ts         Carga config desde Datum V2
├── bots.ts           Fetch bots activos desde Datum V2
├── datum.ts          Cliente HTTP para Datum V2 (fetch nativo)
├── messages.ts       30 templates de mensajes en espanol
├── metrics.ts        Persistencia de ciclos y metricas
└── types.ts          Interfaces TypeScript compartidas
```

## Clasificacion de Estado

| Estado | Condicion | Accion |
|--------|-----------|--------|
| **OK** | Latencia ≤ `threshold_ok_seconds` (5s) | Sin alerta |
| **SLOW** | Latencia entre 5s y `threshold_slow_seconds` (10s) | Alerta si % ≥ `slow_alert_min_percentage` |
| **DOWN** | Latencia > `threshold_slow_seconds` (10s) o sin respuesta (timeout) | Siempre alerta |

## Notificaciones Slack

### Cuando se notifica

- `DOWN > 0` → siempre
- `SLOW %` ≥ `slow_alert_min_percentage` (10%) → alerta
- Todos OK → sin notificacion (log solamente)
- `DOWN %` ≥ `critical_down_percentage` (50%) → alerta critica con `@channel`

### Formato

**Mensaje principal:**
```
:rotating_light: ALERTA CRITICA — WhatsApp Health Check
:red_circle: 3 Down · :large_yellow_circle: 2 Slow · :large_green_circle: 26/31 · Avg 3.2s

:red_circle: Services DOWN (3):
:red_circle: Banco Guayaquil S.A. — timeout (Gupshup)
:red_circle: DePrati — timeout (Gupshup)

:large_yellow_circle: Services SLOW (2):
:large_yellow_circle: Sophi Banco del Pacifico — 8.2s (Gupshup)

[Abrir Dashboard]  ← solo en alertas criticas

Cycle: 10/5/2026, 14:32:05
```

**Hilo de respuesta (thread reply):**
```
:mag: Detalles y timestamps del ciclo de monitoreo
enviado → respondio = latencia
---
*Banco Guayaquil S.A.*
14:32:05 → timeout

*Sophi Banco del Pacifico*
14:32:12 → 14:32:20 = 8.2s
---
Resumen por provider:
* Gupshup: 3 down, 2 slow (29 bots)
* Jelou: all ok (1 bot)
```

## Configuracion

### Variables de Entorno

```env
# Datum V2
DATUM_BASE_URL=https://whatsapp-health-0ck4d9.jelou.cloud
DATUM_API_KEY=

# Slack
SLACK_BOT_TOKEN=       # xoxb-... (necesita scope chat:write)
SLACK_CHANNEL_ID=      # C059P0EUF4P
```

### Configuracion Remota (Datum V2)

La configuracion se carga de la coleccion `SERVICE_CONFIG` al inicio de cada ciclo. Si Datum no esta disponible, se usan valores por defecto:

| Parametro | Default | Descripcion |
|-----------|---------|-------------|
| `threshold_ok_seconds` | 5 | Latencia maxima para OK |
| `threshold_slow_seconds` | 10 | Latencia maxima para SLOW |
| `slow_alert_min_percentage` | 25 | % minimo de SLOW para alertar |
| `critical_down_percentage` | 50 | % de DOWN para alerta critica |
| `dashboard_url` | tooling.jelou.dev/whatsapp-health | URL del dashboard |
| `cron_minutes` | 120 | Intervalo entre ciclos (minutos) |

### Colecciones Datum V2

| Coleccion | ID | Uso |
|-----------|----|-----|
| Bots | `pbc_1454544717` | Bots activos con relacion a provider |
| Monitoring Cycles | `pbc_4232756060` | Resultado por ciclo |
| Bot Health Metrics | `pbc_3851449081` | Metrica por bot por ciclo |
| Service Config | `pbc_152754480` | Configuracion del servicio |

## Setup

### Requisitos

- Node.js ≥ 18
- Numero de WhatsApp activo (para escanear QR)
- API key de Datum V2
- Slack Bot Token con scope `chat:write`

### Instalacion

```bash
git clone https://github.com/gabrieltumbaco/whatsapp-health-service.git
cd whatsapp-health-service
npm install
cp .env.example .env
# Editar .env con las credenciales
```

### Primera Ejecucion

```bash
npm run dev
```

1. Se muestra un codigo QR en la terminal
2. Escanear con WhatsApp (Linked Devices)
3. La sesion se guarda en `auth/` (persistente)
4. El primer ciclo se ejecuta automaticamente
5. Los siguientes ciclos se ejecutan segun `cron_minutes`

### Produccion

```bash
npm run build
npm start
```

## Dependencias

| Paquete | Uso |
|---------|-----|
| `@whiskeysockets/baileys` | Conexion WhatsApp via WebSocket |
| `dotenv` | Variables de entorno |
| `node-cron` | Scheduling de ciclos |
| `qrcode-terminal` | QR en terminal para auth |

**Sin dependencias pesadas.** No usa Puppeteer, Chromium, @slack/bolt, ni axios. Todo HTTP usa `fetch()` nativo de Node 18+.

## Logs

Todos los logs usan prefijos con formato `[LABEL]`:

```
[MAIN]       → Inicio, scheduling
[CONNECTION] → Estado de conexion WhatsApp
[AUTH]       → QR code, autenticacion
[CONFIG]     → Carga de configuracion
[SEND]       → Envio de mensajes (bot + delay)
[RECV]       → Recepcion de respuestas (bot + latencia + estado)
[CYCLE]      → Inicio/fin de ciclo, resultados
[SLACK]      → Notificaciones enviadas
[METRICS]    → Persistencia en Datum V2
[CRON]       → Trigger de ciclo programado
[FATAL]      → Error critico, proceso termina
```

## Metricas Persistidas

### monitoring_cycles

```json
{
  "started_at": "2026-05-10T19:32:00.000Z",
  "finished_at": "2026-05-10T19:33:15.000Z",
  "total_bots": 31,
  "bots_ok": 26,
  "bots_slow": 2,
  "bots_down": 3,
  "avg_latency_ms": 3200
}
```

### bot_health_metrics

```json
{
  "bot_id": "abc123",
  "cycle_id": "xyz789",
  "sent_at": "2026-05-10T19:32:05.000Z",
  "responded_at": "2026-05-10T19:32:08.000Z",
  "latency_ms": 3000,
  "status": "OK"
}
```
