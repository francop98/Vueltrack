/* =========================================================
   Vueltrack — app instalable
   Registra el service worker y guarda el aviso de instalación
   que ofrecen Chrome y Android (en iPhone se instala a mano).
   ========================================================= */
if ('serviceWorker' in navigator) {
  // Cuando se activa una versión nueva de la app, se recarga una vez para usarla entera
  var habiaVersion = !!navigator.serviceWorker.controller;
  var recargada = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!habiaVersion || recargada) return;
    recargada = true;
    location.reload();
  });
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {
      /* sin service worker la app funciona igual, solo sin modo instalable */
    });
  });
}

window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  window.vueltrackInstalar = e;
  document.dispatchEvent(new CustomEvent('vueltrack:instalable'));
});

window.addEventListener('appinstalled', function () {
  window.vueltrackInstalar = null;
  document.dispatchEvent(new CustomEvent('vueltrack:instalada'));
});
