import 'dotenv/config';
import cron from 'node-cron';
import { createConnection } from './connection.js';
import { runCycle } from './cycle.js';
import { loadConfig } from './config.js';

function minutesToCronExpression(minutes: number): string {
  if (minutes < 60) return `*/${minutes} * * * *`;
  const hours = Math.floor(minutes / 60);
  return `0 */${hours} * * *`;
}

async function main() {
  console.log('[MAIN] WhatsApp Health Service v2 starting...');

  const config = await loadConfig();
  const cronExpr = minutesToCronExpression(config.cron_minutes);

  const sock = await createConnection();

  cron.schedule(cronExpr, () => {
    console.log('[CRON] Triggering health check cycle');
    runCycle(sock);
  });

  console.log(`[MAIN] Scheduled: every ${config.cron_minutes} minutes (${cronExpr})`);
  console.log('[MAIN] Running first cycle now...');

  await runCycle(sock);
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
