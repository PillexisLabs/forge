import { redirect } from 'next/navigation';

// /settings opens the first settings page.
export default function SettingsIndex() {
  redirect('/settings/integrations');
}
