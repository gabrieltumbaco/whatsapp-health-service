import type { WASocket } from '@whiskeysockets/baileys';
import type { Bot } from './types.js';
import { getRandomMessage } from './messages.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(min = 2000, max = 8000): number {
  return Math.floor(Math.random() * (max - min)) + min;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function sendToAll(
  sock: WASocket,
  bots: Bot[]
): Promise<Map<string, number>> {
  const shuffled = shuffle(bots);
  const sendTimestamps = new Map<string, number>();

  console.log(`[SEND] Sending to ${shuffled.length} bots`);

  for (const bot of shuffled) {
    const delay = randomDelay();
    await sleep(delay);

    const jid = bot.phoneNumber + '@s.whatsapp.net';
    const msg = getRandomMessage();

    try {
      await sock.sendMessage(jid, { text: msg });
      sendTimestamps.set(bot.phoneNumber, Date.now());
      console.log(`[SEND] ${bot.botName} (+${(delay / 1000).toFixed(1)}s)`);
    } catch (err) {
      console.log(`[SEND] ERROR ${bot.botName}: ${(err as Error).message}`);
    }
  }

  console.log(`[SEND] Done. ${sendTimestamps.size}/${bots.length} sent`);
  return sendTimestamps;
}
