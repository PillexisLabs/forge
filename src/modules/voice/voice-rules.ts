// Pure decision logic for the voice module — no database, no providers —
// so eligibility and the calling window are unit-testable.

export type VoiceCallStatus = 'queued' | 'dialing' | 'in_progress' | 'completed' | 'failed' | 'skipped';

export type CallCandidate = {
  phone: string | null;
  /** From the WhatsApp step — the only consent source (plans/PLATFORM.md section 8). */
  consentStatus: 'unknown' | 'granted' | 'opted_out';
};

/**
 * Compliance gate: call only leads who gave consent in the WhatsApp step,
 * and never without a number. TRAI/DND window checks happen separately.
 */
export function callEligibility(candidate: CallCandidate):
  | { eligible: true }
  | { eligible: false; reason: string } {
  if (candidate.consentStatus === 'opted_out') return { eligible: false, reason: 'opted_out' };
  if (candidate.consentStatus !== 'granted') return { eligible: false, reason: 'no_consent' };
  if (!candidate.phone?.trim()) return { eligible: false, reason: 'no_phone' };
  return { eligible: true };
}

export type CallWindow = { startHour: number; endHour: number };

/** Parse "10-19" (IST hours). Falls back to 10:00–19:00 on nonsense. */
export function parseCallWindow(value: string | undefined): CallWindow {
  const match = /^(\d{1,2})-(\d{1,2})$/.exec(value?.trim() ?? '');
  if (match) {
    const startHour = Number(match[1]);
    const endHour = Number(match[2]);
    if (startHour >= 0 && startHour < endHour && endHour <= 24) return { startHour, endHour };
  }
  return { startHour: 10, endHour: 19 };
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istParts(now: Date): { hour: number; dayStartUtcMs: number } {
  const istMs = now.getTime() + IST_OFFSET_MS;
  const msIntoDay = istMs % 86_400_000;
  return { hour: msIntoDay / 3_600_000, dayStartUtcMs: now.getTime() - msIntoDay };
}

export function isInsideCallWindow(now: Date, window: CallWindow): boolean {
  const { hour } = istParts(now);
  return hour >= window.startHour && hour < window.endHour;
}

/** The next moment calling becomes allowed: now, or today's/tomorrow's window start (IST). */
export function nextCallTime(now: Date, window: CallWindow): Date {
  if (isInsideCallWindow(now, window)) return now;
  const { hour, dayStartUtcMs } = istParts(now);
  const startMs = dayStartUtcMs + window.startHour * 3_600_000;
  return new Date(hour < window.startHour ? startMs : startMs + 86_400_000);
}
