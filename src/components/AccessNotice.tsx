// Rendered when a signed-in user opens an area their role or module
// allowlist does not include. Hiding nav entries is a convenience; this,
// plus the API route guards, is the boundary.
export default function AccessNotice({ area }: { area: string }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <div className="forge-card p-8">
        <h1 className="text-lg font-semibold text-[var(--color-ink)]">No access to {area}</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Your account does not include this area. Ask an admin to change your
          role or module access if you need it.
        </p>
      </div>
    </main>
  );
}
