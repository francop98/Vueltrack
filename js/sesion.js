/* =========================================================
   Vueltrack — sesión: usuario, equipo, roles y menú de cuenta
   Cada pantalla llama a iniciarPantalla() al cargar.
   ========================================================= */
import { iniciarLugares } from './lugares.js';
import { auth } from './firebase.js';
import {
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { obtenerUsuario, guardarUsuario, escucharEquipo } from './datos.js';
import { VERSION_APP } from './firebase-config.js';
import { abrirGuia } from './guia.js';
import { instalarApp, estaInstalada } from './instalar.js';
import { definirZonaBusqueda } from './rutas.js';
import { ICONOS, esc, iniciales, abrirHoja, pintarNav, aviso, confirmar } from './ui.js';

function esperarUsuario() {
  return new Promise((resolver) => {
    const cortar = onAuthStateChanged(auth, (user) => {
      cortar();
      resolver(user);
    });
  });
}

/**
 * @param {object} op
 * @param {string} op.pagina        id de la pestaña activa (hoy, armar, clientes, equipo, parada)
 * @param {boolean} op.soloOrganizador  si la pantalla es solo para organizadores
 * @param {function} op.alCambiarEquipo  se llama cada vez que cambia el equipo
 */
export async function iniciarPantalla({ pagina, soloOrganizador = false, alCambiarEquipo } = {}) {
  const user = await esperarUsuario();
  if (!user) {
    location.replace('/pages/login.html');
    return new Promise(() => {});
  }

  // Para abrir más rápido: si ya sabemos de qué equipo es, se arranca a cargar
  // el equipo enseguida y el perfil del usuario se confirma por detrás
  const CLAVE_EQUIPO = 'vueltrack_equipo';
  let guardado = null;
  try {
    guardado = JSON.parse(localStorage.getItem(CLAVE_EQUIPO) || 'null');
  } catch (e) {
    guardado = null;
  }
  let usuario = null;
  const desdeGuardado = !!(guardado && guardado.uid === user.uid && guardado.equipoId);
  if (desdeGuardado) {
    usuario = { id: user.uid, nombre: user.displayName || '', email: user.email || '', equipoId: guardado.equipoId };
    obtenerUsuario(user.uid)
      .then((real) => {
        if (!real || real.equipoId !== guardado.equipoId) {
          localStorage.removeItem(CLAVE_EQUIPO);
          location.reload();
        } else {
          Object.assign(usuario, real);
        }
      })
      .catch(() => {});
  } else {
    usuario = await obtenerUsuario(user.uid);
  }
  if (usuario && usuario.equipoId) {
    try {
      localStorage.setItem(CLAVE_EQUIPO, JSON.stringify({ uid: user.uid, equipoId: usuario.equipoId }));
    } catch (e) {
      /* sin almacenamiento */
    }
  }
  if (!usuario) {
    usuario = {
      id: user.uid,
      nombre: user.displayName || (user.email || 'Usuario').split('@')[0],
      email: user.email || '',
      equipoId: null
    };
    await guardarUsuario(user.uid, { nombre: usuario.nombre, email: usuario.email, equipoId: null });
  }

  if (!usuario.equipoId) {
    location.replace('/pages/bienvenida.html');
    return new Promise(() => {});
  }

  return new Promise((resolver) => {
    let primera = true;
    const ctx = { user, usuario, equipo: null, yo: null, organizador: false, fletero: false };

    escucharEquipo(usuario.equipoId, async (equipo) => {
      if (!equipo || !(equipo.miembrosIds || []).includes(user.uid)) {
        try {
          localStorage.removeItem('vueltrack_equipo');
        } catch (e) {
          /* sin almacenamiento */
        }
        // Si el equipo salió de lo guardado en el celular, se vuelve a cargar con el perfil real
        if (desdeGuardado) {
          location.reload();
          return;
        }
        await guardarUsuario(user.uid, { equipoId: null });
        location.replace('/pages/bienvenida.html');
        return;
      }
      ctx.equipo = equipo;
      ctx.yo = { uid: user.uid, ...equipo.miembros[user.uid] };
      ctx.organizador = (ctx.yo.roles || []).includes('organizador');
      ctx.fletero = (ctx.yo.roles || []).includes('fletero');
      // Fletero de un equipo al que otro le arma la vuelta: ve y marca sus paradas, no las cambia
      ctx.fleteroDeEquipo = equipo.modo === 'equipo' && !ctx.organizador;
      ctx.perfil = perfilDe(ctx);

      if (soloOrganizador && !ctx.organizador) {
        location.replace('/');
        return;
      }

      definirZonaBusqueda(equipo.zona);
      iniciarLugares(equipo.id);
      pintarNav(pagina, { organizador: ctx.organizador, fletero: ctx.fletero });
      ponerVolver(pagina);
      ctxActual = ctx;
      prepararMenu(ctx);

      if (primera) {
        primera = false;
        resolver(ctx);
      } else if (alCambiarEquipo) {
        alCambiarEquipo(ctx);
      }
    });
  });
}

/* ---------- Perfiles ----------
   independiente:        trabaja solo y se arma sus propias vueltas
   organizador:          asigna retiros y entregas a sus fleteros (sin vehículo)
   organizador-fletero:  organiza y también sale a repartir
   fletero-equipo:       recibe lo que le asignan; marca cómo le fue */
export function perfilDe(ctx) {
  if (ctx.equipo.modo === 'solo') return 'independiente';
  if (ctx.organizador) return ctx.fletero ? 'organizador-fletero' : 'organizador';
  return 'fletero-equipo';
}

export const PERFILES = {
  independiente: { nombre: 'Fletero independiente', texto: 'Armás y ordenás tus propias vueltas, sin depender de nadie.' },
  organizador: { nombre: 'Organizador', texto: 'Cargás retiros y entregas y se los asignás a tus fleteros. No salís a repartir.' },
  'organizador-fletero': { nombre: 'Organizador y fletero', texto: 'Asignás retiros y entregas a tu equipo y también salís a repartir.' },
  'fletero-equipo': { nombre: 'Fletero de equipo', texto: 'Ves las paradas que te asignan y marcás cómo te fue. Solo quien organiza puede cambiarlas.' }
};

/* ---------- Aviso de sin señal ----------
   Sin conexión la app sigue funcionando: lo que marques se guarda en el
   celular y se envía solo cuando vuelve la señal. */

function vigilarSenal() {
  if (document.getElementById('sin-senal')) return;
  const cinta = document.createElement('div');
  cinta.id = 'sin-senal';
  cinta.className = 'sin-senal oculto';
  cinta.setAttribute('role', 'status');
  cinta.textContent = 'Sin señal · se guarda y se envía al volver';
  document.body.appendChild(cinta);
  const pintar = (avisarVuelta) => {
    const sin = navigator.onLine === false;
    cinta.classList.toggle('oculto', !sin);
    if (!sin && avisarVuelta) aviso('Volvió la señal. Enviando los cambios…');
  };
  window.addEventListener('offline', () => pintar(false));
  window.addEventListener('online', () => pintar(true));
  pintar(false);
}
vigilarSenal();

/* Un cambio que el servidor rechazó después de mostrarse en pantalla */
window.addEventListener('vueltrack:error-guardado', (e) => {
  const codigo = e.detail && e.detail.code;
  aviso(codigo === 'permission-denied' ? 'Ese cambio no se guardó: no tenés permiso para hacerlo.' : 'Un cambio no se pudo guardar. Revisá la conexión y probá de nuevo.');
});

/* ---------- Botón para volver ---------- */

const ICONO_VOLVER =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';

/* Vuelve a la pantalla anterior de la app; si se entró directo, va al Inicio */
export function volver() {
  const vieneDeLaApp = document.referrer && document.referrer.startsWith(location.origin);
  if (vieneDeLaApp && history.length > 1) history.back();
  else location.href = '/';
}

function ponerVolver(pagina) {
  if (pagina === 'inicio' || document.getElementById('btn-volver')) return;
  const barra = document.querySelector('.barra-sup .barra-izq');
  if (!barra || barra.querySelector('[aria-label^="Volver"]')) return;
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn-icono';
  boton.id = 'btn-volver';
  boton.setAttribute('aria-label', 'Volver');
  boton.innerHTML = ICONO_VOLVER;
  boton.addEventListener('click', volver);
  barra.insertBefore(boton, barra.firstChild);
}

/* ---------- Menú desplegable (cuenta, seguridad, etc.) ---------- */

/* El menú lateral está solo en Inicio: se abre con el botón o deslizando
   desde el borde izquierdo hacia la derecha, y se cierra deslizando a la izquierda */
let gestoListo = false;
function prepararMenu(ctx) {
  const boton = document.getElementById('btn-menu');
  if (!boton) return;
  boton.onclick = () => abrirMenu(ctx);
  if (gestoListo) return;
  gestoListo = true;
  let inicio = null;
  document.addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches[0];
      inicio = !document.querySelector('.velo') && t.clientX < 28 ? { x: t.clientX, y: t.clientY } : null;
    },
    { passive: true }
  );
  document.addEventListener(
    'touchmove',
    (e) => {
      if (!inicio) return;
      const t = e.touches[0];
      const dx = t.clientX - inicio.x;
      const dy = Math.abs(t.clientY - inicio.y);
      if (dy > 40) inicio = null;
      else if (dx > 60) {
        inicio = null;
        abrirMenu(ctxActual || ctx);
      }
    },
    { passive: true }
  );
}
let ctxActual = null;

const ICONO_CANDADO =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
const ICONO_SALIR =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H4"/></svg>';

export function abrirMenu(ctx) {
  const velo = document.createElement('div');
  velo.className = 'velo lateral';
  const item = (accion, icono, texto, href) =>
    href
      ? `<a class="menu-item" href="${href}">${icono}<span>${esc(texto)}</span></a>`
      : `<button type="button" class="menu-item" data-accion="${accion}">${icono}<span>${esc(texto)}</span></button>`;
  velo.innerHTML = `
    <nav class="cajon" role="dialog" aria-modal="true" aria-label="Menú">
      <div class="cajon-cabecera">
        <span class="iniciales redondo">${esc(iniciales(ctx.yo.nombre || ctx.usuario.nombre))}</span>
        <span class="titulo-bloque">
          <strong>${esc(ctx.yo.nombre || ctx.usuario.nombre)}</strong>
          <span class="texto-tenue">${esc(ctx.user.email || '')}</span>
        </span>
        <button type="button" class="btn-icono sin-borde" data-accion="cerrar" aria-label="Cerrar menú">${ICONOS.cruz}</button>
      </div>
      <span class="menu-grupo">Tu cuenta</span>
      ${item('', ICONOS.cuenta, 'Mi perfil', '/pages/perfil.html')}
      ${ctx.fletero ? item('', ICONOS.auto, 'Mi vehículo', '/pages/vehiculo.html') : ''}
      ${item('seguridad', ICONO_CANDADO, 'Seguridad')}
      <span class="menu-grupo">Tu trabajo</span>
      ${ctx.organizador ? item('', ICONOS.auto, 'Fleteros', '/pages/fleteros.html') : ''}
      ${item('', ICONOS.equipo, ctx.equipo.modo === 'solo' ? 'Modo de trabajo' : 'Equipo', '/pages/equipo.html')}
      <span class="menu-grupo">Ayuda</span>
      ${item('guia', ICONOS.ayuda, 'Guía de uso')}
      <a class="menu-item" href="mailto:${CORREO_CONTACTO}?subject=${encodeURIComponent('Consulta sobre Vueltrack')}">${ICONOS.mensaje}<span>Escribinos: ${CORREO_CONTACTO}</span></a>
      ${estaInstalada() ? '' : item('instalar', ICONOS.descargar, 'Instalar la app')}
      <div class="cajon-pie">
        ${item('salir', ICONO_SALIR, 'Cerrar sesión')}
        <span class="texto-tenue centrado-texto">Vueltrack v${esc(VERSION_APP)}</span>
      </div>
    </nav>`;
  const cerrar = () => {
    velo.remove();
    document.removeEventListener('keydown', teclas);
  };
  const teclas = (e) => {
    if (e.key === 'Escape') cerrar();
  };
  velo.addEventListener('click', async (e) => {
    if (e.target === velo) {
      cerrar();
      return;
    }
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const accion = b.dataset.accion;
    if (accion === 'cerrar') cerrar();
    if (accion === 'seguridad') {
      cerrar();
      abrirSeguridad(ctx);
    }
    if (accion === 'guia') {
      cerrar();
      abrirGuia(ctx);
    }
    if (accion === 'instalar') {
      cerrar();
      instalarApp();
    }
    if (accion === 'salir') {
      const ok = await confirmar({ titulo: '¿Cerrar sesión?', texto: 'Vas a tener que volver a ingresar.', aceptar: 'Cerrar sesión' });
      if (!ok) return;
      try {
        ['vueltrack_inicio', 'vueltrack_equipo', 'vueltrack_roles'].forEach((k) => localStorage.removeItem(k));
      } catch (e) {
        /* sin almacenamiento */
      }
      await signOut(auth);
      location.replace('/pages/login.html');
    }
  });
  document.addEventListener('keydown', teclas);

  // Deslizar hacia la izquierda para cerrar (el cajón sigue al dedo)
  const cajon = velo.querySelector('.cajon');
  let toque = null;
  velo.addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches[0];
      toque = { x: t.clientX, y: t.clientY, dx: 0, horizontal: null };
    },
    { passive: true }
  );
  velo.addEventListener(
    'touchmove',
    (e) => {
      if (!toque) return;
      const t = e.touches[0];
      const dx = t.clientX - toque.x;
      const dy = t.clientY - toque.y;
      if (toque.horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) toque.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!toque.horizontal) return;
      toque.dx = Math.min(0, dx);
      cajon.style.transition = 'none';
      cajon.style.transform = `translateX(${toque.dx}px)`;
    },
    { passive: true }
  );
  velo.addEventListener('touchend', () => {
    if (!toque) return;
    const cerrarlo = toque.horizontal && toque.dx < -60;
    cajon.style.transition = 'transform 0.2s ease';
    if (cerrarlo) {
      cajon.style.transform = 'translateX(-100%)';
      setTimeout(cerrar, 180);
    } else {
      cajon.style.transform = '';
    }
    toque = null;
  });

  document.body.appendChild(velo);
  velo.querySelector('[data-accion="cerrar"]').focus();
}

export const CORREO_CONTACTO = 'vueltrack@gmail.com';

export function abrirSeguridad(ctx) {
  const conClave = (ctx.user.providerData || []).some((p) => p.providerId === 'password');
  const conGoogle = (ctx.user.providerData || []).some((p) => p.providerId === 'google.com');
  const verificado = ctx.user.emailVerified || conGoogle;
  const hoja = abrirHoja({
    titulo: 'Seguridad',
    html: `
      <div class="ajustes lista">
        <div class="fila"><span>Forma de ingreso</span><strong>${[conClave ? 'Correo y contraseña' : '', conGoogle ? 'Google' : '']
          .filter(Boolean)
          .join(' y ')}</strong></div>
        <div class="fila"><span>Correo</span><strong>${esc(ctx.user.email || '')}</strong></div>
        <div class="fila"><span>Correo confirmado</span><strong>${verificado ? 'Sí' : 'Todavía no'}</strong></div>
      </div>
      ${
        conClave
          ? `
      <p class="texto-tenue">Para cambiar la contraseña te mandamos un correo a <strong>${esc(ctx.user.email || '')}</strong> con un link. Ahí elegís la nueva.</p>
      <button type="button" class="btn btn-primario btn-grande" id="clave-mail">Cambiar contraseña</button>`
          : '<p class="texto-tenue">Ingresás con tu cuenta de Google. La contraseña se administra desde Google.</p>'
      }
      ${verificado ? '' : '<button type="button" class="btn" id="verificar-mail">Mandarme el correo para confirmar mi cuenta</button>'}
      <p class="texto-tenue">Los correos llegan de Vueltrack (${CORREO_CONTACTO}). Si no lo ves, revisá Spam o Promociones.</p>
      <p class="texto-tenue">Tus datos se guardan en Firebase (Google) y solo los ven los integrantes de tu equipo.</p>`
  });
  const mandar = async (boton, accion, textoOk) => {
    boton.disabled = true;
    try {
      await accion();
      aviso(textoOk);
      boton.textContent = 'Correo enviado ✓';
    } catch (e) {
      boton.disabled = false;
      aviso(e && e.code === 'auth/too-many-requests' ? 'Ya te mandamos uno hace poco. Esperá unos minutos.' : 'No se pudo mandar el correo. Probá de nuevo.');
    }
  };
  const botonClave = hoja.el.querySelector('#clave-mail');
  if (botonClave) {
    botonClave.addEventListener('click', () =>
      mandar(botonClave, () => sendPasswordResetEmail(auth, ctx.user.email), `Te mandamos un correo a ${ctx.user.email} para cambiar la contraseña`)
    );
  }
  const botonVerificar = hoja.el.querySelector('#verificar-mail');
  if (botonVerificar) {
    botonVerificar.addEventListener('click', () =>
      mandar(botonVerificar, () => sendEmailVerification(auth.currentUser), `Te mandamos un correo a ${ctx.user.email} para confirmar tu cuenta`)
    );
  }
}

export async function tokenActual() {
  const user = auth.currentUser;
  return user ? user.getIdToken() : '';
}
