const CACHE = 'mapit-v2';
const STATIC = ['./index.html', './manifest.json', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE && k !== 'mapit-pending').map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Handle POST share target (image/file sharing from iOS share sheet)
  if (e.request.method === 'POST') {
    e.respondWith(Response.redirect(url.origin + url.pathname, 303));
    e.waitUntil((async () => {
      try {
        const formData = await e.request.formData();
        const pending = await caches.open('mapit-pending');

        // Store text metadata
        await pending.put('meta', new Response(JSON.stringify({
          title: formData.get('title') || '',
          text:  formData.get('text')  || '',
          url:   formData.get('url')   || ''
        }), { headers: { 'Content-Type': 'application/json' } }));

        // Store shared image/file if present
        const files = formData.getAll('media');
        if (files.length > 0 && files[0].size > 0) {
          await pending.put('file', new Response(files[0], {
            headers: { 'Content-Type': files[0].type || 'image/jpeg' }
          }));
        } else {
          await pending.delete('file');
        }
      } catch (_) {}
    })());
    return;
  }

  // Skip caching API calls
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('corsproxy.io') ||
      url.hostname.includes('allorigins.win')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
