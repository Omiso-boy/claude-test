// オフラインでも起動できるように、アプリ本体をキャッシュする。
// アプリを更新したら VERSION を上げること（古いキャッシュが削除される）。
const VERSION = 'v10';
const CACHE = `kintore-${VERSION}`;
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'lib.js', 'icons.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('kintore-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// ネットワーク優先：つながれば最新を取得してキャッシュを更新、つながらなければキャッシュを使う。
// cache: 'no-cache' でブラウザのHTTPキャッシュ（GitHub Pagesは最大10分）を使わず毎回サーバーに確認する。
// これがないと、新しい app.js と古い lib.js / icons.js が混ざって起動に失敗することがある。
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
