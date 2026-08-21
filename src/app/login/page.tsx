'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (res.ok) {
      router.replace('/');
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? 'Invalid email or password');
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
          type="email"
          autoComplete="username"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="forge-control w-full px-3 py-2.5 text-sm outline-none"
        />
        <div className="relative mt-3">
          <input
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="forge-control w-full px-3 py-2.5 pr-10 text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            title={showPassword ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[var(--color-faint)] hover:text-[var(--color-ink)]"
          >
            {showPassword ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
                <path d="m4 4 16 16" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
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
