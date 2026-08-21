import AccessNotice from '@/components/AccessNotice';
import UsersAdmin from '@/components/settings/UsersAdmin';
import { hasPermission } from '@/core/permissions';
import { getSessionUserFromCookies } from '@/core/session';
import { listUsers } from '@/core/users';
import { MODULES } from '@/modules/registry';

export const dynamic = 'force-dynamic';

export default async function UsersSettingsPage() {
  const user = await getSessionUserFromCookies();
  if (!user || !hasPermission(user, 'core:users')) {
    return <AccessNotice area="Settings" />;
  }

  const users = await listUsers();
  return (
    <UsersAdmin
      initialUsers={users}
      moduleNames={MODULES.map((mod) => mod.name)}
      selfId={user.id}
    />
  );
}
