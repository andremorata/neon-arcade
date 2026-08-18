'use strict';
// Cache primeiro, revalida em segundo plano: o arcade abre offline e se atualiza sozinho
// na visita seguinte. Sem numero de versao pra bumpar a cada release.
// O nome do cache tambem aparece em index.html, que pre-carrega os jogos do menu.
const CACHE = 'neon-arcade';

// so o esqueleto; os jogos entram pelo pre-carregamento do menu ou ao serem abertos
const SHELL = [
  '.',
  'index.html',
  'manifest.webmanifest',
  'assets/css/neon-theme.css',
  'assets/js/neon-core.js',
  'assets/fonts/orbitron-var-latin.woff2',
  'assets/fonts/space-mono-400-latin.woff2',
  'assets/fonts/space-mono-700-latin.woff2',
  'assets/icon.svg',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
});

self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // opaque = resposta cross-origin sem CORS (Google Fonts); guarda mesmo assim
  const net = fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') caches.open(CACHE).then(c => c.put(req, res.clone()));
    return res;
  });
  e.waitUntil(net.catch(() => {}));
  e.respondWith(caches.match(req).then(hit => hit || net));
});
