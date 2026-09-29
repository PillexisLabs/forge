'use client';

import { UiButton } from '@/components/ui/Core';

export default function PrintButton() {
  return <UiButton variant="primary" onClick={() => window.print()}>Save as PDF</UiButton>;
}
