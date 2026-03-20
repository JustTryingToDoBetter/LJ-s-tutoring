import fs from 'node:fs';
import path from 'node:path';
import type { CareerRecord, CourseRecord, InstitutionRecord, CachedSourceDocument } from './types.js';

interface CareerDataset {
  version: string;
  careers: CareerRecord[];
}

interface CourseDataset {
  version: string;
  institutions: InstitutionRecord[];
  courses: CourseRecord[];
  supportedSubjects: string[];
}

interface SourceManifest {
  version: string;
  lastRunAt: string;
  documents: CachedSourceDocument[];
}

function repoDataPath(fileName: string) {
  const fromCwd = path.resolve(process.cwd(), 'data/odie-careers', fileName);
  if (fs.existsSync(fromCwd)) return fromCwd;
  const fromRepoRoot = path.resolve(process.cwd(), '../data/odie-careers', fileName);
  if (fs.existsSync(fromRepoRoot)) return fromRepoRoot;
  throw new Error(`odie_careers_dataset_missing:${fileName}`);
}

function readJsonFile<T>(fileName: string): T {
  const raw = fs.readFileSync(repoDataPath(fileName), 'utf-8');
  return JSON.parse(raw) as T;
}

let careersCache: CareerDataset | null = null;
let coursesCache: CourseDataset | null = null;
let sourceManifestCache: SourceManifest | null = null;

export function loadCareerDataset() {
  careersCache ??= readJsonFile<CareerDataset>('careers.v1.json');
  return careersCache;
}

export function loadCourseDataset() {
  coursesCache ??= readJsonFile<CourseDataset>('courses.v1.json');
  return coursesCache;
}

export function loadSourceManifest() {
  sourceManifestCache ??= readJsonFile<SourceManifest>('sources.v1.json');
  return sourceManifestCache;
}
