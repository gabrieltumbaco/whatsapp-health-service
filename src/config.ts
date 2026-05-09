import { datumGet, COLLECTIONS } from './datum.js';
import type { Config } from './types.js';

const DEFAULTS: Config = {
  threshold_ok_seconds: 5,
  threshold_slow_seconds: 10,
  slow_alert_min_percentage: 25,
  critical_down_percentage: 50,
  dashboard_url: 'https://tooling.jelou.dev/whatsapp-health',
  cron_minutes: 120,
};

export async function loadConfig(): Promise<Config> {
  try {
    const data = await datumGet<{ items: Array<Record<string, unknown>> }>(
      COLLECTIONS.SERVICE_CONFIG,
      { page: '1', perPage: '1' }
    );

    const record = data.items?.[0];
    if (!record) return DEFAULTS;

    return {
      threshold_ok_seconds: Number(record.threshold_ok_seconds) || DEFAULTS.threshold_ok_seconds,
      threshold_slow_seconds: Number(record.threshold_slow_seconds) || DEFAULTS.threshold_slow_seconds,
      slow_alert_min_percentage: Number(record.slow_alert_min_percentage) || DEFAULTS.slow_alert_min_percentage,
      critical_down_percentage: Number(record.critical_down_percentage) || DEFAULTS.critical_down_percentage,
      dashboard_url: String(record.dashboard_url || DEFAULTS.dashboard_url),
      cron_minutes: Number(record.cron_minutes) || DEFAULTS.cron_minutes,
    };
  } catch (err) {
    console.log('[CONFIG] Failed to load from Datum, using defaults:', (err as Error).message);
    return DEFAULTS;
  }
}
