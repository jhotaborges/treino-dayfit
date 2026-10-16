// Treino João & Haniere: guarda o site no celular para abrir mesmo sem sinal na academia.
// As cargas (/api/) sempre vão pela rede; o próprio site guarda o que não pôde ser enviado.
const CACHE = 'treino-v1';
const BASE = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => Promise.all(BASE.map((u) => c.add(u).catch(() => null)))));
  self.skipWaiting();
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

function save(key, res) {
  if (res && (res.ok || res.type === 'opaque')) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(key, copy)).catch(() => null);
  }
  return res;
}

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (same && url.pathname.startsWith('/api/')) return;

  // a página: tenta a versão nova; se a rede falhar ou demorar mais de 4 s, abre a cópia guardada
  if (req.mode === 'navigate') {
    if (!same || (url.pathname !== '/' && url.pathname !== '/index.html')) return;
    ev.respondWith(new Promise((resolve) => {
      let done = false;
      const finish = (res) => { if (!done && res) { done = true; resolve(res); } };
      const cached = () => caches.match('/');
      const timer = setTimeout(() => cached().then(finish), 4000);
      fetch(req).then((res) => {
        clearTimeout(timer);
        if (res.ok) finish(save('/', res));
        else cached().then((hit) => finish(hit || res));
      }).catch(() => { clearTimeout(timer); cached().then((hit) => finish(hit || Response.error())); });
    }));
    return;
  }

  // ícones, manifesto e fontes: usa a cópia guardada e atualiza por trás
  if (same || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    ev.respondWith(caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => save(req, res)).catch(() => hit);
      return hit || net;
    }));
  }
});
