/* DeckCycle — Fase 2: cache offline coerente e aggiornamenti su richiesta.
   Non intercettare Scryfall o risorse esterne; non cancellare i dati del browser. */
const CACHE_NAME = 'deckcycle-scrycheck-rc1-v1';
const CORE_ASSETS = ['index.html', 'safeguards.js', 'pwa.js', 'archive.js', 'archive-ui.js', 'features.js', 'scrycheck.js', 'manifest.webmanifest'];
const ICON_ASSETS = ['icon-180.png', 'icon-192.png', 'icon-512.png'];
const KNOWN_ASSETS = new Set([...CORE_ASSETS, ...ICON_ASSETS]);
const ROOT_URL = new URL(self.registration.scope);
const INDEX_URL = new URL('index.html', ROOT_URL).href;

function scopedFile(requestUrl) {
  const url = new URL(requestUrl);
  if (url.origin !== ROOT_URL.origin || !url.pathname.startsWith(ROOT_URL.pathname)) return null;
  const relative = url.pathname.slice(ROOT_URL.pathname.length);
  return KNOWN_ASSETS.has(relative) ? new URL(relative, ROOT_URL).href : null;
}

function cacheable(response) {
  return response && response.ok && response.type !== 'opaque' &&
    response.type !== 'opaqueredirect' && new URL(response.url).origin === ROOT_URL.origin;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Questi file sono indispensabili per aprire DeckCycle offline.
    // Se uno manca, non sostituiamo il service worker funzionante.
    await cache.addAll(CORE_ASSETS.map(path =>
      new Request(new URL(path, ROOT_URL).href, { cache: 'reload' })
    ));
    // Le icone sono accessorie: un'icona mancante non deve bloccare la PWA.
    await Promise.all(ICON_ASSETS.map(async path => {
      try { await cache.add(new Request(new URL(path, ROOT_URL).href, { cache: 'reload' })); }
      catch (error) { /* installazione possibile anche senza icona */ }
    }));
    // Non usare skipWaiting qui: l'utente può decidere quando aggiornare.
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'DECKCYCLE_APPLY_UPDATE') {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('deckcycle-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, cacheKey, requireHtml) {
  try {
    // Verifica la rete prima della cache del browser per ridurre le versioni vecchie.
    const response = await fetch(request, { cache: 'no-store' });
    const contentType = response.headers.get('content-type') || '';
    if (cacheable(response) && (!requireHtml || contentType.includes('text/html'))) {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(cacheKey, response.clone());
      } catch (error) { /* Quota raggiunta: resta valida la risposta di rete */ }
    }
    return response;
  } catch (error) {
    // Il fallback deve provenire dalla cache di questa versione.
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(cacheKey)) || Response.error();
  }
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== ROOT_URL.origin || !url.pathname.startsWith(ROOT_URL.pathname)) return;
  // Le API Scryfall e le immagini remote non sono disponibili offline
  // e non vengono trattate come HTML locale.
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request, INDEX_URL, true));
    return;
  }
  const localFile = scopedFile(event.request.url);
  if (localFile) event.respondWith(networkFirst(event.request, localFile, false));
});