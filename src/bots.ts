import { datumGet, COLLECTIONS } from './datum.js';
import type { Bot } from './types.js';

interface DatumBot {
  id: string;
  name: string;
  phone_number: string;
  provider_id: string;
  expand?: { provider_id?: { name: string } };
}

export async function fetchBots(): Promise<Bot[]> {
  const data = await datumGet<{ items: DatumBot[] }>(COLLECTIONS.BOTS, {
    filter: 'is_active=true',
    expand: 'provider_id',
    perPage: '500',
  });

  return data.items.map((bot) => ({
    id: bot.id,
    botName: bot.name,
    phoneNumber: bot.phone_number,
    provider: bot.expand?.provider_id?.name ?? null,
  }));
}
