export interface Bot {
  id: string;
  botName: string;
  phoneNumber: string;
  provider: string | null;
}

export type BotStatus = 'OK' | 'SLOW' | 'DOWN';

export interface BotResult {
  bot: Bot;
  status: BotStatus;
  latencyMs: number | null;
  sentAt: number | null;
  respondedAt: number | null;
}

export interface CycleResult {
  startedAt: string;
  finishedAt: string;
  results: BotResult[];
  ok: BotResult[];
  slow: BotResult[];
  down: BotResult[];
  avgLatencyMs: number | null;
}

export interface Config {
  threshold_ok_seconds: number;
  threshold_slow_seconds: number;
  slow_alert_min_percentage: number;
  critical_down_percentage: number;
  dashboard_url: string;
  cron_minutes: number;
}
