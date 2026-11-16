/* =========================================================
   Vueltrack — Mi perfil
   Datos, tipo de perfil (independiente, organizador, fletero de
   equipo), rol, vehículo y cuenta, todo en un solo lugar.
   ========================================================= */
import { iniciarPantalla, PERFILES, abrirSeguridad } from './sesion.js';
import { guardarUsuario, actualizarMiembro, salirDelEquipo } from './datos.js';
import { auth } from './firebase.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { aviso, confirmar, esc } from './ui.js';

const $ = (id) => document.getElementById(id);
let ctx = await iniciarPantalla({
  pagina: 'perfil',
  alCambiarEquipo: (nuevo) => {
    ctx = nuevo;
    pintar();
  }
});

const iniciales = (nombre) =>
  String(nombre || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

const nombresOrganizadores = () =>
  Object.values(ctx.equipo.miembros || {})
    .filter((m) => (m.roles || []).includes('organizador'))
    .map((m) => m.nombre)
    .join(', ');

function pintar() {
  const nombre = ctx.yo.nombre || ctx.usuario.nombre || '';
  $('iniciales').textContent = iniciales(nombre);
  $('nombre-titulo').textContent = nombre || 'Mi perfil';
  $('correo').textContent = ctx.user.email || '';
  if (document.activeElement !== $('nombre')) $('nombre').value = nombre;
  if (document.activeElement !== $('telefono')) $('telefono').value = ctx.yo.telefono || '';

  // Tipo de perfil, bien a la vista
  const perfil = PERFILES[ctx.perfil];
  $('perfil-nombre').textContent = perfil.nombre;
  if (ctx.perfil === 'fletero-equipo') {
    $('perfil-texto').innerHTML = `Trabajás en <strong>${esc(ctx.equipo.nombre)}</strong>. Tu vuelta la organiza ${esc(
      nombresOrganizadores() || 'el organizador'
    )}: ves las paradas que te asignan y marcás cómo te fue, pero no podés cambiarlas, moverlas ni borrarlas.`;
    $('perfil-acciones').innerHTML =
      '<button type="button" class="btn btn-contorno" id="btn-independiente">Dejar el equipo y usar la app por mi cuenta</button>';
    $('btn-independiente').addEventListener('click', dejarEquipo);
  } else if (ctx.perfil === 'independiente') {
    $('perfil-texto').textContent = perfil.texto;
    $('perfil-acciones').innerHTML =
      '<a class="btn btn-contorno" href="/pages/equipo.html">Trabajar en equipo (asignar a fleteros)</a>';
  } else {
    $('perfil-texto').innerHTML = `${esc(perfil.texto)} Equipo: <strong>${esc(ctx.equipo.nombre)}</strong>.`;
    $('perfil-acciones').innerHTML = '<a class="btn btn-contorno" href="/pages/equipo.html">Integrantes y código para sumar fleteros</a>';
  }

  // Rol: lo cambia quien organiza (el fletero de equipo no puede)
  $('bloque-roles').classList.toggle('oculto', !ctx.organizador || ctx.equipo.modo === 'solo');
  $('rol-org').checked = ctx.organizador;
  $('rol-flet').checked = ctx.fletero;

  // Vehículo (solo si sale a repartir)
  $('bloque-vehiculo').classList.toggle('oculto', !ctx.fletero);
  const g = ctx.yo.gasto || {};
  $('vehiculo-nombre').textContent = ctx.yo.vehiculo || 'Cargá tu vehículo';
  $('vehiculo-detalle').textContent = [g.capacidad ? `${g.capacidad} bultos` : '', (g.vencimientos || []).length ? `${g.vencimientos.length} vencimientos` : '']
    .filter(Boolean)
    .join(' · ') || 'Capacidad, vencimientos y service';
}
pintar();

/* ---------- Datos ---------- */
let guardando = false;
$('form-datos').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (guardando) return;
  const nombre = $('nombre').value.trim();
  const telefono = $('telefono').value.trim();
  if (!nombre) {
    $('error-datos').textContent = 'Falta tu nombre.';
    $('error-datos').classList.remove('oculto');
    return;
  }
  $('error-datos').classList.add('oculto');
  guardando = true;
  $('btn-datos').disabled = true;
  try {
    await guardarUsuario(ctx.user.uid, { nombre });
    await actualizarMiembro(ctx.equipo.id, ctx.user.uid, { nombre, telefono });
    aviso('Datos guardados');
  } catch (err) {
    aviso('No se pudo guardar. Revisá la conexión.');
  } finally {
    guardando = false;
    $('btn-datos').disabled = false;
  }
});

/* ---------- Rol ---------- */
async function cambiarRol() {
  const organiza = $('rol-org').checked;
  const reparte = $('rol-flet').checked;
  const volver = () => {
    $('rol-org').checked = ctx.organizador;
    $('rol-flet').checked = ctx.fletero;
  };
  const otrosOrganizadores = Object.entries(ctx.equipo.miembros || {}).filter(
    ([uid, m]) => uid !== ctx.user.uid && (m.roles || []).includes('organizador')
  ).length;
  if (!organiza && !reparte) {
    aviso('Tenés que tener al menos un rol');
    volver();
    return;
  }
  if (!organiza && !otrosOrganizadores) {
    aviso('El equipo necesita al menos un organizador. Dale ese rol a otra persona primero (desde Equipo).');
    volver();
    return;
  }
  if (!organiza) {
    const ok = await confirmar({
      titulo: '¿Dejar de organizar?',
      texto: 'Vas a pasar a ser fletero de equipo: vas a ver solo tus paradas y no vas a poder cambiarlas.',
      aceptar: 'Dejar de organizar',
      peligro: true
    });
    if (!ok) {
      volver();
      return;
    }
  }
  const roles = [organiza ? 'organizador' : '', reparte ? 'fletero' : ''].filter(Boolean);
  await actualizarMiembro(ctx.equipo.id, ctx.user.uid, { roles });
  aviso('Rol actualizado');
}
$('rol-org').addEventListener('change', cambiarRol);
$('rol-flet').addEventListener('change', cambiarRol);

/* ---------- Dejar el equipo (fletero de equipo) ---------- */
async function dejarEquipo() {
  const ok = await confirmar({
    titulo: '¿Dejar el equipo?',
    texto: `Vas a dejar de recibir las paradas de ${ctx.equipo.nombre}. Después armás tu propio perfil para usar la app por tu cuenta.`,
    aceptar: 'Dejar el equipo',
    peligro: true
  });
  if (!ok) return;
  await salirDelEquipo(ctx.equipo.id, ctx.user.uid);
  location.replace('/pages/bienvenida.html');
}

/* ---------- Cuenta ---------- */
$('btn-seguridad').addEventListener('click', () => abrirSeguridad(ctx));
$('btn-cerrar').addEventListener('click', async () => {
  const ok = await confirmar({ titulo: '¿Cerrar sesión?', texto: 'Vas a tener que volver a ingresar.', aceptar: 'Cerrar sesión' });
  if (!ok) return;
  await signOut(auth);
  location.replace('/pages/login.html');
});
