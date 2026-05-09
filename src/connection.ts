import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';

let sock: WASocket | null = null;
let connectionReady: (() => void) | null = null;

export function getSocket(): WASocket {
  if (!sock) throw new Error('Socket not initialized');
  return sock;
}

export async function createConnection(): Promise<WASocket> {
  const { state, saveCreds } = await useMultiFileAuthState('auth');

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false,
  });

  sock.ev.on('creds.update', saveCreds);

  const ready = new Promise<void>((resolve) => {
    connectionReady = resolve;
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = reason !== DisconnectReason.loggedOut;

      console.log(`[CONNECTION] Closed. Reason: ${reason}`);

      if (shouldReconnect) {
        console.log('[CONNECTION] Reconnecting...');
        createConnection();
      } else {
        console.log('[CONNECTION] Logged out. Delete auth/ folder and restart to re-scan QR.');
      }
    }

    if (connection === 'open') {
      console.log('[CONNECTION] Connected');
      connectionReady?.();
    }
  });

  await ready;
  return sock;
}
