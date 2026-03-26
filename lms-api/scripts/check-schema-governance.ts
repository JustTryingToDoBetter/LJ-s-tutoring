import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const root = path.resolve(dirname, '..');
const migrationsDir = path.join(root, 'prisma', 'migrations');

const riskyPatterns: Array<{ name: string; pattern: RegExp }> = [
  { name: 'DROP TABLE', pattern: /\bdrop\s+table\b/i },
  { name: 'DROP COLUMN', pattern: /\bdrop\s+column\b/i },
  { name: 'TRUNCATE', pattern: /\btruncate\b/i },
  { name: 'DROP SCHEMA', pattern: /\bdrop\s+schema\b/i },
  { name: 'ALTER TYPE', pattern: /\balter\s+type\b/i },
];

const legacyAllowList = new Set([
  path.join('prisma', 'migrations', '20260216_phase1_academic_os', 'migration.sql'),
]);

function readMigrationFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dir, entry.name, 'migration.sql'))
    .filter((filePath) => fs.existsSync(filePath));
}

function hasSafetyOverride(text: string) {
  return /SAFETY_OVERRIDE/i.test(text);
}

function main() {
  const migrationFiles = readMigrationFiles(migrationsDir);
  const violations: Array<{ file: string; risks: string[] }> = [];

  for (const filePath of migrationFiles) {
    const text = fs.readFileSync(filePath, 'utf8');
    const relative = path.relative(root, filePath);
    if (legacyAllowList.has(relative)) {
      continue;
    }
    const risks = riskyPatterns
      .filter((risk) => risk.pattern.test(text))
      .map((risk) => risk.name);

    if (risks.length > 0 && !hasSafetyOverride(text)) {
      violations.push({ file: relative, risks });
    }
  }

  if (violations.length > 0) {
    console.error('Schema governance check failed. Risky DDL detected without SAFETY_OVERRIDE comment:');
    for (const violation of violations) {
      console.error(`- ${violation.file}: ${violation.risks.join(', ')}`);
    }
    process.exit(1);
  }

  console.log(`Schema governance check passed for ${migrationFiles.length} migration files.`);
}

main();
