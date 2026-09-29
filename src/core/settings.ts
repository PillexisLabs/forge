import { getSql } from './db';

// Settings a user changes in the app. Each key has a code default, so a
// fresh instance works before anyone opens Settings.

export async function getSettings<T extends Record<string, unknown>>(key: string, defaults: T): Promise<T> {
  const sql = getSql();
  const rows = await sql<{ value: Partial<T> }[]>`select value from settings where key = ${key}`;
  return { ...defaults, ...(rows[0]?.value ?? {}) };
}

export async function saveSettings(key: string, value: Record<string, unknown>, actorName: string): Promise<void> {
  const sql = getSql();
  await sql`
    insert into settings (key, value, updated_by, updated_at)
    values (${key}, ${sql.json(value as never)}, ${actorName}, now())
    on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()
  `;
}
