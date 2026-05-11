import 'dotenv/config';
import cron from 'node-cron';
import { createConnection } from './connection.js';
import { runCycle } from './cycle.js';
import { loadConfig } from './config.js';

const NOISE = ['Closing session', 'Session error', 'Bad MAC', 'Failed to decrypt', 'Decrypted message', 'Session already'];
function filterNoise(original: (...args: unknown[]) => void) {
  return (...args: unknown[]) => {
    const str = args.map(String).join(' ');
    if (NOISE.some((n) => str.includes(n))) return;
    original(...args);
  };
}
console.log = filterNoise(console.log.bind(console));
console.error = filterNoise(console.error.bind(console));
console.warn = filterNoise(console.warn.bind(console));
console.info = filterNoise(console.info.bind(console));

function minutesToCronExpression(minutes: number): string {
  if (minutes < 60) return `*/${minutes} * * * *`;
  const hours = Math.floor(minutes / 60);
  return `0 */${hours} * * *`;
}

function validateEnv(): void {
  const required = ['DATUM_BASE_URL', 'DATUM_API_KEY'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  const optional = ['SLACK_BOT_TOKEN', 'SLACK_CHANNEL_ID'];
  const missingOptional = optional.filter((key) => !process.env[key]);
  if (missingOptional.length > 0) {
    console.log(`[MAIN] Warning: optional env vars not set: ${missingOptional.join(', ')}`);
  }
}

async function main() {
  console.log('[MAIN] WhatsApp Health Service v2 starting...');
  validateEnv();

  const config = await loadConfig();
  const cronExpr = minutesToCronExpression(config.cron_minutes);

  await createConnection();

  cron.schedule(cronExpr, () => {
    console.log('[CRON] Triggering health check cycle');
    runCycle();
  });

  console.log(`[MAIN] Scheduled: every ${config.cron_minutes} minutes (${cronExpr})`);
  console.log('[MAIN] Running first cycle now...');

  await runCycle();
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
