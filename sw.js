const CACHE = 'nutq-v3';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './settings.css', './js/dictionary.js', './js/ai-client.js', './js/app.js', './js/register-sw.js', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', e => {
  // Keep the current page and its scripts together; activate after old tabs close.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => /^nutq-v\d+$/.test(k) && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('Authorization')) return;
  const url = new URL(req.url);
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== location.origin && !isFont) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(req);
    if(cached) return cached;
    try {const res=await fetch(req);if(res.ok || res.type==='opaque')await cache.put(req,res.clone());return res;}
    catch {return new Response('Offline', {status:503});}
  }));
});
