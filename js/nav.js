/* =========================================================
   Vueltrack — barra de navegación inferior
   Script clásico: se carga justo después del <nav>, así la barra
   aparece al instante (con los roles guardados de la última vez)
   sin esperar a que cargue la sesión. ui.js la vuelve a pintar
   con los roles reales y los guarda para la próxima.
   ========================================================= */
(function () {
  var ICONOS = {
    inicio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
    ruta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7"/></svg>',
    armar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/></svg>',
    clientes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/></svg>',
    historial: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    manejo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l18-8-8 18-2-8z"/></svg>'
  };
  var CLAVE = 'vueltrack_roles';

  function itemsPara(roles) {
    // Organizador: Inicio (la vuelta de hoy), Armar, Clientes, Historial
    // Fletero (sin organizar): Inicio, Manejo, Historial
    if (roles.organizador) {
      return [
        ['inicio', '/', 'Inicio'],
        ['armar', '/pages/armar.html', 'Armar'],
        ['clientes', '/pages/clientes.html', 'Clientes'],
        ['historial', '/pages/historial.html', 'Historial']
      ];
    }
    var lista = [['inicio', '/', 'Inicio']];
    if (roles.fletero) lista.push(['manejo', '/pages/manejo.html', 'Manejo']);
    lista.push(['historial', '/pages/historial.html', 'Historial']);
    return lista;
  }

  function activaPorRuta() {
    var ruta = location.pathname.replace(/\/index\.html$/, '/');
    if (ruta === '/') return 'inicio';
    var m = ruta.match(/\/pages\/([a-z]+)\.html$/);
    return m ? m[1] : '';
  }

  function pintar(activa, roles) {
    var nav = document.getElementById('nav');
    if (!nav || !roles) return;
    activa = activa || activaPorRuta();
    nav.innerHTML =
      '<div class="nav-inferior-interno">' +
      itemsPara(roles)
        .map(function (i) {
          var esta = i[0] === activa;
          return '<a href="' + i[1] + '" class="' + (esta ? 'activo' : '') + '"' + (esta ? ' aria-current="page"' : '') + '>' + ICONOS[i[0]] + i[2] + '</a>';
        })
        .join('') +
      '</div>';
  }

  window.vueltrackNav = function (activa, roles) {
    try {
      localStorage.setItem(CLAVE, JSON.stringify({ organizador: !!roles.organizador, fletero: !!roles.fletero }));
    } catch (e) {
      /* sin almacenamiento */
    }
    pintar(activa, roles);
  };

  // Pintado inmediato con los roles de la última vez
  try {
    var guardados = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    if (guardados) pintar('', guardados);
  } catch (e) {
    /* sin datos guardados todavía */
  }
})();
