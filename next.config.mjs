/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    // The DB driver is a Node-only dependency; keep it external to the server bundle.
    serverComponentsExternalPackages: ['postgres', '@google-analytics/data'],
    // Lets src/instrumentation.ts start the inline WhatsApp worker on boot.
    instrumentationHook: true,
  },
};

export default nextConfig;
