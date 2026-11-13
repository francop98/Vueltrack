/* =========================================================
   Vueltrack — service worker
   Pantallas: primero la red (siempre lo último), si no hay señal, la copia.
   Estilos, scripts e íconos: copia guardada y se actualiza por detrás.
   Al publicar una versión nueva, subí el número de VERSION.
   ========================================================= */
const VERSION = 'vueltrack-v2.3';

const ARCHIVOS = [
  '/',
  '/styles.css',
  '/manifest.json',
  '/pages/hoy.html',
  '/pages/login.html',
  '/pages/bienvenida.html',
  '/pages/armar.html',
  '/pages/repartir.html',
  '/pages/clientes.html',
  '/pages/equipo.html',
  '/pages/parada.html',
  '/pages/vehiculo.html',
  '/css/equipo.css',
  '/css/ingreso.css',
  '/css/inicio.css',
  '/css/mapa.css',
  '/css/parada.css',
  '/css/repartir.css',
  '/js/armar.js',
  '/js/bienvenida.js',
  '/js/buscador.js',
  '/js/clientes.js',
  '/js/datos.js',
  '/js/editarParada.js',
  '/js/equipo.js',
  '/js/firebase-config.js',
  '/js/firebase.js',
  '/js/hoy.js',
  '/js/inicio.js',
  '/js/login.js',
  '/js/mapa.js',
  '/js/ordenar.js',
  '/js/parada.js',
  '/js/pwa.js',
  '/js/repartir.js',
  '/js/rutas.js',
  '/js/salida.js',
  '/js/sesion.js',
  '/js/ui.js',
  '/js/vehiculo.js',
  '/js/vuelta.js',
  '/assets/icono-180.png',
  '/assets/icono-192.png',
  '/assets/icono-512.png',
  '/assets/icono-maskable-512.png',
  '/assets/icono.svg'
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
        .catch(() => caches.match(pedido, { ignoreSearch: true }).then((r) => r || caches.match('/')))
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
