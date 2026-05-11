import { loadConfig } from './config.js';
import { getSocket, isConnected, waitUntilConnected } from './connection.js';
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
  const sendFail = results.filter((r) => r.status === 'SEND_FAIL');

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
    sendFail,
    avgLatencyMs,
  };
}

let cycleRunning = false;

export async function runCycle(): Promise<void> {
  if (cycleRunning) {
    console.log('[CYCLE] Already running, skipping');
    return;
  }

  if (!isConnected()) {
    console.log('[CYCLE] Socket not connected, waiting up to 30s...');
    const ok = await waitUntilConnected(30_000);
    if (!ok) {
      console.log('[CYCLE] Socket still not connected after 30s, skipping cycle');
      return;
    }
    console.log('[CYCLE] Socket reconnected, proceeding');
  }

  cycleRunning = true;
  const startedAt = new Date().toISOString();

  console.log('[CYCLE] ========== START ==========');

  try {
    const sock = getSocket();
    const config = await loadConfig();
    const bots = await fetchBots();

    console.log(`[CYCLE] ${bots.length} active bots, thresholds: OK<=${config.threshold_ok_seconds}s SLOW<=${config.threshold_slow_seconds}s`);

    const sendRecords = new Map<string, SendRecord>();
    let notifySendDone!: () => void;
    const sendingDone = new Promise<void>((r) => { notifySendDone = r; });

    const responsePromise = waitForResponses(sock, sendRecords, config, sendingDone);
    const failedBots = await sendToAll(sock, bots, sendRecords);
    notifySendDone();

    const responseResults = await responsePromise;
    const failedResults: BotResult[] = failedBots.map((bot) => ({
      bot,
      status: 'SEND_FAIL' as const,
      latencyMs: null,
      sentAt: null,
      respondedAt: null,
    }));

    const cycle = buildCycleResult([...responseResults, ...failedResults], startedAt);

    const parts = [`${cycle.ok.length} OK`, `${cycle.slow.length} SLOW`, `${cycle.down.length} DOWN`];
    if (cycle.sendFail.length > 0) parts.push(`${cycle.sendFail.length} SEND_FAIL`);
    console.log(`[CYCLE] Results: ${parts.join(', ')}`);

    await notifySlack(cycle, config);
    await saveMetrics(cycle);
  } catch (err) {
    console.log(`[CYCLE] Error: ${(err as Error).message}`);
  } finally {
    cycleRunning = false;
    console.log('[CYCLE] ========== END ==========');
  }
}
