const CACHE_NAME = 'buscontrol-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS_TO_CACHE))
    );
});

self.addEventListener('fetch', event => {
    // Para las llamadas de datos de Firebase, siempre vamos a la red
    if (event.request.url.includes('firebaseio.com')) {
        return;
    }
    event.respondWith(
        caches.match(event.request).then(response => response || fetch(event.request))
    );
});