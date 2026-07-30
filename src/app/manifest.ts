import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Forge',
    short_name: 'Forge',
    description: 'Pillexis marketing analytics and client follow-up workspace.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#fbfafc',
    theme_color: '#fbfafc',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/forge-logo.png', sizes: '1024x1024', type: 'image/png', purpose: 'any' },
      { src: '/forge-logo.png', sizes: '1024x1024', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
