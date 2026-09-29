import AccessNotice from '@/components/AccessNotice';
import AppearanceForm from '@/components/settings/AppearanceForm';
import { getAppearance } from '@/core/appearance';
import { hasPermission } from '@/core/permissions';
import { getSessionUserFromCookies } from '@/core/session';

export const dynamic = 'force-dynamic';

export default async function AppearancePage() {
  const user = await getSessionUserFromCookies();
  if (!user || !hasPermission(user, 'core:config')) return <AccessNotice area="Settings" />;
  return (
    <main className="lf-page">
      <div className="lf-settings">
        <h1>Appearance</h1>
        <p>The brand color and text size for everyone in this workspace.</p>
        <AppearanceForm appearance={await getAppearance()} />
      </div>
    </main>
  );
}
