// Centralised, lazily-read env access. Reading happens at call time (not import
// time) so `next build` doesn't fail when secrets are absent.

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  databaseUrl: () => req('DATABASE_URL'),
  databaseSsl: () => (process.env.DATABASE_SSL === 'disable' ? false : ('require' as const)),

  authSecret: () => process.env.AUTH_SECRET ?? '',
  // Only emails on this domain can be created or sign in. Fail-closed default
  // for the Pillexis deployment; a client copy sets its own domain, and '*'
  // disables the restriction entirely.
  authEmailDomain: () => (process.env.AUTH_EMAIL_DOMAIN ?? 'pillexislabs.com').trim().toLowerCase(),
  // First-deploy bootstrap only (plans/RBAC.md section 7). Once the admin
  // exists these are ignored and can be removed from the environment.
  seedAdminEmail: () => process.env.SEED_ADMIN_EMAIL ?? '',
  seedAdminPassword: () => process.env.SEED_ADMIN_PASSWORD ?? '',
  syncSecret: () => process.env.SYNC_SECRET ?? '',
  apiClientsJson: () => process.env.API_CLIENTS_JSON ?? '[]',

  ga4PropertyId: () => req('GA4_PROPERTY_ID'),
  gaCredentialsJson: () => process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
  gaHostname: () => process.env.GA4_HOSTNAME ?? 'pillexislabs.com',

  metaToken: () => req('META_ACCESS_TOKEN'),
  metaAccountId: () => process.env.META_AD_ACCOUNT_ID ?? 'act_1705074640527431',
  metaGraphVersion: () => process.env.META_GRAPH_VERSION ?? 'v23.0',
  firefliesApiKey: () => req('FIREFLIES_API_KEY'),

  // WhatsApp Cloud API (separate token from the Marketing API one above).
  whatsappToken: () => req('WHATSAPP_ACCESS_TOKEN'),
  whatsappPhoneNumberId: () => req('WHATSAPP_PHONE_NUMBER_ID'),
  whatsappGraphVersion: () => process.env.WHATSAPP_GRAPH_VERSION ?? 'v25.0',
  whatsappDryRun: () => process.env.WHATSAPP_DRY_RUN === '1',
  whatsappVerifyToken: () => req('WHATSAPP_WEBHOOK_VERIFY_TOKEN'),
  whatsappAppSecret: () => process.env.WHATSAPP_APP_SECRET ?? '',
  whatsappRescheduleLink: () =>
    process.env.WHATSAPP_RESCHEDULE_LINK ?? 'https://cal.com/pillexislabs/pillexis-labs-intro-call',
  // Production numbers must open conversations with approved templates; the
  // test number keeps free-form text so staging works without template review.
  whatsappUseTemplates: () => process.env.WHATSAPP_USE_TEMPLATES === '1',

  // Cal.com BOOKING_CREATED webhook (CRM intake, not the website CAPI one).
  calWebhookSecret: () => process.env.CAL_WEBHOOK_SECRET ?? '',
};
