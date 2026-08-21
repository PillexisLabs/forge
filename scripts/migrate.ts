import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from '../src/core/db';

// Applies db/migrations/*.sql in filename order, once each, and records every
// applied file in schema_migrations.
//
// Why this replaced the old runner: it read one db/schema.sql of
// `create table if not exists` statements and re-ran the whole file. Against a
// database where the tables already exist that is a no-op, so an ALTER could
// never ship — editing a column or a check constraint changed the file, printed
// success, and did nothing. Every schema change now gets its own numbered file
// that runs exactly once.
//
// 0001_initial_schema.sql is the previous schema.sql verbatim. It is entirely
// `if not exists`, so it creates everything on a fresh database and no-ops on
// the existing staging and production databases — they adopt the runner by
// recording 0001 as applied without a row changing.
//
//   npm run db:migrate              apply everything pending
//   npm run db:migrate -- --dry-run list what would run, change nothing

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');

// Arbitrary but stable. Railway runs db:migrate as a pre-deploy step and
// retries failed deploys, so two runners can overlap; they serialise on this
// lock instead of racing the same file. A crashed runner drops its connection
// and Postgres releases the lock for us.
const ADVISORY_LOCK_KEY = 4027301985;

// Postgres cannot run every statement inside a transaction — CREATE INDEX
// CONCURRENTLY and ALTER TYPE ... ADD VALUE are the ones we are likely to want.
// A file may opt out with this directive on its own line. It then applies
// without a transaction: if it fails halfway the database is left partially
// migrated and the file is NOT recorded, so it must be repaired by hand.
const NO_TRANSACTION = /^--\s*forge:no-transaction\s*$/m;

const FILENAME_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;

export type PendingMigration = {
  filename: string;
  body: string;
  checksum: string;
  inTransaction: boolean;
};

/** Line endings are normalised so the same file checksums alike on any machine. */
export function checksumOf(body: string): string {
  return createHash('sha256').update(body.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
}

/**
 * Validate and order the migration filenames.
 *
 * Ordering is lexicographic, which equals numeric ordering because the prefix
 * is zero-padded to four digits. Both checks below fail the run rather than
 * skipping quietly: a misnamed file that is silently ignored is the same class
 * of bug this runner exists to remove, and a duplicated sequence number is the
 * usual result of two branches both adding "the next" migration.
 */
export function orderMigrations(filenames: string[]): string[] {
  const candidates = filenames.filter((name) => name.endsWith('.sql'));

  const malformed = candidates.filter((name) => !FILENAME_PATTERN.test(name));
  if (malformed.length) {
    throw new Error(
      `Migration files must be named NNNN_lower_snake_case.sql. Rename: ${malformed.sort().join(', ')}`,
    );
  }

  const bySequence = new Map<string, string>();
  for (const name of candidates.slice().sort()) {
    const sequence = name.slice(0, 4);
    const existing = bySequence.get(sequence);
    if (existing) {
      throw new Error(
        `Two migrations share sequence ${sequence}: ${existing} and ${name}. `
        + 'Renumber the later one to the next free sequence.',
      );
    }
    bySequence.set(sequence, name);
  }

  return candidates.slice().sort();
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const filenames = orderMigrations(await readdir(MIGRATIONS_DIR));
  const sql = getSql();

  try {
    // The lock is taken before the tracking table is created so two first-time
    // runners cannot both try to create it. `if not exists` would make that
    // race harmless anyway, but it also makes postgres emit a NOTICE that the
    // driver prints on every subsequent run — checking first keeps the deploy
    // log clean.
    await sql`select pg_advisory_lock(${ADVISORY_LOCK_KEY})`;
    try {
      const [tracking] = await sql<{ present: boolean }[]>`
        select to_regclass('public.schema_migrations') is not null as present
      `;
      if (!tracking.present) {
        await sql`
          create table schema_migrations (
            filename    text primary key,
            checksum    text        not null,
            applied_at  timestamptz not null default now(),
            duration_ms integer
          )
        `;
      }

      const rows = await sql<{ filename: string; checksum: string }[]>`
        select filename, checksum from schema_migrations
      `;
      const applied = new Map(rows.map((row) => [row.filename, row.checksum]));

      const pending: PendingMigration[] = [];
      for (const filename of filenames) {
        const body = await readFile(path.join(MIGRATIONS_DIR, filename), 'utf8');
        const checksum = checksumOf(body);
        const previous = applied.get(filename);

        if (previous === undefined) {
          pending.push({ filename, body, checksum, inTransaction: !NO_TRANSACTION.test(body) });
          continue;
        }
        // An applied migration is history. Editing one means the databases that
        // already ran it and the ones that have not will end up different.
        if (previous !== checksum) {
          throw new Error(
            `${filename} changed after it was applied (recorded ${previous}, now ${checksum}). `
            + 'Applied migrations are immutable — revert the edit and add a new migration instead.',
          );
        }
      }

      // A recorded file that no longer exists usually means a branch was checked
      // out backwards. Warn rather than fail: the database is ahead, not broken.
      for (const filename of applied.keys()) {
        if (!filenames.includes(filename)) {
          console.warn(`warning: ${filename} is recorded as applied but is not in db/migrations/`);
        }
      }

      if (!pending.length) {
        console.log(`Schema up to date — ${applied.size} migration(s) already applied.`);
        return;
      }

      if (dryRun) {
        console.log(`${pending.length} migration(s) pending:`);
        for (const migration of pending) {
          console.log(`  ${migration.filename}${migration.inTransaction ? '' : '  (no transaction)'}`);
        }
        return;
      }

      for (const migration of pending) {
        const startedAt = Date.now();
        if (migration.inTransaction) {
          await sql.begin(async (tx) => {
            await tx.unsafe(migration.body);
            await tx`
              insert into schema_migrations (filename, checksum, duration_ms)
              values (${migration.filename}, ${migration.checksum}, ${Date.now() - startedAt})
            `;
          });
        } else {
          await sql.unsafe(migration.body);
          await sql`
            insert into schema_migrations (filename, checksum, duration_ms)
            values (${migration.filename}, ${migration.checksum}, ${Date.now() - startedAt})
          `;
        }
        console.log(`applied ${migration.filename} (${Date.now() - startedAt}ms)`);
      }

      console.log(`Applied ${pending.length} migration(s).`);
    } finally {
      await sql`select pg_advisory_unlock(${ADVISORY_LOCK_KEY})`;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Guard so the pure helpers above can be imported by tests without connecting.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error('Migration failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
