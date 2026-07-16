export default function SetupNotice({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <div className="rounded-xl border border-gray-200 bg-white p-8 dark:border-white/10 dark:bg-[#141417]">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Dashboard not ready yet</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Couldn&apos;t read from the database. Make sure you&apos;ve created the tables
          (<code className="text-gray-700 dark:text-gray-300">db/schema.sql</code>), set{' '}
          <code className="text-gray-700 dark:text-gray-300">DATABASE_URL</code>, and run a sync.
        </p>
        <pre className="mt-4 overflow-auto rounded-lg bg-gray-100 p-3 text-xs text-rose-600 dark:bg-[#0a0a0a] dark:text-[#FF8A8A]">
          {message}
        </pre>
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          See <code className="text-gray-700 dark:text-gray-300">README.md</code> for the full setup steps.
        </p>
      </div>
    </main>
  );
}
