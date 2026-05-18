import type { NextConfig } from 'next';

// ── Allowed origins for CSP ──────────────────────────────
const PROD_URL    = 'https://sticker-verse.com';
const VERCEL_PREV = 'https://*.stickerverse-museum.vercel.app';

const nextConfig: NextConfig = {
  // ── Strict mode ──
  reactStrictMode: true,

  // ── Security headers ──
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',           value: 'DENY' },
          { key: 'X-Content-Type-Options',     value: 'nosniff' },
          { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',         value: 'vibrate=*' }, // Required for haptics
          {
            key:   'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",    // unsafe-inline for <style> tags in JSX
              "style-src 'self' 'unsafe-inline'",
              // Supabase realtime (wss) + note.com + own domains
              `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://note.com ${PROD_URL} ${VERCEL_PREV}`,
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
      // ── API route: no caching ──
      {
        source: '/api/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
          { key: 'Pragma',        value: 'no-cache' },
        ],
      },
    ];
  },

  // ── Redirects ──
  async redirects() {
    return [
      {
        source:      '/vault',
        destination: '/#relics',
        permanent:   false,
      },
    ];
  },
};

export default nextConfig;
