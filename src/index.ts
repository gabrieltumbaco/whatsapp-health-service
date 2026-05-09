import 'dotenv/config';
import cron from 'node-cron';
import { createConnection } from './connection.js';
import { runCycle } from './cycle.js';

async function main() {
  console.log('[MAIN] WhatsApp Health Service v2 starting...');

  const sock = await createConnection();

  cron.schedule('*/30 * * * *', () => {
    console.log('[CRON] Triggering health check cycle');
    runCycle(sock);
  });

  console.log('[MAIN] Scheduled: every 30 minutes');
  console.log('[MAIN] Running first cycle now...');

  await runCycle(sock);
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
