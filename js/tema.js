/* =========================================================
   Vueltrack — modo claro / oscuro
   Se carga en el <head> (sin "module") para aplicar el tema
   antes de pintar la pantalla y evitar el parpadeo.
   Preferencia: "claro" | "oscuro" | "auto" (sigue al celular)
   ========================================================= */
(function () {
  var CLAVE = 'vueltrack_tema';
  var medio = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function preferencia() {
    try {
      return localStorage.getItem(CLAVE) || 'auto';
    } catch (e) {
      return 'auto';
    }
  }

  function temaReal(pref) {
    if (pref === 'claro' || pref === 'oscuro') return pref;
    return medio && medio.matches ? 'oscuro' : 'claro';
  }

  function aplicar() {
    var tema = temaReal(preferencia());
    document.documentElement.setAttribute('data-tema', tema);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', tema === 'oscuro' ? '#0E1420' : '#F6F5F1');
    document.dispatchEvent(new CustomEvent('vueltrack:tema', { detail: { tema: tema } }));
  }

  function guardar(pref) {
    try {
      localStorage.setItem(CLAVE, pref);
    } catch (e) {
      /* sin almacenamiento: se aplica igual en esta visita */
    }
    aplicar();
  }

  if (medio && medio.addEventListener) {
    medio.addEventListener('change', function () {
      if (preferencia() === 'auto') aplicar();
    });
  }

  window.VueltrackTema = {
    preferencia: preferencia,
    actual: function () {
      return temaReal(preferencia());
    },
    guardar: guardar,
    aplicar: aplicar
  };

  aplicar();
  document.addEventListener('DOMContentLoaded', aplicar);
})();
