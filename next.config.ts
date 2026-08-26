import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Gera um servidor autocontido em .next/standalone: a imagem de produção
  // não precisa carregar o node_modules inteiro.
  output: 'standalone',

  // Erro de tipo não passa para produção silenciosamente.
  // (No Next 16 o lint do build é controlado fora daqui; o `npm run verify`
  // e o CI cobrem isso.)
  typescript: { ignoreBuildErrors: false },

  poweredByHeader: false,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
