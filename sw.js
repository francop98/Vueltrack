/* =========================================================
   Vueltrack — service worker
   Pantallas: primero la red (siempre lo último), si no hay señal, la copia.
   Estilos, scripts e íconos: copia guardada y se actualiza por detrás.
   Al publicar una versión nueva, subí el número de VERSION.
   ========================================================= */
const VERSION = 'vueltrack-v1.2';

const ARCHIVOS = [
  './',
  'index.html',
  'login.html',
  'bienvenida.html',
  'armar.html',
  'repartir.html',
  'clientes.html',
  'equipo.html',
  'parada.html',
  'css/estilos.css',
  'js/tema.js',
  'js/pwa.js',
  'js/firebase-config.js',
  'js/firebase.js',
  'js/sesion.js',
  'js/ui.js',
  'js/datos.js',
  'js/rutas.js',
  'js/mapa.js',
  'js/vuelta.js',
  'js/ordenar.js',
  'js/buscador.js',
  'js/login.js',
  'js/bienvenida.js',
  'js/hoy.js',
  'js/armar.js',
  'js/repartir.js',
  'js/clientes.js',
  'js/equipo.js',
  'js/parada.js',
  'assets/icono.svg',
  'assets/icono-180.png',
  'assets/icono-192.png',
  'assets/icono-512.png',
  'assets/icono-maskable-512.png',
  'manifest.json'
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(ARCHIVOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);

  // Solo archivos propios; /api, Firebase, mapas y fuentes van directo a internet
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (pedido.mode === 'navigate' || pedido.destination === 'document') {
    evento.respondWith(
      fetch(pedido)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(VERSION).then((cache) => cache.put(pedido, copia));
          return resp;
        })
        .catch(() => caches.match(pedido, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
    );
    return;
  }

  evento.respondWith(
    caches.match(pedido).then((guardado) => {
      const deRed = fetch(pedido)
        .then((resp) => {
          if (resp.ok) {
            const copia = resp.clone();
            caches.open(VERSION).then((cache) => cache.put(pedido, copia));
          }
          return resp;
        })
        .catch(() => guardado);
      return guardado || deRed;
    })
  );
});
