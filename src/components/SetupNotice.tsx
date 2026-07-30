export default function SetupNotice({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <div className="forge-card p-8">
        <h1 className="text-lg font-semibold text-[var(--color-ink)]">Dashboard not ready yet</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Couldn&apos;t read from the database. Make sure you&apos;ve created the tables
          (<code className="text-[var(--color-ink-2)]">db/schema.sql</code>), set{' '}
          <code className="text-[var(--color-ink-2)]">DATABASE_URL</code>, and run a sync.
        </p>
        <pre className="forge-subtle-card mt-4 overflow-auto p-3 text-xs text-[var(--color-critical)]">
          {message}
        </pre>
        <p className="mt-4 text-sm text-[var(--color-muted)]">
          See <code className="text-[var(--color-ink-2)]">README.md</code> for the full setup steps.
        </p>
      </div>
    </main>
  );
}
