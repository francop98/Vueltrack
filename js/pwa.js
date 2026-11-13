/* =========================================================
   Vueltrack — registra el service worker (app instalable)
   ========================================================= */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {
      /* sin service worker la app funciona igual, solo sin modo instalable */
    });
  });
}
