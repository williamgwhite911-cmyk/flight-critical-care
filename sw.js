// ═══════════════════════════════════════════════════════════════════
// StatFlight Critical Care — Service Worker (Offline Support)
// ═══════════════════════════════════════════════════════════════════
var CACHE_NAME = 'statflight-v1';
var OFFLINE_URLS = [
  './',
  './index.html',
  './manifest.json'
];

// Install: pre-cache the app shell
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(OFFLINE_URLS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate: clean up old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) { return name !== CACHE_NAME; })
             .map(function(name) { return caches.delete(name); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch: serve from cache first, fall back to network
// For AI API calls (openai, anthropic, etc.) — always try network first
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // AI/API calls — network only, don't cache
  if (url.indexOf('api.openai.com') >= 0 ||
      url.indexOf('api.anthropic.com') >= 0 ||
      url.indexOf('generativelanguage.googleapis.com') >= 0) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return new Response(JSON.stringify({
          error: { message: 'You are offline. AI features will resume when connectivity returns.' }
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Everything else — cache first, network fallback, update cache
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      // Return cached version immediately
      var fetchPromise = fetch(event.request).then(function(networkResponse) {
        // Update cache with fresh version in background
        if (networkResponse && networkResponse.status === 200) {
          var clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return networkResponse;
      }).catch(function() {
        // Network failed — that's fine, we already returned cached
        return cached;
      });

      return cached || fetchPromise;
    })
  );
});
