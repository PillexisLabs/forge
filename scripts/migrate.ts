import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from '../src/core/db';

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const schema = await readFile(schemaPath, 'utf8');
  const sql = getSql();

  try {
    await sql.unsafe(schema);
    console.log('Schema applied successfully.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error('Schema apply failed:', error);
  process.exit(1);
});
