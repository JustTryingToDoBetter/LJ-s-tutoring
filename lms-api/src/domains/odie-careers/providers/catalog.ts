import type { CachedSourceDocument } from '../types.js';
import type { SourceDescriptor } from './source-fetch.js';

export const ODIE_CAREERS_SOURCE_CATALOG: SourceDescriptor[] = [
  {
    providerKey: 'payscale_za_jobs',
    label: 'Payscale South Africa job index',
    area: 'salary',
    url: 'https://www.payscale.com/research/ZA/Job',
    notes: 'Primary salary landing page used to validate cached South Africa salary snapshots.',
  },
  {
    providerKey: 'eduvos_programmes',
    label: 'Eduvos programme catalogue',
    area: 'institution',
    url: 'https://www.eduvos.com/programmes/',
    notes: 'Programme discovery page used to verify cached first-entry private institution options.',
  },
  {
    providerKey: 'boston_programmes',
    label: 'Boston City Campus qualification pages',
    area: 'institution',
    url: 'https://www.boston.co.za/',
    notes: 'Qualification landing pages used to verify Boston City Campus / Boston College first-entry pathways.',
  },
  {
    providerKey: 'uwc_undergraduate',
    label: 'UWC undergraduate study catalogue',
    area: 'institution',
    url: 'https://www.uwc.ac.za/study/all-areas-of-study',
    notes: 'Public undergraduate catalogue used for UWC first-year programme normalization.',
  },
  {
    providerKey: 'uct_undergraduate',
    label: 'UCT undergraduate entry pages',
    area: 'institution',
    url: 'https://www.uct.ac.za/students/undergraduate',
    notes: 'UCT undergraduate entry pages and faculty references used for first-entry pathway normalization.',
  },
  {
    providerKey: 'stellenbosch_undergraduate',
    label: 'Stellenbosch undergraduate pages',
    area: 'institution',
    url: 'https://www.sun.ac.za/english/study-at-sun/undergraduate',
    notes: 'Undergraduate landing page used to validate Stellenbosch first-entry routes.',
  },
  {
    providerKey: 'false_bay_courses',
    label: 'False Bay College course pages',
    area: 'institution',
    url: 'https://falsebaycollege.co.za/courses/',
    notes: 'Public course pages used to verify first-entry TVET pathways.',
  },
  {
    providerKey: 'northlink_courses',
    label: 'Northlink College course information',
    area: 'institution',
    url: 'https://www.northlink.co.za/course-information/',
    notes: 'Northlink course information used to verify first-entry college pathways.',
  },
  {
    providerKey: 'rosebank_programmes',
    label: 'Rosebank College qualification pages',
    area: 'institution',
    url: 'https://www.rosebankcollege.co.za/qualifications/',
    notes: 'Qualification landing pages used for Rosebank College first-entry normalization.',
  },
];

export function buildFallbackSourceDocuments(now = new Date().toISOString()): CachedSourceDocument[] {
  return ODIE_CAREERS_SOURCE_CATALOG.map((descriptor) => ({
    providerKey: descriptor.providerKey,
    label: descriptor.label,
    area: descriptor.area,
    url: descriptor.url,
    fetchedAt: now,
    status: 'fallback',
    notes: `${descriptor.notes} Cached normalized Odie Careers data remains active until a refresh succeeds.`,
  }));
}
