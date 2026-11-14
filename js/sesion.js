/* =========================================================
   Vueltrack — sesión: usuario, equipo, roles y menú de cuenta
   Cada pantalla llama a iniciarPantalla() al cargar.
   ========================================================= */
import { auth } from './firebase.js';
import {
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { obtenerUsuario, guardarUsuario, escucharEquipo, actualizarMiembro } from './datos.js';
import { VERSION_APP } from './firebase-config.js';
import { abrirGuia } from './guia.js';
import { instalarApp, estaInstalada } from './instalar.js';
import { definirZonaBusqueda } from './rutas.js';
import { ICONOS, esc, iniciales, abrirHoja, pintarNav, aviso, confirmar, activarVerClave } from './ui.js';

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

  let usuario = await obtenerUsuario(user.uid);
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
        await guardarUsuario(user.uid, { equipoId: null });
        location.replace('/pages/bienvenida.html');
        return;
      }
      ctx.equipo = equipo;
      ctx.yo = { uid: user.uid, ...equipo.miembros[user.uid] };
      ctx.organizador = (ctx.yo.roles || []).includes('organizador');
      ctx.fletero = (ctx.yo.roles || []).includes('fletero');

      if (soloOrganizador && !ctx.organizador) {
        location.replace('/');
        return;
      }

      definirZonaBusqueda(equipo.zona);
      pintarNav(pagina, { organizador: ctx.organizador });
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

/* ---------- Menú desplegable (cuenta, seguridad, etc.) ---------- */

function prepararMenu(ctx) {
  const boton = document.getElementById('btn-menu');
  if (!boton) return;
  boton.onclick = () => abrirMenu(ctx);
}

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
      ${item('datos', ICONOS.cuenta, 'Mis datos')}
      ${item('seguridad', ICONO_CANDADO, 'Seguridad')}
      ${ctx.fletero ? item('', ICONOS.auto, 'Mi vehículo', '/pages/vehiculo.html') : ''}
      <span class="menu-grupo">Tu trabajo</span>
      ${item('', ICONOS.equipo, ctx.equipo.modo === 'solo' ? 'Modo de trabajo' : 'Equipo', '/pages/equipo.html')}
      ${ctx.organizador ? item('', ICONOS.clientes, 'Clientes habituales', '/pages/clientes.html') : ''}
      ${item('', ICONOS.plata, 'Cotizar un flete', '/pages/cotizar.html')}
      ${item('', ICONOS.historial, 'Historial', '/pages/historial.html')}
      <span class="menu-grupo">Ayuda</span>
      ${item('guia', ICONOS.ayuda, 'Guía de uso')}
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
    if (accion === 'datos') {
      cerrar();
      abrirCuenta(ctx);
    }
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
      await signOut(auth);
      location.replace('/pages/login.html');
    }
  });
  document.addEventListener('keydown', teclas);
  document.body.appendChild(velo);
  velo.querySelector('[data-accion="cerrar"]').focus();
}

export function abrirCuenta(ctx) {
  const hoja = abrirHoja({
    titulo: 'Mis datos',
    html: `
      <div class="campo">
        <label for="cuenta-nombre">Nombre</label>
        <input id="cuenta-nombre" value="${esc(ctx.yo.nombre || ctx.usuario.nombre)}" autocomplete="name">
      </div>
      <div class="campo">
        <label for="cuenta-mail">Correo electrónico</label>
        <input id="cuenta-mail" value="${esc(ctx.user.email || '')}" disabled>
      </div>
      <div class="ajustes lista">
        <div class="fila"><span>Equipo</span><strong>${esc(ctx.equipo.modo === 'solo' ? 'Trabajo solo' : ctx.equipo.nombre)}</strong></div>
        <div class="fila"><span>Rol</span><strong>${esc(
          [ctx.organizador ? 'Organizador' : '', ctx.fletero ? 'Fletero' : ''].filter(Boolean).join(' y ')
        )}</strong></div>
      </div>
      <button type="button" class="btn btn-primario btn-grande" id="cuenta-guardar">Guardar</button>`
  });

  hoja.el.querySelector('#cuenta-guardar').addEventListener('click', async () => {
    const nombre = hoja.el.querySelector('#cuenta-nombre').value.trim();
    if (!nombre) return;
    await guardarUsuario(ctx.user.uid, { nombre });
    await actualizarMiembro(ctx.equipo.id, ctx.user.uid, { nombre });
    hoja.cerrar();
    aviso('Datos guardados');
  });
}

export function abrirSeguridad(ctx) {
  const conClave = (ctx.user.providerData || []).some((p) => p.providerId === 'password');
  const conGoogle = (ctx.user.providerData || []).some((p) => p.providerId === 'google.com');
  const hoja = abrirHoja({
    titulo: 'Seguridad',
    html: `
      <div class="ajustes lista">
        <div class="fila"><span>Forma de ingreso</span><strong>${[conClave ? 'Correo y contraseña' : '', conGoogle ? 'Google' : '']
          .filter(Boolean)
          .join(' y ')}</strong></div>
      </div>
      ${
        conClave
          ? `
      <form class="seccion" id="form-clave" novalidate>
        <span class="subtitulo">Cambiar contraseña</span>
        <div class="campo"><label for="clave-actual">Contraseña actual</label><input id="clave-actual" type="password" autocomplete="current-password"></div>
        <div class="campo"><label for="clave-nueva">Nueva contraseña</label><input id="clave-nueva" type="password" autocomplete="new-password" minlength="6"></div>
        <div class="campo"><label for="clave-repetir">Repetir nueva contraseña</label><input id="clave-repetir" type="password" autocomplete="new-password"></div>
        <p class="error-texto oculto" id="clave-error" role="alert"></p>
        <button type="submit" class="btn btn-primario btn-grande">Cambiar contraseña</button>
        <button type="button" class="link" id="clave-mail">Prefiero recibir un correo para cambiarla</button>
      </form>`
          : '<p class="texto-tenue">Ingresás con tu cuenta de Google. La contraseña se administra desde Google.</p>'
      }
      <p class="texto-tenue">Tus datos se guardan en Firebase (Google) y solo los ven los integrantes de tu equipo.</p>`
  });

  const form = hoja.el.querySelector('#form-clave');
  if (!form) return;
  activarVerClave(form);
  const error = hoja.el.querySelector('#clave-error');
  const mostrarError = (t) => {
    error.textContent = t;
    error.classList.toggle('oculto', !t);
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const actual = hoja.el.querySelector('#clave-actual').value;
    const nueva = hoja.el.querySelector('#clave-nueva').value;
    const repetir = hoja.el.querySelector('#clave-repetir').value;
    if (nueva.length < 6) return mostrarError('La nueva contraseña tiene que tener al menos 6 caracteres.');
    if (nueva !== repetir) return mostrarError('Las contraseñas nuevas no coinciden.');
    try {
      const cred = EmailAuthProvider.credential(ctx.user.email, actual);
      await reauthenticateWithCredential(auth.currentUser, cred);
      await updatePassword(auth.currentUser, nueva);
      hoja.cerrar();
      aviso('Contraseña actualizada');
    } catch (err) {
      mostrarError(
        err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password'
          ? 'La contraseña actual no es correcta.'
          : 'No se pudo cambiar. Probá de nuevo.'
      );
    }
  });

  hoja.el.querySelector('#clave-mail').addEventListener('click', async () => {
    await sendPasswordResetEmail(auth, ctx.user.email);
    aviso('Te enviamos un correo para cambiar la contraseña');
  });
}

export async function tokenActual() {
  const user = auth.currentUser;
  return user ? user.getIdToken() : '';
}
