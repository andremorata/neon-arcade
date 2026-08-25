'use strict';
// Codigo (pagina, js, css) sai da rede primeiro, com prazo: correcao chega na
// primeira abertura em vez da seguinte. Fonte e icone continuam vindo do cache,
// que e instantaneo e nao muda sem trocar de nome.
// Sem numero de versao pra bumpar a cada release.
// O nome do cache tambem aparece em index.html, que pre-carrega os jogos do menu.
const CACHE = 'neon-arcade';
const PRAZO_MS = 2500;   // ponytail: constante. Rede pior que isso, serve o cache.

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

// Codigo do proprio site. Cross-origin fica de fora: fonte de CDN nao muda sozinha.
function ehCodigo(req) {
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return false;
  return req.mode === 'navigate' || /\.(?:js|css)$/.test(url.pathname);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // opaque = resposta cross-origin sem CORS; guarda mesmo assim
  const rede = fetch(req).then(async res => {
    if (res.ok || res.type === 'opaque') {
      const c = await caches.open(CACHE);
      await c.put(req, res.clone());      // await: sem ele o SW dorme antes de gravar
    }
    return res;
  });
  e.waitUntil(rede.catch(() => {}));      // mantem o SW vivo ate a gravacao terminar
  e.respondWith(ehCodigo(req) ? redePrimeiro(req, rede) : cachePrimeiro(req, rede));
});

async function redePrimeiro(req, rede) {
  const prazo = new Promise(r => setTimeout(() => r(null), PRAZO_MS));
  const res = await Promise.race([rede.catch(() => null), prazo]);
  if (res) return res;
  return (await caches.match(req)) || rede;   // prazo estourou ou caiu: serve o cache
}

async function cachePrimeiro(req, rede) {
  return (await caches.match(req)) || rede;
}
