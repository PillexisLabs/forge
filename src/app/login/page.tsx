'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      router.replace('/');
      router.refresh();
    } else {
      setError('Wrong password');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="forge-card w-full max-w-sm p-8"
      >
        <div className="mb-1 flex items-center gap-2">
          <Image className="rounded-md" src="/forge-logo.png" alt="" width={28} height={28} priority />
          <span className="text-sm font-semibold text-[var(--color-ink)]">Forge</span>
        </div>
        <p className="mb-6 mt-2 text-sm text-[var(--color-muted)]">Sign in to the Pillexis workspace.</p>
        <input
          className="sr-only"
          type="text"
          name="username"
          value="forge"
          autoComplete="username"
          readOnly
          tabIndex={-1}
          aria-hidden="true"
        />
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="forge-control w-full px-3 py-2.5 text-sm outline-none"
        />
        {error && <p className="mt-2 text-sm text-[var(--color-critical)]">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="forge-primary mt-4 w-full px-3 py-2.5 text-sm disabled:opacity-60"
        >
          {loading ? 'Checking…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
