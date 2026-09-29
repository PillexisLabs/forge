import AccessNotice from '@/components/AccessNotice';
import SettingsHeader from '@/components/settings/SettingsHeader';
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
      <div className="st">
        <SettingsHeader title="Appearance" description="The brand color and text size for everyone in this workspace." />
        <AppearanceForm appearance={await getAppearance()} />
      </div>
    </main>
  );
}
