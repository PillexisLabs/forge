import AccessNotice from '@/components/AccessNotice';
import TemplatesPanel from '@/components/settings/TemplatesPanel';
import { hasPermission } from '@/core/permissions';
import { getSessionUserFromCookies } from '@/core/session';
import { listTemplates, SUGGESTED_TEMPLATES, TEMPLATE_LANGUAGES, type WhatsAppTemplate } from '@/modules/whatsapp/whatsapp-templates';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const user = await getSessionUserFromCookies();
  if (!user || !hasPermission(user, 'core:config')) return <AccessNotice area="Settings" />;
  let templates: WhatsAppTemplate[] = [];
  let loadError: string | null = null;
  try {
    templates = await listTemplates();
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }
  return <TemplatesPanel initial={templates} loadError={loadError} suggested={SUGGESTED_TEMPLATES} languages={TEMPLATE_LANGUAGES} />;
}
