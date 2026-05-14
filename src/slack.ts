import type { CycleResult, Config, BotResult } from './types.js';

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = process.env.SLACK_CHANNEL_ID;
const SLACK_API = 'https://slack.com/api/chat.postMessage';
const TIMEOUT_MS = 10_000;
const DEFAULT_PROVIDER = 'Gupshup';

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

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('es-EC', {
    timeZone: 'America/Guayaquil',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatBotList(bots: BotResult[]): string {
  return [...bots]
    .sort((a, b) => (b.latencyMs ?? Infinity) - (a.latencyMs ?? Infinity))
    .map((b) => {
      const latency = b.latencyMs ? `${(b.latencyMs / 1000).toFixed(1)}s` : 'timeout';
      const name = `<https://wa.me/${b.bot.phoneNumber}|${b.bot.botName}>`;
      const provider = b.bot.provider && b.bot.provider !== DEFAULT_PROVIDER
        ? ` [${b.bot.provider}]`
        : '';
      return `• ${name}${provider} — \`${latency}\``;
    })
    .join('\n');
}

function splitIntoSections(text: string) {
  const lines = text.split('\n');
  const blocks: any[] = [];
  let chunk = '';
  for (const line of lines) {
    if (chunk.length + line.length + 1 > 3000) {
      blocks.push(section(chunk));
      chunk = '';
    }
    chunk += (chunk ? '\n' : '') + line;
  }
  if (chunk) blocks.push(section(chunk));
  return blocks;
}

function sentTotal(cycle: CycleResult): number {
  return cycle.results.length - cycle.sendFail.length;
}

function buildBlocks(cycle: CycleResult, config: Config) {
  const total = sentTotal(cycle);
  const isCritical = total > 0 &&
    (cycle.down.length / total) * 100 >= config.critical_down_percentage;

  const blocks: any[] = [];

  if (isCritical) {
    blocks.push(section(':rotating_light: <!channel> *ALERTA CRITICA — WhatsApp Health Check*'));
  }

  const summaryParts = [
    `:red_circle: ${cycle.down.length} Down`,
    `:large_yellow_circle: ${cycle.slow.length} Slow`,
    `:large_green_circle: ${cycle.ok.length}/${total}`,
    `Avg \`${cycle.avgLatencyMs ? (cycle.avgLatencyMs / 1000).toFixed(2) + 's' : 'N/A'}\``,
  ];
  if (cycle.sendFail.length > 0) {
    summaryParts.push(`:no_entry: ${cycle.sendFail.length} Send fail`);
  }

  blocks.push(section(summaryParts.join(' · ')));
  blocks.push(divider());

  if (cycle.down.length > 0) {
    blocks.push(section('*:red_circle: Down Services*'));
    const downList = formatBotList(cycle.down);
    if (downList.length <= 3000) {
      blocks.push(section(downList));
    } else {
      blocks.push(...splitIntoSections(downList));
    }
  }

  if (cycle.slow.length > 0) {
    blocks.push(section('*:large_yellow_circle: Slow Services*'));
    const slowList = formatBotList(cycle.slow);
    if (slowList.length <= 3000) {
      blocks.push(section(slowList));
    } else {
      blocks.push(...splitIntoSections(slowList));
    }
  }

  if (cycle.sendFail.length > 0) {
    const failList = cycle.sendFail.map((b) => `:no_entry: ${b.bot.botName} (${b.bot.provider ?? 'unknown'})`).join('\n');
    blocks.push(section(`*:no_entry: Send failed (${cycle.sendFail.length}):*\n${failList}`));
  }

  if (isCritical && config.dashboard_url) {
    blocks.push(divider());
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: ':bar_chart: Ver detalles en el dashboard' },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'Abrir Dashboard' },
        style: 'primary',
        url: config.dashboard_url,
        action_id: 'dashboard-action',
      },
    });
  }

  return blocks;
}

function buildThreadBlocks(cycle: CycleResult) {
  const blocks: any[] = [];

  blocks.push(section(':mag: *Detalles y timestamps del ciclo de monitoreo*\n`enviado` → `respondió` = `latencia`'));
  blocks.push(divider());

  const issues = [...cycle.down, ...cycle.slow];
  const lines = issues.map((r) => {
    const name = `<https://wa.me/${r.bot.phoneNumber}|${r.bot.botName}>`;
    const sent = r.sentAt ? `\`${formatTime(r.sentAt)}\`` : ':x: no enviado';
    if (r.latencyMs === null) {
      return `*${name}*\n${sent} → timeout`;
    }
    const responded = r.respondedAt ? `\`${formatTime(r.respondedAt)}\`` : '-';
    return `*${name}*\n${sent} → ${responded} = \`${(r.latencyMs / 1000).toFixed(1)}s\``;
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

  const total = sentTotal(cycle);
  const hasSendFail = cycle.sendFail.length > 0;
  const hasDown = cycle.down.length > 0;
  const slowPct = total > 0 ? (cycle.slow.length / total) * 100 : 0;
  const slowAboveThreshold = slowPct >= config.slow_alert_min_percentage;

  if (!hasDown && !slowAboveThreshold && !hasSendFail) {
    console.log('[SLACK] All OK — no notification needed');
    return;
  }

  const isCritical = total > 0 &&
    (cycle.down.length / total) * 100 >= config.critical_down_percentage;
  const text = isCritical
    ? `CRITICAL: ${cycle.down.length}/${total} services DOWN`
    : `Health Check: ${cycle.down.length} DOWN, ${cycle.slow.length} SLOW${hasSendFail ? `, ${cycle.sendFail.length} SEND_FAIL` : ''}`;

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
