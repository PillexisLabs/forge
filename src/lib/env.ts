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

  dashboardPassword: () => req('DASHBOARD_PASSWORD'),
  authSecret: () => process.env.AUTH_SECRET ?? '',
  syncSecret: () => process.env.SYNC_SECRET ?? '',

  ga4PropertyId: () => req('GA4_PROPERTY_ID'),
  gaCredentialsJson: () => process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,

  metaToken: () => req('META_ACCESS_TOKEN'),
  metaAccountId: () => process.env.META_AD_ACCOUNT_ID ?? 'act_1705074640527431',
  metaGraphVersion: () => process.env.META_GRAPH_VERSION ?? 'v23.0',
};
