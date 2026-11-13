/* =========================================================
   Vueltrack — bienvenida: trabajar solo, armar equipo o sumarse
   ========================================================= */
import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { obtenerUsuario, guardarUsuario, crearEquipo, unirseConCodigo } from './datos.js';
import { crearBuscador } from './buscador.js';
import { esc } from './ui.js';

const $ = (id) => document.getElementById(id);
let user;
let nombre = '';
let modo = 'solo';
let base = null;

onAuthStateChanged(auth, async (u) => {
  if (!u) {
    location.replace('login.html');
    return;
  }
  user = u;
  const usuario = await obtenerUsuario(u.uid);
  if (usuario && usuario.equipoId) {
    location.replace('index.html');
    return;
  }
  nombre = (usuario && usuario.nombre) || u.displayName || (u.email || 'Usuario').split('@')[0];
  if (!usuario) await guardarUsuario(u.uid, { nombre, email: u.email || '', equipoId: null });
  $('saludo').textContent = `¡Hola, ${nombre}!`;
});

function verPaso(id) {
  ['paso-modo', 'paso-datos', 'paso-codigo'].forEach((p) => $(p).classList.toggle('oculto', p !== id));
}

document.querySelectorAll('[data-modo]').forEach((b) =>
  b.addEventListener('click', () => {
    modo = b.dataset.modo;
    if (modo === 'unirme') {
      verPaso('paso-codigo');
      $('codigo').focus();
      return;
    }
    $('campo-equipo').classList.toggle('oculto', modo !== 'equipo');
    $('datos-sobre').textContent = modo === 'equipo' ? 'Tu equipo' : 'Último paso';
    verPaso('paso-datos');
  })
);

$('btn-volver-1').addEventListener('click', () => verPaso('paso-modo'));
$('btn-volver-2').addEventListener('click', () => verPaso('paso-modo'));

crearBuscador($('base'), {
  alElegir: (r) => {
    base = { direccion: r.direccion, lat: r.lat, lng: r.lng };
    $('base').value = r.direccion;
    $('base-elegida').innerHTML = `Salís desde <strong>${esc(r.direccion)}</strong>${r.detalle ? `, ${esc(r.detalle)}` : ''}.`;
  }
});

$('btn-empezar').addEventListener('click', async () => {
  const nombreEquipo = $('nombre-equipo').value.trim();
  if (modo === 'equipo' && !nombreEquipo) {
    $('error-datos').textContent = 'Ponele un nombre al equipo.';
    $('error-datos').classList.remove('oculto');
    return;
  }
  $('btn-empezar').disabled = true;
  try {
    await crearEquipo({
      uid: user.uid,
      nombre,
      nombreEquipo: modo === 'equipo' ? nombreEquipo : `Vuelta de ${nombre}`,
      modo,
      base
    });
    location.replace(modo === 'equipo' ? 'equipo.html' : 'armar.html');
  } catch (e) {
    $('error-datos').textContent = 'No se pudo crear. Revisá la conexión y probá de nuevo.';
    $('error-datos').classList.remove('oculto');
    $('btn-empezar').disabled = false;
  }
});

$('btn-sumarme').addEventListener('click', async () => {
  const codigo = $('codigo').value.trim();
  if (!codigo) return;
  $('btn-sumarme').disabled = true;
  try {
    await unirseConCodigo({ uid: user.uid, nombre, codigo });
    location.replace('index.html');
  } catch (e) {
    $('error-codigo').textContent =
      e.message === 'codigo-invalido' ? 'Ese código no existe. Revisalo con quien te lo pasó.' : 'No se pudo sumar. Probá de nuevo.';
    $('error-codigo').classList.remove('oculto');
    $('btn-sumarme').disabled = false;
  }
});
