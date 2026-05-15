import { datumCreate, datumBatch, COLLECTIONS } from './datum.js';
import type { CycleResult } from './types.js';

export async function saveMetrics(cycle: CycleResult): Promise<void> {
  try {
    const cycleRecord = await datumCreate<{ id: string }>(
      COLLECTIONS.MONITORING_CYCLES,
      {
        started_at: cycle.startedAt,
        finished_at: cycle.finishedAt,
        total_bots: cycle.results.length,
        bots_ok: cycle.ok.length,
        bots_slow: cycle.slow.length,
        bots_down: cycle.down.length,
        bots_send_fail: cycle.sendFail.length,
        avg_latency_ms: cycle.avgLatencyMs,
      }
    );

    const cycleId = cycleRecord.id;
    console.log(`[METRICS] Cycle created: ${cycleId}`);

    const batchRequests = cycle.results.map((r) => ({
      method: 'POST',
      url: `/api/collections/${COLLECTIONS.BOT_HEALTH_METRICS}/records`,
      body: {
        bot_id: r.bot.id,
        cycle_id: cycleId,
        sent_at: r.sentAt ? new Date(r.sentAt).toISOString() : null,
        delivered_at: r.deliveredAt ? new Date(r.deliveredAt).toISOString() : null,
        responded_at: r.respondedAt ? new Date(r.respondedAt).toISOString() : null,
        latency_ms: r.latencyMs,
        status: r.status,
      },
    }));

    await datumBatch(batchRequests);
    console.log(`[METRICS] ${batchRequests.length} bot metrics saved`);
  } catch (err) {
    console.log(`[METRICS] Error: ${(err as Error).message}`);
  }
}
