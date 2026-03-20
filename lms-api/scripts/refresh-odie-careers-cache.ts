import fs from 'node:fs';
import path from 'node:path';
import { buildFallbackSourceDocuments, ODIE_CAREERS_SOURCE_CATALOG } from '../src/domains/odie-careers/providers/catalog.js';
import { fetchSourceDocuments } from '../src/domains/odie-careers/providers/source-fetch.js';

const shouldFetchLiveSources = process.env.ODIE_CAREERS_ENABLE_NETWORK_REFRESH === 'true';

async function main() {
  const now = new Date().toISOString();
  const documents = shouldFetchLiveSources
    ? await fetchSourceDocuments(ODIE_CAREERS_SOURCE_CATALOG)
    : buildFallbackSourceDocuments(now);

  const outputPath = path.resolve(process.cwd(), 'data/odie-careers/sources.v1.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    version: '1.0.0',
    lastRunAt: now,
    documents,
  }, null, 2));

  const mode = shouldFetchLiveSources ? 'live refresh' : 'fallback refresh';
  process.stdout.write(`Wrote ${documents.length} Odie Careers source records (${mode}) to ${outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
