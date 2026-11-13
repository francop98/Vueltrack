/* =========================================================
   Vueltrack — sesión: usuario, equipo, roles y menú de cuenta
   Cada pantalla llama a iniciarPantalla() al cargar.
   ========================================================= */
import { auth } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { obtenerUsuario, guardarUsuario, escucharEquipo, actualizarMiembro } from './datos.js';
import { VERSION_APP } from './firebase-config.js';
import { esc, iniciales, abrirHoja, pintarNav, aviso } from './ui.js';

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

      pintarNav(pagina, { organizador: ctx.organizador });
      prepararBotonCuenta(ctx);

      if (primera) {
        primera = false;
        resolver(ctx);
      } else if (alCambiarEquipo) {
        alCambiarEquipo(ctx);
      }
    });
  });
}

function prepararBotonCuenta(ctx) {
  const boton = document.getElementById('btn-cuenta');
  if (!boton) return;
  boton.textContent = iniciales(ctx.yo.nombre || ctx.usuario.nombre);
  boton.onclick = () => abrirCuenta(ctx);
}

export function abrirCuenta(ctx) {
  const hoja = abrirHoja({
    titulo: 'Mi cuenta',
    html: `
      <div class="tarjeta">
        <div class="campo">
          <label for="cuenta-nombre">Tu nombre</label>
          <input id="cuenta-nombre" value="${esc(ctx.yo.nombre || ctx.usuario.nombre)}" autocomplete="name">
        </div>
        <span class="texto-tenue">${esc(ctx.user.email || '')}</span>
        <button type="button" class="btn" id="cuenta-guardar">Guardar nombre</button>
      </div>
      <button type="button" class="btn btn-bloque btn-peligro" id="cuenta-salir">Cerrar sesión</button>
      <span class="texto-tenue centrado-texto">Vueltrack v${esc(VERSION_APP)}</span>`
  });

  hoja.el.querySelector('#cuenta-guardar').addEventListener('click', async () => {
    const nombre = hoja.el.querySelector('#cuenta-nombre').value.trim();
    if (!nombre) return;
    await guardarUsuario(ctx.user.uid, { nombre });
    await actualizarMiembro(ctx.equipo.id, ctx.user.uid, { nombre });
    aviso('Nombre guardado');
  });

  hoja.el.querySelector('#cuenta-salir').addEventListener('click', async () => {
    await signOut(auth);
    location.replace('/pages/login.html');
  });
}

export async function tokenActual() {
  const user = auth.currentUser;
  return user ? user.getIdToken() : '';
}
