import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';

let sock: WASocket | null = null;
let resolveReady: (() => void) | null = null;

export function getSocket(): WASocket {
  if (!sock) throw new Error('Socket not initialized');
  return sock;
}

async function connect(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState('auth');

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
      console.log('[CONNECTION] Connected');
      resolveReady?.();
    }
  });
}

export async function createConnection(): Promise<WASocket> {
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  await connect();
  await ready;

  return sock!;
}
