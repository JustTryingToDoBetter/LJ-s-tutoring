import { spawn } from 'node:child_process';

function runPrisma(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('prisma', args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code: code ?? 1, output });
    });
  });
}

function getFailedMigrations(logOutput) {
  const regex = /The [`"]([^`"]+)[`"] migration.*failed/gi;
  const names = new Set();
  let match;
  while ((match = regex.exec(logOutput)) !== null) {
    names.add(match[1]);
  }
  return [...names];
}

async function main() {
  const first = await runPrisma(['migrate', 'deploy']);
  if (first.code === 0) {
    process.exit(0);
  }

  const hasP3009 = /P3009/.test(first.output);
  if (!hasP3009) {
    process.exit(first.code || 1);
  }

  const failedMigrations = getFailedMigrations(first.output);
  if (failedMigrations.length === 0) {
    console.error('Detected P3009 but could not determine failed migration names automatically.');
    process.exit(first.code || 1);
  }

  const allowList = new Set(
    (process.env.PRISMA_AUTO_RESOLVE_MIGRATIONS ?? '20260205_audit_log')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  );

  const disallowed = failedMigrations.filter((name) => !allowList.has(name));
  if (disallowed.length > 0) {
    console.error(
      `Detected failed migrations not in PRISMA_AUTO_RESOLVE_MIGRATIONS: ${disallowed.join(', ')}`,
    );
    process.exit(first.code || 1);
  }

  for (const migrationName of failedMigrations) {
    console.log(`Resolving failed migration as rolled back: ${migrationName}`);
    const resolved = await runPrisma(['migrate', 'resolve', '--rolled-back', migrationName]);
    if (resolved.code !== 0) {
      process.exit(resolved.code || 1);
    }
  }

  console.log('Retrying prisma migrate deploy after resolve...');
  const second = await runPrisma(['migrate', 'deploy']);
  process.exit(second.code || 0);
}

main().catch((error) => {
  console.error('prisma-migrate-safe failed:', error);
  process.exit(1);
});
