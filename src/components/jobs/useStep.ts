'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

// Runs one step through the step API, then refreshes the server-rendered
// page so the case, the buttons and the timeline all show the new state.
export function useStep(job: string, caseId: number, version: number) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(step: string, input: Record<string, unknown> = {}): Promise<boolean> {
    setPending(step);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${job}/cases/${caseId}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step, input, version }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? 'The step failed. Try again.');
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError('The network request failed. Check the connection and try again.');
      return false;
    } finally {
      setPending(null);
    }
  }

  return { run, pending, error };
}
