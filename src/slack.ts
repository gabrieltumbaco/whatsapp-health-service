import type { CycleResult, Config, BotResult } from './types.js';

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = process.env.SLACK_CHANNEL_ID;
const SLACK_API = 'https://slack.com/api/chat.postMessage';
const TIMEOUT_MS = 10_000;

interface SlackResponse {
  ok: boolean;
  ts?: string;
  error?: string;
}

async function slackPost(body: Record<string, unknown>): Promise<SlackResponse | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(SLACK_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SLACK_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: SLACK_CHANNEL, ...body }),
      signal: controller.signal,
    });

    const data = (await res.json()) as SlackResponse;

    if (!data.ok) {
      console.log(`[SLACK] API error: ${data.error}`);
      return null;
    }

    return data;
  } catch (err) {
    const msg = err instanceof Error && err.name === 'AbortError'
      ? 'timeout'
      : (err as Error).message;
    console.log(`[SLACK] Error: ${msg}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function section(text: string) {
  return { type: 'section', text: { type: 'mrkdwn', text } };
}

function divider() {
  return { type: 'divider' };
}

function context(text: string) {
  return { type: 'context', elements: [{ type: 'mrkdwn', text }] };
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('es-EC', {
    timeZone: 'America/Guayaquil',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
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
    ? ':rotating_light: <!channel> *ALERTA CRÍTICA — WhatsApp Health Check*'
    : ':warning: *WhatsApp Health Check — Issues Detected*';

  blocks.push(section(header));

  const summary = [
    `:red_circle: ${cycle.down.length} Down`,
    `:large_yellow_circle: ${cycle.slow.length} Slow`,
    `:large_green_circle: ${cycle.ok.length}/${total}`,
    `Avg \`${cycle.avgLatencyMs ? (cycle.avgLatencyMs / 1000).toFixed(1) + 's' : 'N/A'}\``,
  ].join(' · ');

  blocks.push(section(summary));
  blocks.push(divider());

  if (cycle.down.length > 0) {
    blocks.push(section(`*:red_circle: Services DOWN (${cycle.down.length}):*\n${formatBotList(cycle.down, ':red_circle:')}`));
  }

  if (cycle.slow.length > 0) {
    blocks.push(section(`*:large_yellow_circle: Services SLOW (${cycle.slow.length}):*\n${formatBotList(cycle.slow, ':large_yellow_circle:')}`));
  }

  if (isCritical && config.dashboard_url) {
    blocks.push(divider());
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: ':bar_chart: Ver detalles en el dashboard' },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'Abrir Dashboard' },
        url: config.dashboard_url,
        action_id: 'dashboard-action',
      },
    });
  }

  const now = new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' });
  blocks.push(context(`Cycle: ${now}`));

  return blocks;
}

function buildThreadBlocks(cycle: CycleResult) {
  const blocks: any[] = [];

  blocks.push(section(':mag: *Detalles y timestamps del ciclo de monitoreo*\n`enviado` → `respondió` = `latencia`'));
  blocks.push(divider());

  const issues = [...cycle.down, ...cycle.slow];
  const lines = issues.map((r) => {
    const sent = r.sentAt ? `\`${formatTime(r.sentAt)}\`` : ':x: no enviado';
    if (r.latencyMs === null) {
      return `*${r.bot.botName}*\n${sent} → timeout`;
    }
    const responded = r.respondedAt ? `\`${formatTime(r.respondedAt)}\`` : '-';
    return `*${r.bot.botName}*\n${sent} → ${responded} = \`${(r.latencyMs / 1000).toFixed(1)}s\``;
  });

  let chunk = '';
  for (const line of lines) {
    if (chunk.length + line.length + 1 > 3000) {
      blocks.push(section(chunk));
      chunk = '';
    }
    chunk += (chunk ? '\n' : '') + line;
  }
  if (chunk) blocks.push(section(chunk));

  blocks.push(divider());

  const providers: Record<string, { total: number; down: number; slow: number }> = {};
  for (const r of cycle.results) {
    const p = r.bot.provider ?? 'N/A';
    if (!providers[p]) providers[p] = { total: 0, down: 0, slow: 0 };
    providers[p].total++;
  }
  for (const r of cycle.down) {
    const p = r.bot.provider ?? 'N/A';
    providers[p].down++;
  }
  for (const r of cycle.slow) {
    const p = r.bot.provider ?? 'N/A';
    providers[p].slow++;
  }

  const providerLines = Object.entries(providers)
    .sort((a, b) => (b[1].down + b[1].slow) - (a[1].down + a[1].slow))
    .map(([name, stats]) => {
      const parts: string[] = [];
      if (stats.down > 0) parts.push(`${stats.down} down`);
      if (stats.slow > 0) parts.push(`${stats.slow} slow`);
      const issues = parts.length > 0 ? parts.join(', ') : 'all ok';
      return `• ${name}: ${issues} (${stats.total} bots)`;
    });

  blocks.push(section(`*Resumen por provider:*\n${providerLines.join('\n')}`));

  return blocks;
}

export async function notifySlack(cycle: CycleResult, config: Config): Promise<void> {
  if (!SLACK_TOKEN || !SLACK_CHANNEL) return;

  const slowPct = (cycle.slow.length / cycle.results.length) * 100;
  const hasDown = cycle.down.length > 0;
  const slowAboveThreshold = slowPct >= config.slow_alert_min_percentage;

  if (!hasDown && !slowAboveThreshold) {
    console.log('[SLACK] All OK — no notification needed');
    return;
  }

  const isCritical = (cycle.down.length / cycle.results.length) * 100 >= config.critical_down_percentage;
  const text = isCritical
    ? `CRITICAL: ${cycle.down.length}/${cycle.results.length} services DOWN`
    : `Health Check: ${cycle.down.length} DOWN, ${cycle.slow.length} SLOW`;

  const blocks = buildBlocks(cycle, config);
  const result = await slackPost({ text, blocks, unfurl_links: false, unfurl_media: false });

  if (!result) return;
  console.log('[SLACK] Notification sent');

  if (result.ts) {
    const threadBlocks = buildThreadBlocks(cycle);
    const threadResult = await slackPost({
      text: 'Detalles del ciclo',
      blocks: threadBlocks,
      thread_ts: result.ts,
      unfurl_links: false,
      unfurl_media: false,
    });

    if (threadResult) {
      console.log('[SLACK] Thread reply sent');
    }
  }
}
