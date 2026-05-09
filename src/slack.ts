import type { CycleResult, Config, BotResult } from './types.js';

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

function section(text: string) {
  return { type: 'section', text: { type: 'mrkdwn', text } };
}

function divider() {
  return { type: 'divider' };
}

function context(text: string) {
  return { type: 'context', elements: [{ type: 'mrkdwn', text }] };
}

function formatBotList(bots: BotResult[], emoji: string): string {
  return bots
    .map((b) => {
      const latency = b.latencyMs ? `${(b.latencyMs / 1000).toFixed(1)}s` : 'timeout';
      return `${emoji} ${b.bot.botName} — ${latency} (${b.bot.provider ?? 'unknown'})`;
    })
    .join('\n');
}

function buildBlocks(cycle: CycleResult, config: Config) {
  const total = cycle.results.length;
  const isCritical =
    (cycle.down.length / total) * 100 >= config.critical_down_percentage;

  const blocks: any[] = [];

  const header = isCritical
    ? ':rotating_light: *CRITICAL — WhatsApp Health Check*'
    : ':warning: *WhatsApp Health Check — Issues Detected*';

  blocks.push(section(header));

  const summary = [
    `*DOWN:* ${cycle.down.length}`,
    `*SLOW:* ${cycle.slow.length}`,
    `*OK:* ${cycle.ok.length}/${total}`,
    `*Avg Latency:* ${cycle.avgLatencyMs ? (cycle.avgLatencyMs / 1000).toFixed(1) + 's' : 'N/A'}`,
  ].join('  |  ');

  blocks.push(section(summary));
  blocks.push(divider());

  if (cycle.down.length > 0) {
    blocks.push(section(`*Services DOWN (${cycle.down.length}):*\n${formatBotList(cycle.down, ':red_circle:')}`));
  }

  if (cycle.slow.length > 0) {
    blocks.push(section(`*Services SLOW (${cycle.slow.length}):*\n${formatBotList(cycle.slow, ':large_yellow_circle:')}`));
  }

  if (isCritical && config.dashboard_url) {
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: 'View Dashboard' },
        url: config.dashboard_url,
      }],
    });
  }

  const now = new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' });
  blocks.push(context(`Cycle: ${now}`));

  return blocks;
}

export async function notifySlack(cycle: CycleResult, config: Config): Promise<void> {
  if (!WEBHOOK_URL) return;

  const slowPct = (cycle.slow.length / cycle.results.length) * 100;
  const hasDown = cycle.down.length > 0;
  const slowAboveThreshold = slowPct >= config.slow_alert_min_percentage;

  if (!hasDown && !slowAboveThreshold) {
    console.log('[SLACK] All OK — no notification needed');
    return;
  }

  const blocks = buildBlocks(cycle, config);

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });

    if (!res.ok) {
      console.log(`[SLACK] Webhook failed: ${res.status}`);
    } else {
      console.log('[SLACK] Notification sent');
    }
  } catch (err) {
    console.log(`[SLACK] Error: ${(err as Error).message}`);
  }
}
