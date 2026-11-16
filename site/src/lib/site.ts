/** Endereço do sistema interno (CRM/ERP). O botão "Entrar" e os links antigos do sistema levam para cá. */
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.docesprigor.com.br').replace(/\/$/, '');

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
export const SLOGAN = 'A felicidade em forma de brownie.';
export const BRAND = 'Doces Prigor';

export function absoluteUrl(path = '/'): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export const NAV = [
  { href: '/', label: 'Início' },
  { href: '/nossa-historia', label: 'Nossa história' },
  { href: '/produtos', label: 'Produtos' },
  { href: '/onde-encontrar', label: 'Onde encontrar' },
  { href: '/seja-um-revendedor', label: 'Seja um revendedor' },
  { href: '/contato', label: 'Contato' },
] as const;
