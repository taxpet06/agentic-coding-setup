// Push notifications + an offline shell. API calls are never cached: stale agent state is worse than none.
const SHELL = 'hub-shell-v7';
const FILES = ['./', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-512.png', 'badge-96.png', 'vendor/marked.js', 'vendor/purify.js'];

self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // network first so a `git pull` on the machine shows up at once; the cache only covers being offline
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request).then(r => r ?? caches.match('index.html'))));
});

self.addEventListener('push', e => {
  let p = {};
  try { p = e.data?.json() ?? {}; } catch { p = { body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(p.title || 'Hub', {
    body: p.body || '', tag: p.tag, renotify: !!p.tag, icon: 'icon-180.png', badge: 'badge-96.png', data: { url: p.url || '/' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => x.url.startsWith(self.location.origin));
    if (c) return c.navigate(target).then(w => (w ?? c).focus());
    return self.clients.openWindow(target);
  }));
});
