import AccessNotice from '@/components/AccessNotice';
import SettingsHeader from '@/components/settings/SettingsHeader';
import ModulesForm from '@/components/settings/ModulesForm';
import { enabledModuleNames, switchedOffModules } from '@/core/modules';
import { hasPermission } from '@/core/permissions';
import { getSessionUserFromCookies } from '@/core/session';
import { MODULES } from '@/modules/registry';

export const dynamic = 'force-dynamic';

export default async function ModulesPage() {
  const user = await getSessionUserFromCookies();
  if (!user || !hasPermission(user, 'core:config')) return <AccessNotice area="Settings" />;
  const installed = enabledModuleNames() ?? MODULES.map((mod) => mod.name);
  const off = await switchedOffModules();
  const modules = MODULES.filter((mod) => installed.includes(mod.name)).map((mod) => ({
    name: mod.name,
    label: mod.navLabel ?? mod.name.charAt(0).toUpperCase() + mod.name.slice(1),
    description: mod.description,
    hasScreens: mod.nav.length > 0,
    on: !off.includes(mod.name),
  }));
  return (
    <main className="lf-page">
      <div className="st">
        <SettingsHeader title="Modules" description="Choose what this workspace shows, with no restart. Use a preset, or switch modules one by one and save." />
        <ModulesForm modules={modules} />
      </div>
    </main>
  );
}
