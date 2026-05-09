import type { WASocket } from '@whiskeysockets/baileys';
import type { Bot, BotResult, Config } from './types.js';

function extractPhoneNumber(jid: string): string {
  return jid.replace('@s.whatsapp.net', '').replace('@lid', '');
}

function classifyLatency(
  latencyMs: number,
  config: Config
): 'OK' | 'SLOW' {
  const latencySec = latencyMs / 1000;
  if (latencySec <= config.threshold_ok_seconds) return 'OK';
  return 'SLOW';
}

export function waitForResponses(
  sock: WASocket,
  bots: Bot[],
  sendTimestamps: Map<string, number>,
  config: Config
): Promise<BotResult[]> {
  const timeoutMs = config.threshold_slow_seconds * 2 * 1000;
  const pending = new Set(sendTimestamps.keys());
  const results: BotResult[] = [];
  const botByPhone = new Map(bots.map((b) => [b.phoneNumber, b]));

  return new Promise((resolve) => {
    const handler = ({ messages, type }: { messages: any[]; type: string }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (msg.key.fromMe) continue;

        const phone = extractPhoneNumber(msg.key.remoteJid || '');
        if (!pending.has(phone)) continue;

        const sentAt = sendTimestamps.get(phone)!;
        const respondedAt = Date.now();
        const latencyMs = respondedAt - sentAt;
        const status = classifyLatency(latencyMs, config);
        const bot = botByPhone.get(phone)!;

        results.push({ bot, status, latencyMs, sentAt, respondedAt });
        pending.delete(phone);

        console.log(`[RECV] ${bot.botName}: ${(latencyMs / 1000).toFixed(1)}s [${status}]`);

        if (pending.size === 0) {
          clearTimeout(timer);
          sock.ev.off('messages.upsert', handler);
          resolve(results);
        }
      }
    };

    sock.ev.on('messages.upsert', handler);

    const timer = setTimeout(() => {
      sock.ev.off('messages.upsert', handler);

      for (const phone of pending) {
        const bot = botByPhone.get(phone)!;
        const sentAt = sendTimestamps.get(phone)!;
        results.push({ bot, status: 'DOWN', latencyMs: null, sentAt, respondedAt: null });
        console.log(`[RECV] ${bot.botName}: TIMEOUT [DOWN]`);
      }

      resolve(results);
    }, timeoutMs);
  });
}
