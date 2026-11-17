/* =========================================================
   Vueltrack — service worker
   Cada versión de la app se guarda entera en el celular al instalarse:
   así abre al instante y nunca mezcla archivos de versiones distintas.
   Cuando se publica una versión nueva (cambia VERSION), se descarga entera
   por detrás, se activa y la app se recarga sola una vez.
   Firebase, el mapa y las fuentes (archivos con versión fija) también se guardan.
   ========================================================= */
const VERSION = 'vueltrack-v8.1';

const ARCHIVOS = [
  '/',
  '/styles.css',
  '/manifest.json',
  '/pages/armar.html',
  '/pages/bienvenida.html',
  '/pages/clientes.html',
  '/pages/equipo.html',
  '/pages/historial.html',
  '/pages/login.html',
  '/pages/manejo.html',
  '/pages/parada.html',
  '/pages/perfil.html',
  '/pages/repartir.html',
  '/pages/seguimiento.html',
  '/pages/vehiculo.html',
  '/css/equipo.css',
  '/css/historial.css',
  '/css/ingreso.css',
  '/css/inicio.css',
  '/css/manejo.css',
  '/css/mapa.css',
  '/css/parada.css',
  '/css/repartir.css',
  '/js/armar.js',
  '/js/asignar.js',
  '/js/cargas.js',
  '/js/agregarDestino.js',
  '/js/accionesParada.js',
  '/js/pdfHojaRuta.js',
  '/js/bienvenida.js',
  '/js/buscador.js',
  '/js/clientes.js',
  '/js/comprobante.js',
  '/js/datos.js',
  '/js/editarParada.js',
  '/js/enVivo.js',
  '/js/equipo.js',
  '/js/estados.js',
  '/js/frecuentes.js',
  '/js/firebase-config.js',
  '/js/firebase.js',
  '/js/guia.js',
  '/js/historial.js',
  '/js/inicio.js',
  '/js/instalar.js',
  '/js/login.js',
  '/js/lugares.js',
  '/js/manejo.js',
  '/js/mantenimiento.js',
  '/js/marcarEnMapa.js',
  '/js/mapa.js',
  '/js/nav.js',
  '/js/ordenar.js',
  '/js/parada.js',
  '/js/perfil.js',
  '/js/pwa.js',
  '/js/repartir.js',
  '/js/rutas.js',
  '/js/salida.js',
  '/js/seguimiento.js',
  '/js/sesion.js',
  '/js/splash.js',
  '/js/ui.js',
  '/js/vehiculo.js',
  '/js/vuelta.js',
  '/js/zona.js',
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
      .then((cache) => cache.addAll(ARCHIVOS.map((a) => new Request(a, { cache: 'reload' }))))
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

/* Archivos externos que no cambian (llevan la versión en la dirección) */
const EXTERNOS_FIJOS = ['www.gstatic.com', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);

  // Firebase SDK, Leaflet y fuentes: de la copia guardada; si no está, de internet y se guarda
  if (EXTERNOS_FIJOS.includes(url.hostname)) {
    evento.respondWith(
      caches.match(pedido).then(
        (guardado) =>
          guardado ||
          fetch(pedido).then((resp) => {
            if (resp.ok || resp.type === 'opaque') {
              const copia = resp.clone();
              caches.open(VERSION).then((cache) => cache.put(pedido, copia));
            }
            return resp;
          })
      )
    );
    return;
  }

  // /api, Firebase (datos), Google y los mapas van siempre a internet
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Archivos de la app: de la versión guardada (todos de la misma versión); si falta alguno, de internet
  evento.respondWith(
    caches.match(pedido, { ignoreSearch: pedido.mode === 'navigate' }).then((guardado) => {
      if (guardado) return guardado;
      return fetch(pedido)
        .then((resp) => {
          if (resp.ok) {
            const copia = resp.clone();
            caches.open(VERSION).then((cache) => cache.put(pedido, copia));
          }
          return resp;
        })
        .catch(() => (pedido.mode === 'navigate' ? caches.match('/') : undefined));
    })
  );
});
