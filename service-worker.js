/* GameHub Service Worker
   نکته صادقانه: این فقط فایل‌های خود سایت (HTML/CSS/JS) رو برای کارکرد آفلاین
   کش می‌کنه. اخبار، ویدیوهای شورتس (که از یوتیوب میاد) و هر چیزی که نیاز به
   اینترنت داره همچنان نیاز به اتصال دارن. بالا بردن نسخه کش (CACHE_NAME) باعث
   می‌شه دفعه بعد که کاربر سایت رو باز کنه، نسخه تازه دانلود و جایگزین بشه. */
const CACHE_NAME = 'gamehub-v2.1';
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return; // درخواست‌های خارجی (مثل یوتیوب) دست‌نخورده به شبکه می‌رن

  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if(res && res.status === 200){
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
