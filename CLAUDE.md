# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Run with tsx (hot reload, dev)
npm run build        # tsc → dist/
npm start            # Run compiled dist/index.js (production)
npx tsc --noEmit     # Type-check without emitting
```

No test framework configured. Verify changes with `npx tsc --noEmit`.

## Architecture

WhatsApp bot health monitor. Sends test messages to bots via Baileys, measures response latency, classifies status, alerts Slack, persists metrics to Datum V2.

### Cycle flow (cycle.ts orchestrates)

1. Fetch active bots from Datum (`bots.ts`) + load config thresholds from Datum (`config.ts`)
2. Register `messages.upsert` listener **before** sending — fast bots may reply before all sends complete
3. Send randomized messages with 2-8s delays between each (`sender.ts`)
4. Capture responses, resolve LID→phone JIDs, measure latency (`receiver.ts`)
5. Classify: OK (≤5s) → SLOW (≤10s) → DOWN (timeout at 2× slow threshold)
6. Notify Slack main message + thread detail (`slack.ts`), save to Datum (`metrics.ts`)

### Key design decisions

- **Listener-before-send**: `waitForResponses()` starts before `sendToAll()` in cycle.ts:68-69. Both share the same `sendRecords` Map — sender populates it, receiver reads it.
- **LID resolution**: WhatsApp Business accounts respond from `@lid` JIDs instead of `@s.whatsapp.net`. Receiver does 3-step resolution: direct lookup → `getPNForLID()` → reverse `getLIDForPN()` scan.
- **Timeout**: `threshold_slow_seconds * 2 * 1000` ms. Non-responsive bots get status DOWN with null latency/respondedAt.
- **Console noise filter**: index.ts wraps console.* to suppress Baileys crypto noise (Bad MAC, Session error, etc).
- **Config is remote**: Thresholds load from Datum V2 `SERVICE_CONFIG` collection each cycle. Falls back to hardcoded defaults in config.ts.

### Data flow

`SendRecord` (sender.ts) → keyed by JID in shared Map → read by receiver.ts handler → produces `BotResult` → aggregated into `CycleResult` → consumed by slack.ts and metrics.ts.

### External services

- **Datum V2** (`datum.ts`): PocketBase-style REST API. Collections defined as constants in `COLLECTIONS`. Used for bot list, config, and metrics storage. All HTTP via native `fetch()`.
- **Slack Web API** (`slack.ts`): Direct `fetch()` to `chat.postMessage`. Posts main alert + threaded reply with per-bot timestamps and provider summary. Only posts when issues exist.
- **Baileys** (`connection.ts`): WhatsApp WebSocket client. Auth state persisted in `auth/` directory. Auto-reconnects on close except on logout.

## Environment

Required: `DATUM_BASE_URL`, `DATUM_API_KEY`
Optional: `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`

## Language

All user-facing strings (Slack messages, log templates in messages.ts) are in Spanish. Bot names and provider names come from Datum. Code comments and identifiers are English.

## Tech stack

TypeScript (strict, ES2022 target), ESM modules (`"type": "module"`), Node ≥20. No bundler — `tsc` compiles to `dist/`. All imports use `.js` extensions (ESM requirement). No test runner, no linter configured.
