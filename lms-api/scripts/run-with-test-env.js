import { spawn } from 'node:child_process';

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('Usage: node scripts/run-with-test-env.js <command> [args...]');
  process.exit(1);
}

const testDatabaseUrl = process.env.DATABASE_URL_TEST?.trim();
if (!testDatabaseUrl) {
  console.error('DATABASE_URL_TEST is required for test commands');
  process.exit(1);
}

const child = spawn(command, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: testDatabaseUrl,
  },
  shell: true,
});

child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});