'use client';

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
        className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 dark:border-white/10 dark:bg-[#141417]"
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#FF6363] shadow-[0_0_12px_rgba(255,99,99,0.5)]" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Pillexis Analytics</span>
        </div>
        <p className="mb-6 text-sm text-gray-500">Enter the dashboard password.</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-[#FF6363]/60 dark:border-white/10 dark:bg-[#0a0a0a] dark:text-white"
        />
        {error && <p className="mt-2 text-sm text-[#FF6363]">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-4 w-full rounded-lg bg-[#FF6363] px-3 py-2.5 text-sm font-medium text-white transition hover:bg-[#FF4D4D] disabled:opacity-60"
        >
          {loading ? 'Checking…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
