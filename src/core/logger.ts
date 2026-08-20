// Tiny structured logger. Emits one JSON line per event with an ISO timestamp
// and level, so launchd's log files (logs/sync.log, logs/server.log) stay
// greppable and nothing fails silently.

type Level = 'info' | 'warn' | 'error';

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(meta ?? {}) });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, meta),
  error: (msg: string, err?: unknown, meta?: Record<string, unknown>) =>
    emit('error', msg, {
      ...(meta ?? {}),
      error: err instanceof Error ? err.message : err != null ? String(err) : undefined,
      stack: err instanceof Error ? err.stack : undefined,
    }),
};
