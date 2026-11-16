/* =========================================================
   Vueltrack — pantalla de carga al entrar a la app
   El punto blanco del logo recorre la línea de principio a fin.
   Se muestra una vez por sesión, mientras carga el Inicio.
   (Script clásico: corre antes de pintar el resto de la página)
   ========================================================= */
(function () {
  var splash = document.getElementById('splash');
  if (!splash) return;
  var CLAVE = 'vueltrack_splash';
  var MINIMO = 1500;
  var MAXIMO = 8000;
  var visto = false;
  try {
    visto = sessionStorage.getItem(CLAVE) === 'si';
    sessionStorage.setItem(CLAVE, 'si');
  } catch (e) {
    visto = false;
  }
  if (visto) {
    splash.remove();
    return;
  }
  var inicio = Date.now();
  var listo = false;
  function ocultar() {
    if (listo) return;
    listo = true;
    var espera = Math.max(0, MINIMO - (Date.now() - inicio));
    setTimeout(function () {
      splash.classList.add('saliendo');
      setTimeout(function () {
        splash.remove();
      }, 350);
    }, espera);
  }
  // El Inicio avisa cuando terminó de cargar; por las dudas, hay un tope
  window.addEventListener('vueltrack:listo', ocultar);
  setTimeout(ocultar, MAXIMO);
})();
