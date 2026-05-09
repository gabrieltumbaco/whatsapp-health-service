const BASE_URL = process.env.DATUM_BASE_URL!;
const API_KEY = process.env.DATUMV2_API_KEY!;

export const COLLECTIONS = {
  BOTS: 'pbc_1454544717',
  MONITORING_CYCLES: 'pbc_4232756060',
  BOT_HEALTH_METRICS: 'pbc_3851449081',
  SERVICE_CONFIG: 'pbc_152754480',
} as const;

const headers = {
  'Content-Type': 'application/json',
  'x-api-key': API_KEY,
};

export async function datumGet<T = any>(
  collectionId: string,
  params?: Record<string, string>
): Promise<T> {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  const url = `${BASE_URL}/api/collections/${collectionId}/records${query}`;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Datum GET ${res.status}: ${res.statusText}`);
  return res.json() as T;
}

export async function datumCreate<T = any>(
  collectionId: string,
  data: Record<string, unknown>
): Promise<T> {
  const url = `${BASE_URL}/api/collections/${collectionId}/records`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Datum POST ${res.status}: ${res.statusText}`);
  return res.json() as T;
}

export async function datumBatch(
  requests: Array<{ method: string; url: string; body?: Record<string, unknown> }>
): Promise<unknown> {
  const url = `${BASE_URL}/api/batch`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) throw new Error(`Datum BATCH ${res.status}: ${res.statusText}`);
  return res.json();
}
