import type { NextConfig } from 'next';

// Onde mora o sistema interno (CRM/ERP). Os endereços que ele usava no domínio
// principal continuam funcionando: são encaminhados para lá.
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.docesprigor.com.br').replace(/\/$/, '');

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    qualities: [60, 75, 85],
    deviceSizes: [390, 640, 828, 1080, 1280, 1600, 1920],
    minimumCacheTTL: 2678400,
  },
  experimental: {
    serverActions: { bodySizeLimit: '12mb' },
  },
  async redirects() {
    // Endereços do site anterior continuam funcionando.
    return [
      { source: '/sobre', destination: '/nossa-historia', permanent: true },
      { source: '/quero-vender', destination: '/seja-um-revendedor', permanent: true },
      { source: '/produtos/classic-prigor', destination: '/produtos/dip-brownie', permanent: true },
      { source: '/natal', destination: '/natal2026', permanent: false },
      // Sistema interno: docesprigor.com.br/app e os links antigos do ERP.
      { source: '/app', destination: `${APP_URL}/`, permanent: false },
      { source: '/app/:path*', destination: `${APP_URL}/:path*`, permanent: false },
      { source: '/login', destination: `${APP_URL}/login`, permanent: false },
      { source: '/seller', destination: `${APP_URL}/seller`, permanent: false },
      { source: '/seller/:path*', destination: `${APP_URL}/seller/:path*`, permanent: false },
      { source: '/pedido', destination: `${APP_URL}/pedido`, permanent: false },
      { source: '/pedido/:path*', destination: `${APP_URL}/pedido/:path*`, permanent: false },
      { source: '/api/public/:path*', destination: `${APP_URL}/api/public/:path*`, permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
      {
        source: '/images/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default nextConfig;
