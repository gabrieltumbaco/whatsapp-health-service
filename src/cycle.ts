import type { WASocket } from '@whiskeysockets/baileys';
import { loadConfig } from './config.js';
import { fetchBots } from './bots.js';
import { sendToAll } from './sender.js';
import { waitForResponses } from './receiver.js';
import { notifySlack } from './slack.js';
import { saveMetrics } from './metrics.js';
import type { BotResult, CycleResult, SendRecord } from './types.js';

function buildCycleResult(results: BotResult[], startedAt: string): CycleResult {
  const ok = results.filter((r) => r.status === 'OK');
  const slow = results.filter((r) => r.status === 'SLOW');
  const down = results.filter((r) => r.status === 'DOWN');

  const responded = results.filter((r) => r.latencyMs !== null);
  const avgLatencyMs =
    responded.length > 0
      ? Math.round(responded.reduce((sum, r) => sum + r.latencyMs!, 0) / responded.length)
      : null;

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    results,
    ok,
    slow,
    down,
    avgLatencyMs,
  };
}

let cycleRunning = false;

export async function runCycle(sock: WASocket): Promise<void> {
  if (cycleRunning) {
    console.log('[CYCLE] Already running, skipping');
    return;
  }

  cycleRunning = true;
  const startedAt = new Date().toISOString();

  console.log('[CYCLE] ========== START ==========');

  try {
    const config = await loadConfig();
    const bots = await fetchBots();

    console.log(`[CYCLE] ${bots.length} active bots, thresholds: OK<=${config.threshold_ok_seconds}s SLOW<=${config.threshold_slow_seconds}s`);

    const sendRecords = new Map<string, SendRecord>();
    let notifySendDone!: () => void;
    const sendingDone = new Promise<void>((r) => { notifySendDone = r; });

    const responsePromise = waitForResponses(sock, bots, sendRecords, config, sendingDone);
    await sendToAll(sock, bots, sendRecords);
    notifySendDone();

    const results = await responsePromise;
    const cycle = buildCycleResult(results, startedAt);

    console.log(`[CYCLE] Results: ${cycle.ok.length} OK, ${cycle.slow.length} SLOW, ${cycle.down.length} DOWN`);

    await notifySlack(cycle, config);
    await saveMetrics(cycle);
  } catch (err) {
    console.log(`[CYCLE] Error: ${(err as Error).message}`);
  } finally {
    cycleRunning = false;
    console.log('[CYCLE] ========== END ==========');
  }
}
