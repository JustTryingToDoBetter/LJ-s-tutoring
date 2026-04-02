import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAssistantConfig } from '../domains/assistant/config.js';

function loadEnvFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override: false });
  }
}

export function loadRuntimeEnv() {
  // Resolve env files from this module's location so loading is stable even when cwd differs.
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(moduleDir, '..', '..');
  const repoRoot = path.resolve(packageRoot, '..');

  loadEnvFile(path.resolve(repoRoot, '.env.local'));
  loadEnvFile(path.resolve(repoRoot, '.env'));
  loadEnvFile(path.resolve(packageRoot, '.env.local'));
  loadEnvFile(path.resolve(packageRoot, '.env'));
}

export function assertRuntimeEnv() {
  const isTest = process.env.NODE_ENV === 'test';
  const required = isTest
    ? ['DATABASE_URL_TEST', 'COOKIE_SECRET', 'JWT_SECRET']
    : ['DATABASE_URL', 'COOKIE_SECRET', 'JWT_SECRET'];

  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length === 0) {
    loadAssistantConfig(process.env);
    return;
  }

  throw new Error(
    `Missing required environment variables: ${missing.join(', ')}. Copy .env.example to .env (or .env.local) and set the values before starting the API.`,
  );
}