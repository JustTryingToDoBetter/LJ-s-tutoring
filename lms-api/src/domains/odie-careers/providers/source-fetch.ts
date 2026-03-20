import type { CachedSourceDocument } from '../types.js';

export interface SourceDescriptor {
  providerKey: string;
  url: string;
  notes: string;
}

const DEFAULT_DELAY_MS = Number(process.env.ODIE_CAREERS_FETCH_DELAY_MS ?? 500);
const DEFAULT_TIMEOUT_MS = Number(process.env.ODIE_CAREERS_FETCH_TIMEOUT_MS ?? 8000);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchSourceDocuments(descriptors: SourceDescriptor[]): Promise<CachedSourceDocument[]> {
  const output: CachedSourceDocument[] = [];

  for (const descriptor of descriptors) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(descriptor.url, {
        headers: {
          'user-agent': 'OdieCareersBot/1.0 (+https://projectodysseus.local)'
        },
        signal: controller.signal,
      });

      output.push({
        providerKey: descriptor.providerKey,
        url: descriptor.url,
        fetchedAt: new Date().toISOString(),
        status: response.ok ? 'ok' : 'fallback',
        statusCode: response.status,
        notes: response.ok ? descriptor.notes : `HTTP ${response.status}; using cached normalized dataset.`,
      });
    } catch (error) {
      output.push({
        providerKey: descriptor.providerKey,
        url: descriptor.url,
        fetchedAt: new Date().toISOString(),
        status: 'fallback',
        notes: `Fetch failed (${error instanceof Error ? error.message : 'unknown_error'}); using cached normalized dataset.`,
      });
    } finally {
      clearTimeout(timeout);
    }

    await sleep(DEFAULT_DELAY_MS);
  }

  return output;
}
