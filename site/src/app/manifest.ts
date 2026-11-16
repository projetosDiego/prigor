import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Doces Prigor',
    short_name: 'Doces Prigor',
    description: 'A felicidade em forma de brownie.',
    start_url: '/',
    display: 'browser',
    background_color: '#f7f1e9',
    theme_color: '#2a1812',
    icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }],
  };
}
