import { resolveMx } from 'node:dns/promises';

// Recognise the client's mail provider from their address, so setup can
// show their own steps and fill in the server settings. Detection reads the
// domain's MX records; consumer domains (gmail.com, yahoo.com) are known
// without a lookup.

export type ProviderId = 'google' | 'zoho' | 'microsoft' | 'godaddy' | 'hostinger' | 'yahoo' | 'rediff' | 'other';

export type Provider = {
  id: ProviderId;
  name: string;
  /** Password sign-in over IMAP/SMTP works (usually with an app password). */
  passwordWorks: boolean;
  imap: { host: string; port: number } | null;
  smtp: { host: string; port: number } | null;
  /** Where the user creates an app password, when the provider needs one. */
  appPasswordUrl: string | null;
  appPasswordNote: string;
  /** Plain steps to forward mail to an address, in the provider's own words. */
  forwardSteps: string[];
  /** Gmail asks to confirm a new forwarding address with a code. */
  forwardNeedsCode: boolean;
};

const CONSUMER: Record<string, ProviderId> = {
  'gmail.com': 'google', 'googlemail.com': 'google',
  'outlook.com': 'microsoft', 'hotmail.com': 'microsoft', 'live.com': 'microsoft', 'msn.com': 'microsoft',
  'yahoo.com': 'yahoo', 'yahoo.co.in': 'yahoo', 'ymail.com': 'yahoo',
  'zoho.com': 'zoho', 'zohomail.in': 'zoho', 'zohomail.com': 'zoho',
  'rediffmail.com': 'rediff',
};

/** Map MX hostnames to a provider. Pure, for tests. */
export function providerFromMx(mxHosts: string[]): { id: ProviderId; zohoRegion?: 'in' | 'com' } {
  const hosts = mxHosts.map((h) => h.toLowerCase());
  const has = (re: RegExp) => hosts.some((h) => re.test(h));
  if (has(/(google\.com|googlemail\.com)\.?$/)) return { id: 'google' };
  if (has(/zoho\.in\.?$/)) return { id: 'zoho', zohoRegion: 'in' };
  if (has(/zoho\.(com|eu)\.?$/)) return { id: 'zoho', zohoRegion: 'com' };
  if (has(/(outlook\.com|protection\.outlook\.com|office365\.com)\.?$/)) return { id: 'microsoft' };
  if (has(/secureserver\.net\.?$/)) return { id: 'godaddy' };
  if (has(/hostinger\.(com|in)\.?$/)) return { id: 'hostinger' };
  if (has(/yahoodns\.net\.?$/)) return { id: 'yahoo' };
  if (has(/rediffmail(host)?\.com\.?$/)) return { id: 'rediff' };
  return { id: 'other' };
}

export function providerDetails(id: ProviderId, domain: string, zohoRegion: 'in' | 'com' = 'in'): Provider {
  switch (id) {
    case 'google':
      return {
        id, name: 'Google (Gmail or Workspace)', passwordWorks: true,
        imap: { host: 'imap.gmail.com', port: 993 }, smtp: { host: 'smtp.gmail.com', port: 465 },
        appPasswordUrl: 'https://myaccount.google.com/apppasswords',
        appPasswordNote: 'Turn on 2-Step Verification first, then create an app password named Forge.',
        forwardSteps: [
          'Open Gmail on a computer and click the gear icon, then "See all settings".',
          'Open "Forwarding and POP/IMAP" and click "Add a forwarding address".',
          'Paste the Forge address and click Next. Gmail asks for a code: Forge shows it below within a minute.',
          'Paste the code in Gmail, choose "Forward a copy of incoming mail to" the Forge address, keep a copy in the inbox, and save.',
        ],
        forwardNeedsCode: true,
      };
    case 'zoho': {
      const tld = zohoRegion === 'in' ? 'in' : 'com';
      return {
        id, name: 'Zoho Mail', passwordWorks: true,
        imap: { host: `imap.zoho.${tld}`, port: 993 }, smtp: { host: `smtp.zoho.${tld}`, port: 465 },
        appPasswordUrl: `https://accounts.zoho.${tld}/home#security/app_password`,
        appPasswordNote: 'In Zoho Accounts, open Security, then App Passwords, and create one named Forge. IMAP access must be on in Mail settings.',
        forwardSteps: [
          'Open Zoho Mail, click the gear icon, then "Mail Forwarding and POP/IMAP".',
          'Under Email Forwarding, click "Add Forwarding Address" and paste the Forge address.',
          'Zoho may ask to verify it: Forge shows the verification message below.',
          'Keep "a copy in the inbox" selected and save.',
        ],
        forwardNeedsCode: false,
      };
    }
    case 'microsoft':
      return {
        id, name: 'Microsoft 365 or Outlook', passwordWorks: false,
        imap: { host: 'outlook.office365.com', port: 993 }, smtp: { host: 'smtp.office365.com', port: 587 },
        appPasswordUrl: null,
        appPasswordNote: 'Microsoft no longer allows password sign-in for other apps. Use forwarding.',
        forwardSteps: [
          'Open Outlook on the web and click the gear icon, then Mail, then Forwarding.',
          'Turn on forwarding and paste the Forge address.',
          'Tick "Keep a copy of forwarded messages" and save.',
          'If Outlook blocks forwarding to outside addresses, your IT admin must allow it for this mailbox.',
        ],
        forwardNeedsCode: false,
      };
    case 'godaddy':
      return {
        id, name: 'GoDaddy email', passwordWorks: true,
        imap: { host: 'imap.secureserver.net', port: 993 }, smtp: { host: 'smtpout.secureserver.net', port: 465 },
        appPasswordUrl: null,
        appPasswordNote: 'Use the mailbox password you use to sign in to GoDaddy webmail.',
        forwardSteps: [
          'Sign in to GoDaddy, open Email & Office, and select this mailbox.',
          'Open Forwarding (or "Forward email") and add the Forge address.',
          'Keep a copy in the mailbox and save.',
        ],
        forwardNeedsCode: false,
      };
    case 'hostinger':
      return {
        id, name: 'Hostinger email', passwordWorks: true,
        imap: { host: 'imap.hostinger.com', port: 993 }, smtp: { host: 'smtp.hostinger.com', port: 465 },
        appPasswordUrl: null,
        appPasswordNote: 'Use the mailbox password from hPanel → Emails.',
        forwardSteps: [
          'Open hPanel, then Emails, and select this domain.',
          'Open "Forwarders", click "Create forwarder", and choose this mailbox.',
          'Paste the Forge address and save. The mailbox keeps its copy.',
        ],
        forwardNeedsCode: false,
      };
    case 'yahoo':
      return {
        id, name: 'Yahoo Mail', passwordWorks: true,
        imap: { host: 'imap.mail.yahoo.com', port: 993 }, smtp: { host: 'smtp.mail.yahoo.com', port: 465 },
        appPasswordUrl: 'https://login.yahoo.com/account/security',
        appPasswordNote: 'In Account security, click "Generate app password" and name it Forge.',
        forwardSteps: ['Yahoo allows forwarding only on paid plans. Use the password option instead.'],
        forwardNeedsCode: false,
      };
    case 'rediff':
      return {
        id, name: 'Rediffmail', passwordWorks: true,
        imap: { host: 'imap.rediffmail.com', port: 993 }, smtp: { host: 'smtp.rediffmail.com', port: 465 },
        appPasswordUrl: null,
        appPasswordNote: 'Use the mailbox password.',
        forwardSteps: ['Open Settings, then "Auto forward", add the Forge address, and keep a copy in the inbox.'],
        forwardNeedsCode: false,
      };
    default:
      return {
        id: 'other', name: 'Your email host', passwordWorks: true,
        imap: { host: `mail.${domain}`, port: 993 }, smtp: { host: `mail.${domain}`, port: 465 },
        appPasswordUrl: null,
        appPasswordNote: 'Use the mailbox password. Your web host or IT person can confirm the server names.',
        forwardSteps: [
          'Open your email host’s control panel (for example cPanel), then Email, then Forwarders.',
          'Add a forwarder for this mailbox to the Forge address, and keep a copy in the mailbox.',
          'If you are not sure where this is, send these steps to the person who set up your email.',
        ],
        forwardNeedsCode: false,
      };
  }
}

export async function detectProvider(email: string): Promise<Provider & { domain: string }> {
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  if (!domain || !domain.includes('.')) throw new Error('Enter the full email address, for example sales@yourcompany.in.');
  const known = CONSUMER[domain];
  if (known) return { ...providerDetails(known, domain, domain.endsWith('.in') ? 'in' : 'com'), domain };
  let mx: string[] = [];
  try {
    mx = (await resolveMx(domain)).sort((a, b) => a.priority - b.priority).map((r) => r.exchange);
  } catch {
    throw new Error(`Forge could not find mail servers for ${domain}. Check the spelling of the address.`);
  }
  const found = providerFromMx(mx);
  return { ...providerDetails(found.id, domain, found.zohoRegion), domain };
}
