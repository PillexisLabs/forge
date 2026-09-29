import { createHash } from 'node:crypto';
import { getIntegration, markIntegration, saveIntegration } from '@/core/integrations';
import { recordInbound } from '@/core/intake';

// Google Sheets intake. The user shares a sheet ("Anyone with the link can
// view") or publishes it as CSV, and pastes the link in Settings →
// Integrations. Forge reads the sheet on a timer; each row it has not seen
// becomes one inbound message. Headers are matched by common names, so a
// Google Form, an IndiaMART export or a website form sheet works as it is.

const ALIASES: Record<string, string[]> = {
  name: ['name', 'buyer', 'buyer name', 'customer', 'customer name', 'contact', 'contact name', 'full name', 'your name', 'sender name'],
  phone: ['phone', 'mobile', 'whatsapp', 'phone number', 'mobile number', 'contact number', 'whatsapp number', 'sender mobile'],
  email: ['email', 'email address', 'e-mail', 'mail', 'sender email'],
  company: ['company', 'company name', 'business', 'business name', 'firm', 'organisation', 'organization'],
  message: ['message', 'requirement', 'requirements', 'enquiry', 'inquiry', 'details', 'query', 'query message', 'product', 'products', 'what do you need'],
  quantity: ['quantity', 'qty', 'order quantity'],
  pincode: ['pincode', 'pin', 'pin code', 'zip', 'postal code', 'delivery pincode'],
  id: ['id', 'enquiry id', 'lead id', 'query id', 'unique query id', 'row id'],
};

/** Turn a normal Google Sheets link into its CSV export link. */
export function csvUrlFor(url: string): string {
  const trimmed = url.trim();
  const sheet = trimmed.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (sheet && !/\/d\/e\//.test(trimmed)) {
    const gid = trimmed.match(/[#&?]gid=(\d+)/)?.[1] ?? '0';
    return `https://docs.google.com/spreadsheets/d/${sheet[1]}/export?format=csv&gid=${gid}`;
  }
  if (/\/pubhtml/.test(trimmed)) return trimmed.replace('/pubhtml', '/pub').replace(/([?&])output=[^&]*/, '$1').replace(/[?&]$/, '') + (trimmed.includes('?') ? '&' : '?') + 'output=csv';
  return trimmed;
}

/** A small RFC 4180 CSV parser: quoted fields, doubled quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim()));
}

function columnMap(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((raw, index) => {
    const name = raw.trim().toLowerCase().replace(/[_*:?]/g, ' ').replace(/\s+/g, ' ').trim();
    for (const [key, names] of Object.entries(ALIASES)) {
      if (map[key] === undefined && names.includes(name)) map[key] = index;
    }
  });
  return map;
}

export type SheetRow = { key: string; name: string | null; phone: string | null; email: string | null; company: string | null; message: string };

export function rowsFromCsv(csv: string): { rows: SheetRow[]; columns: string[] } {
  const [header, ...body] = parseCsv(csv);
  if (!header) return { rows: [], columns: [] };
  const map = columnMap(header);
  const cell = (row: string[], key: string) => (map[key] === undefined ? '' : (row[map[key]] ?? '').trim());
  const used = new Set(Object.values(map));
  const rows = body.map((row) => {
    let message = cell(row, 'message');
    if (!message) {
      // No message column: use every column Forge did not map, with its header.
      message = header.map((h, i) => (used.has(i) || !row[i]?.trim() ? '' : `${h.trim()}: ${row[i].trim()}`)).filter(Boolean).join('\n');
    }
    const extras = [cell(row, 'quantity') && `Quantity ${cell(row, 'quantity')}`, cell(row, 'pincode') && `Delivery pincode ${cell(row, 'pincode')}`].filter(Boolean);
    const full = [message, ...extras].filter(Boolean).join('. ');
    const key = cell(row, 'id') || createHash('sha256').update(row.join('\u0001')).digest('hex').slice(0, 24);
    return { key, name: cell(row, 'name') || null, phone: cell(row, 'phone') || null, email: cell(row, 'email') || null, company: cell(row, 'company') || null, message: full };
  }).filter((row) => row.message);
  return { rows, columns: header.map((h, i) => `${h.trim()}${Object.entries(map).find(([, idx]) => idx === i) ? ` → ${Object.entries(map).find(([, idx]) => idx === i)![0]}` : ''}`) };
}

/** Read the sheet once. The first read only notes the existing rows unless `importExisting` is on. */
export async function pollSheet(opts: { force?: boolean } = {}): Promise<{ ok: boolean; created: number; seen: number; error?: string }> {
  const row = await getIntegration('sheets');
  if (!row.enabled && !opts.force) return { ok: true, created: 0, seen: 0 };
  const url = typeof row.config.url === 'string' ? row.config.url : '';
  if (!url) return { ok: false, created: 0, seen: 0, error: 'Paste the sheet link first.' };

  try {
    const response = await fetch(csvUrlFor(url), { redirect: 'follow', cache: 'no-store' });
    const text = await response.text();
    if (!response.ok || /^\s*<!doctype html/i.test(text)) {
      throw new Error('Forge cannot read the sheet. Share it as "Anyone with the link can view", or publish it as CSV.');
    }
    const { rows, columns } = rowsFromCsv(text);
    const seen = new Set(Array.isArray(row.cursor.seen) ? (row.cursor.seen as string[]) : []);
    const firstRead = row.cursor.initialised !== true;
    let created = 0;
    for (const sheetRow of rows) {
      if (seen.has(sheetRow.key)) continue;
      seen.add(sheetRow.key);
      if (firstRead && row.config.importExisting !== true) continue;
      const inserted = await recordInbound({
        source: 'sheets',
        externalId: sheetRow.key,
        fromName: sheetRow.name,
        fromPhone: sheetRow.phone,
        fromEmail: sheetRow.email,
        company: sheetRow.company,
        body: sheetRow.message,
      });
      if (inserted) created += 1;
    }
    await saveIntegration('sheets', {
      cursor: { initialised: true, seen: [...seen].slice(-5000), columns, lastRows: rows.length, lastPollAt: new Date().toISOString() },
    }, 'Sheets rule');
    await markIntegration('sheets', { ok: true });
    return { ok: true, created, seen: rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markIntegration('sheets', { ok: false, error: message });
    return { ok: false, created: 0, seen: 0, error: message };
  }
}
