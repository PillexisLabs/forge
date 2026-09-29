'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

// POST JSON to an API route, then refresh the server-rendered page.
export function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function post<T = Record<string, unknown>>(key: string, url: string, body: unknown): Promise<T | null> {
    setBusy(key);
    setError(null);
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? 'That did not work. Try again.');
        return null;
      }
      router.refresh();
      return data as T;
    } catch {
      setError('The network request failed. Check the connection and try again.');
      return null;
    } finally {
      setBusy(null);
    }
  }

  return { post, busy, error, setError };
}
