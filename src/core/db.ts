import postgres from 'postgres';
import { env } from './env';

// Lazy singleton. Created on first query, not at import, so module evaluation
// during `next build` doesn't require DATABASE_URL.
let _sql: ReturnType<typeof postgres> | undefined;

declare global {
  // eslint-disable-next-line no-var
  var __ma_sql: ReturnType<typeof postgres> | undefined;
}

export function getSql() {
  if (global.__ma_sql) return global.__ma_sql;
  if (!_sql) {
    _sql = postgres(env.databaseUrl(), {
      ssl: env.databaseSsl(),
      prepare: false, // required for Supabase's transaction pooler
      max: 3,
    });
    if (process.env.NODE_ENV !== 'production') global.__ma_sql = _sql;
  }
  return _sql;
}
