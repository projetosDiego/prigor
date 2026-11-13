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
          // Força HTTPS por 1 ano (o domínio já usa certificado válido).
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          // O sistema não usa câmera, microfone nem sensores: bloqueia o acesso.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          // Subconjunto seguro de CSP: impede embutir o site em outro, trocar <base>,
          // enviar formulários para fora e carregar plugins.
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
