import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override: false });
  }
}

export function loadRuntimeEnv() {
  const packageRoot = process.cwd();
  loadEnvFile(path.resolve(packageRoot, '..', '.env'));
  loadEnvFile(path.resolve(packageRoot, '.env'));
}

export function assertRuntimeEnv() {
  const isTest = process.env.NODE_ENV === 'test';
  const required = isTest
    ? ['DATABASE_URL_TEST', 'COOKIE_SECRET', 'JWT_SECRET']
    : ['DATABASE_URL', 'COOKIE_SECRET', 'JWT_SECRET'];

  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length === 0) {
    return;
  }

  throw new Error(
    `Missing required environment variables: ${missing.join(', ')}. Copy .env.example to .env and set the values before starting the API.`,
  );
}