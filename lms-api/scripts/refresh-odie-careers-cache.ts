import fs from 'node:fs';
import path from 'node:path';
import { fetchSourceDocuments, type SourceDescriptor } from '../src/domains/odie-careers/providers/source-fetch.js';

const descriptors: SourceDescriptor[] = [
  {
    providerKey: 'payscale_za_jobs',
    url: 'https://www.payscale.com/research/ZA/Job',
    notes: 'Primary salary landing page for cached South Africa salary normalization.',
  },
  {
    providerKey: 'eduvos_programmes',
    url: 'https://www.eduvos.com/programmes/',
    notes: 'Programme discovery page used to validate cached first-entry private institution courses.',
  },
  {
    providerKey: 'boston_programmes',
    url: 'https://www.boston.co.za/',
    notes: 'Boston City Campus landing page used as a resilient fallback source pointer.',
  },
  {
    providerKey: 'uwc_undergraduate',
    url: 'https://www.uwc.ac.za/study/all-areas-of-study',
    notes: 'Undergraduate programme catalogue for cached public university pathways.',
  },
  {
    providerKey: 'uct_undergraduate',
    url: 'https://www.uct.ac.za/students/undergraduate',
    notes: 'UCT undergraduate prospectus entry point for first-year programme verification.',
  },
  {
    providerKey: 'stellenbosch_undergraduate',
    url: 'https://www.sun.ac.za/english/study-at-sun/undergraduate',
    notes: 'Stellenbosch undergraduate page for first-entry programme verification.',
  },
  {
    providerKey: 'false_bay_courses',
    url: 'https://www.falsebaycollege.co.za/courses/',
    notes: 'False Bay College first-entry course discovery.',
  },
  {
    providerKey: 'northlink_courses',
    url: 'https://www.northlink.co.za/course-information/',
    notes: 'Northlink course page for normalized TVET first-year offerings.',
  },
  {
    providerKey: 'rosebank_programmes',
    url: 'https://www.rosebankcollege.co.za/qualifications/',
    notes: 'Rosebank College qualifications page for private institution pathways.',
  },
];

async function main() {
  const documents = await fetchSourceDocuments(descriptors);
  const outputPath = path.resolve(process.cwd(), 'data/odie-careers/sources.v1.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    version: '1.0.0',
    lastRunAt: new Date().toISOString(),
    documents,
  }, null, 2));
  process.stdout.write(`Wrote ${documents.length} source health records to ${outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
