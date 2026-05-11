# EC2 Deployment Guide

Guia para desplegar WhatsApp Health Service v2 en una instancia EC2.

## Requisitos

- EC2 t3.small (2GB RAM) o superior — t3.micro (1GB) tambien funciona
- Amazon Linux 2023 / AL2
- Node.js >= 20
- PM2 instalado globalmente
- Puerto de salida 443 abierto (WhatsApp WebSocket + Slack API)

## 1. Instalar Node.js 20+

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
node -v  # v20.x.x
```

## 2. Instalar PM2

```bash
npm install -g pm2
```

## 3. Clonar y configurar

```bash
cd ~
git clone https://github.com/gabrieltumbaco/whatsapp-health-service.git
cd whatsapp-health-service
npm install
```

## 4. Variables de entorno

```bash
cp .env.example .env
nano .env
```

Configurar:

```env
DATUM_BASE_URL=https://whatsapp-health-0ck4d9.jelou.cloud
DATUM_API_KEY=<tu_api_key>
SLACK_BOT_TOKEN=xoxb-...
SLACK_CHANNEL_ID=C059P0EUF4P
```

## 5. Build

```bash
npm run build
```

Genera `dist/` con archivos JS compilados via `tsc`.

## 6. Primera ejecucion (QR)

```bash
node dist/index.js
```

1. Aparece QR en terminal
2. Escanear con WhatsApp → Dispositivos vinculados
3. La sesion se guarda en `auth/` (persistente)
4. Primer ciclo se ejecuta automaticamente
5. Verificar que todos los bots responden OK
6. `Ctrl+C` para detener

## 7. Iniciar con PM2

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # copiar y ejecutar el comando que imprime
```

Verificar:

```bash
pm2 status
pm2 logs whatsapp-health --lines 20
```

## 8. Comandos utiles

| Comando | Descripcion |
|---------|-------------|
| `pm2 logs whatsapp-health` | Ver logs en tiempo real |
| `pm2 logs whatsapp-health --lines 50` | Ultimas 50 lineas |
| `pm2 restart whatsapp-health` | Reiniciar servicio |
| `pm2 stop whatsapp-health` | Detener servicio |
| `pm2 delete whatsapp-health` | Eliminar del PM2 |
| `pm2 monit` | Dashboard interactivo |

## 9. Actualizar codigo

```bash
cd ~/whatsapp-health-service
git pull
npm install       # si cambiaron dependencias
npm run build
pm2 restart whatsapp-health
```

## 10. Re-vincular WhatsApp

Si la sesion se invalida (ban, desvinculacion manual, corrupcion):

```bash
pm2 stop whatsapp-health
rm -rf auth/
node dist/index.js   # escanear QR nuevo
# Ctrl+C despues de verificar ciclo OK
pm2 start ecosystem.config.cjs
```

## Configuracion PM2 (ecosystem.config.cjs)

| Setting | Valor | Razon |
|---------|-------|-------|
| `exec_mode` | fork | Una sola conexion WebSocket |
| `max_memory_restart` | 200M | Servicio usa ~50MB, limite generoso |
| `node_args` | --max-old-space-size=256 | Limite V8 |
| `max_restarts` | 10 | Evitar restart loop |
| `restart_delay` | 5000ms | Esperar antes de reconectar |

## Notas

- **Memoria**: ~50-70MB en operacion normal (vs ~650MB del v1 con Chromium)
- **Cron**: configurado via Datum V2 (`cron_minutes`). Cambios requieren `pm2 restart`
- **Umbrales**: OK/SLOW/DOWN se recargan cada ciclo desde Datum V2 (sin restart)
- **Logs**: PM2 guarda en `~/whatsapp-health-service/logs/`. Rotacion via `pm2-logrotate`
- **Auth**: carpeta `auth/` contiene sesion Baileys. No borrar a menos que sea necesario re-vincular
