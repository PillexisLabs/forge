import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const envPath = path.join(process.cwd(), '.env');

if (existsSync(envPath)) {
  await import('node:process').then(({ loadEnvFile }) => loadEnvFile(envPath));
}
