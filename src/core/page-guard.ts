import { notFound } from 'next/navigation';
import { isModuleOn } from './modules';
import { hasPermission } from './permissions';
import { getSessionUserFromCookies } from './session';
import type { SessionUser } from './users';

/**
 * The guard at the top of a module page. A disabled module is a 404 (the
 * instance does not run it). A user without the permission gets null, and
 * the page renders AccessNotice.
 */
export async function guardModulePage(module: string, permission: string): Promise<SessionUser | null> {
  if (!(await isModuleOn(module))) notFound();
  const user = await getSessionUserFromCookies();
  if (!user || !hasPermission(user, permission)) return null;
  return user;
}
