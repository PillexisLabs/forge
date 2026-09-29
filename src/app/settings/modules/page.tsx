import AccessNotice from '@/components/AccessNotice';
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
      <div className="lf-settings">
        <h1>Modules</h1>
        <p>Choose what this workspace shows. Changes apply at once, with no restart. Switched-off modules keep their data and keep receiving messages.</p>
        <ModulesForm modules={modules} />
      </div>
    </main>
  );
}
