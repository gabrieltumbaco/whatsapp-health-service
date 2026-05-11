import type { WASocket } from '@whiskeysockets/baileys';
import type { Bot, BotResult, Config, SendRecord } from './types.js';

function classifyLatency(
  latencyMs: number,
  config: Config
): 'OK' | 'SLOW' | 'DOWN' {
  const latencySec = latencyMs / 1000;
  if (latencySec <= config.threshold_ok_seconds) return 'OK';
  if (latencySec <= config.threshold_slow_seconds) return 'SLOW';
  return 'DOWN';
}

async function resolveRecord(
  sock: WASocket,
  jid: string,
  sendRecords: Map<string, SendRecord>
): Promise<SendRecord | null> {
  const direct = sendRecords.get(jid);
  if (direct) return direct;

  if (jid.endsWith('@lid')) {
    const pn = await sock.signalRepository.lidMapping.getPNForLID(jid);
    if (pn) {
      const record = sendRecords.get(pn);
      if (record) {
        console.log(`[RECV] LID resolved: ${jid} → ${pn}`);
        return record;
      }
    }

    for (const [, record] of sendRecords) {
      const lid = await sock.signalRepository.lidMapping.getLIDForPN(record.phone + '@s.whatsapp.net');
      if (lid === jid) {
        console.log(`[RECV] LID matched via reverse: ${jid} → ${record.phone}`);
        return record;
      }
    }
  }

  return null;
}

export function waitForResponses(
  sock: WASocket,
  bots: Bot[],
  sendRecords: Map<string, SendRecord>,
  config: Config,
  sendingDone: Promise<void>
): Promise<BotResult[]> {
  const timeoutMs = config.threshold_slow_seconds * 2 * 1000;
  const responded = new Set<string>();
  const results: BotResult[] = [];
  const totalBots = bots.length;

  return new Promise((resolve) => {
    let timer: NodeJS.Timeout;

    const finish = () => {
      sock.ev.off('messages.upsert', handler);

      for (const bot of bots) {
        if (responded.has(bot.phoneNumber)) continue;
        const record = [...sendRecords.values()].find((r) => r.phone === bot.phoneNumber);
        results.push({
          bot,
          status: 'DOWN',
          latencyMs: null,
          sentAt: record?.sentAt ?? null,
          respondedAt: null,
        });
        console.log(`[RECV] ${bot.botName}: TIMEOUT [DOWN]`);
      }

      resolve(results);
    };

    const handler = async ({ messages, type }: { messages: any[]; type: string }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (msg.key.fromMe) continue;

        const jid = msg.key.remoteJid || '';
        const record = await resolveRecord(sock, jid, sendRecords);

        if (!record) continue;
        if (responded.has(record.phone)) continue;

        responded.add(record.phone);
        const respondedAt = Date.now();
        const latencyMs = respondedAt - record.sentAt;
        const status = classifyLatency(latencyMs, config);

        results.push({ bot: record.bot, status, latencyMs, sentAt: record.sentAt, respondedAt });
        console.log(`[RECV] ${record.bot.botName}: ${(latencyMs / 1000).toFixed(1)}s [${status}]`);

        if (responded.size === totalBots) {
          clearTimeout(timer);
          sock.ev.off('messages.upsert', handler);
          resolve(results);
        }
      }
    };

    sock.ev.on('messages.upsert', handler);

    sendingDone.then(() => {
      console.log(`[RECV] Sending done. ${responded.size}/${totalBots} already responded. Timeout in ${timeoutMs / 1000}s`);

      if (responded.size === totalBots) {
        resolve(results);
        return;
      }

      timer = setTimeout(finish, timeoutMs);
    });
  });
}
