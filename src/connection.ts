import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.resolve(__dirname, '..', 'auth');

let sock: WASocket | null = null;
let connected = false;
let connectionReadyResolve: (() => void) | null = null;
let connectionReady: Promise<void> = new Promise((r) => { connectionReadyResolve = r; });

function resetConnectionReady() {
  connectionReady = new Promise((r) => { connectionReadyResolve = r; });
}

export function getSocket(): WASocket {
  if (!sock) throw new Error('Socket not initialized');
  return sock;
}

export function isConnected(): boolean {
  return connected;
}

export async function waitUntilConnected(timeoutMs = 30_000): Promise<boolean> {
  if (connected) return true;
  const timeout = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), timeoutMs));
  const result = await Promise.race([connectionReady.then(() => 'ok' as const), timeout]);
  return result === 'ok';
}

async function connect(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    auth: state,
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false,
    logger: pino({ level: 'silent' }),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('[AUTH] Scan this QR code with WhatsApp:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      connected = false;
      resetConnectionReady();
      const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = reason !== DisconnectReason.loggedOut;

      console.log(`[CONNECTION] Closed. Reason: ${reason}`);

      if (shouldReconnect) {
        console.log('[CONNECTION] Reconnecting...');
        connect();
      } else {
        console.log('[CONNECTION] Logged out. Delete auth/ folder and restart.');
      }
    }

    if (connection === 'open') {
      connected = true;
      connectionReadyResolve?.();
      console.log('[CONNECTION] Connected');
    }
  });
}

export async function createConnection(): Promise<void> {
  resetConnectionReady();
  await connect();
  await connectionReady;
}
