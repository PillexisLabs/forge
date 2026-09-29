import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/core/permissions';
import { createTemplate, deleteTemplate, listTemplates, type NewTemplate } from '@/modules/whatsapp/whatsapp-templates';

export const runtime = 'nodejs';

const fail = (error: unknown, status = 400) => NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });

// WhatsApp templates on the business account.
//   GET    /api/settings/whatsapp/templates           list with status
//   POST   /api/settings/whatsapp/templates           create { name, category, language, body, examples, footer }
//   DELETE /api/settings/whatsapp/templates?name=x    delete by name
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'core:config');
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ templates: await listTemplates() });
  } catch (error) {
    return fail(error, 502);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'core:config');
  if (!auth.ok) return auth.response;
  const b = await request.json().catch(() => ({}));
  const input: NewTemplate = {
    name: typeof b.name === 'string' ? b.name.trim() : '',
    category: b.category === 'MARKETING' ? 'MARKETING' : 'UTILITY',
    language: typeof b.language === 'string' ? b.language : 'en',
    body: typeof b.body === 'string' ? b.body.trim() : '',
    examples: Array.isArray(b.examples) ? b.examples.map((e: unknown) => String(e ?? '').trim()) : [],
    footer: typeof b.footer === 'string' && b.footer.trim() ? b.footer.trim() : null,
  };
  try {
    return NextResponse.json(await createTemplate(input));
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePermission(request, 'core:config');
  if (!auth.ok) return auth.response;
  const name = request.nextUrl.searchParams.get('name') ?? '';
  if (!/^[a-z0-9_]+$/.test(name)) return NextResponse.json({ error: 'Name the template to delete.' }, { status: 400 });
  try {
    await deleteTemplate(name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error, 502);
  }
}
