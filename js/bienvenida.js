/* =========================================================
   Vueltrack — bienvenida (asistente paso a paso)
   Datos personales → modo de trabajo → zona → punto de salida
   → jornada → vehículo → listo.
   Quien se suma con código salta zona, salida y jornada
   (son del equipo).
   ========================================================= */
import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { obtenerUsuario, guardarUsuario, crearEquipo, unirseConCodigo, codigoValido } from './datos.js';
import { crearBuscador } from './buscador.js';
import { miUbicacion, direccionDe, definirZonaBusqueda } from './rutas.js';
import { htmlZona, conectarZona, textoZona } from './zona.js';
import { COMBUSTIBLES } from './vuelta.js';
import { instalarApp, estaInstalada } from './instalar.js';
import { esc } from './ui.js';

const $ = (id) => document.getElementById(id);
const FLUJOS = {
  solo: ['datos', 'modo', 'zona', 'salida', 'jornada', 'vehiculo', 'listo'],
  equipo: ['datos', 'modo', 'zona', 'salida', 'jornada', 'vehiculo', 'listo'],
  unirme: ['datos', 'modo', 'vehiculo', 'listo']
};
const OPCIONALES = ['salida', 'vehiculo'];

let user;
let modo = null;
let zona = null;
let base = null;
let indice = 0;
let guardado = false;

const flujo = () => FLUJOS[modo || 'solo'];
const pasoActual = () => flujo()[indice];

onAuthStateChanged(auth, async (u) => {
  if (!u) {
    location.replace('/pages/login.html');
    return;
  }
  user = u;
  const usuario = await obtenerUsuario(u.uid);
  if (usuario && usuario.equipoId) {
    location.replace('/');
    return;
  }
  const nombre = (usuario && usuario.nombre) || u.displayName || '';
  $('nombre').value = nombre;
  if (usuario && usuario.telefono) $('telefono').value = usuario.telefono;
  if (!usuario) await guardarUsuario(u.uid, { nombre, email: u.email || '', equipoId: null });
  mostrar();
});

/* ---------- Navegación entre pasos ---------- */

function mostrar() {
  const paso = pasoActual();
  document.querySelectorAll('.paso').forEach((s) => s.classList.toggle('oculto', s.dataset.paso !== paso));
  const total = flujo().length;
  $('paso-texto').textContent = paso === 'listo' ? 'Listo' : `Paso ${indice + 1} de ${total - 1}`;
  $('barra').style.width = `${Math.round(((indice + 1) / total) * 100)}%`;
  $('btn-atras').classList.toggle('oculto', indice === 0 || paso === 'listo');
  $('btn-saltar').classList.toggle('oculto', !OPCIONALES.includes(paso));
  $('btn-siguiente').textContent = paso === 'listo' ? 'Empezar' : paso === 'vehiculo' ? 'Terminar' : 'Continuar';
  error('');
  if (paso === 'listo') pintarResumen();
  window.scrollTo(0, 0);
}

function error(texto) {
  $('error').textContent = texto;
  $('error').classList.toggle('oculto', !texto);
}

async function validar(paso) {
  if (paso === 'datos' && !$('nombre').value.trim()) return 'Escribí tu nombre.';
  if (paso === 'modo') {
    if (!modo) return 'Elegí cómo vas a usar Vueltrack.';
    if (modo === 'equipo' && !$('nombre-equipo').value.trim()) return 'Escribí el nombre del equipo.';
    if (modo === 'unirme') {
      if (!$('codigo').value.trim()) return 'Escribí el código del equipo.';
      try {
        if (!(await codigoValido($('codigo').value))) return 'Ese código no existe. Revisalo con quien te lo pasó.';
      } catch (e) {
        return 'No se pudo verificar el código. Revisá la conexión.';
      }
    }
  }
  if (paso === 'zona' && !zona) return 'Elegí tu localidad de la lista.';
  return '';
}

async function siguiente() {
  const paso = pasoActual();
  if (paso === 'listo') {
    location.replace('/?guia=1');
    return;
  }
  const problema = await validar(paso);
  if (problema) {
    error(problema);
    return;
  }
  const proximo = flujo()[indice + 1];
  if (proximo === 'listo' && !guardado) {
    const ok = await guardarTodo();
    if (!ok) return;
  }
  indice++;
  mostrar();
}

$('btn-siguiente').addEventListener('click', siguiente);
$('btn-atras').addEventListener('click', () => {
  if (indice > 0) indice--;
  mostrar();
});
$('btn-saltar').addEventListener('click', async () => {
  if (pasoActual() === 'salida') base = null;
  if (pasoActual() === 'vehiculo') {
    $('vehiculo').value = '';
    $('rinde').value = '';
    $('precio').value = '';
  }
  const proximo = flujo()[indice + 1];
  if (proximo === 'listo' && !guardado && !(await guardarTodo())) return;
  indice++;
  mostrar();
});

/* ---------- Modo de trabajo ---------- */

document.querySelectorAll('[data-modo]').forEach((b) =>
  b.addEventListener('click', () => {
    modo = b.dataset.modo;
    document.querySelectorAll('[data-modo]').forEach((x) => x.classList.toggle('activo', x === b));
    $('campo-equipo').classList.toggle('oculto', modo !== 'equipo');
    $('campo-codigo').classList.toggle('oculto', modo !== 'unirme');
    (modo === 'equipo' ? $('nombre-equipo') : modo === 'unirme' ? $('codigo') : $('btn-siguiente')).focus();
    error('');
    mostrar();
  })
);

/* ---------- Zona ---------- */

$('zona-campos').innerHTML = htmlZona('ob');
conectarZona($('zona-campos'), 'ob', (l) => {
  zona = { localidad: l.localidad, partido: l.partido, provincia: l.provincia, lat: l.lat, lng: l.lng };
  definirZonaBusqueda(zona);
  error('');
});

/* ---------- Punto de salida ---------- */

function mostrarBase() {
  $('base-elegida').innerHTML = base
    ? `Salís desde <strong>${esc(base.direccion)}</strong>.`
    : 'La vuelta arranca acá y, si querés, termina acá. Lo podés cambiar cuando quieras.';
}

$('btn-base-aca').addEventListener('click', async () => {
  const boton = $('btn-base-aca');
  boton.disabled = true;
  try {
    const { lat, lng } = await miUbicacion();
    const direccion = await direccionDe(lat, lng);
    base = { direccion, lat, lng };
    $('base').value = direccion;
    mostrarBase();
  } catch (e) {
    $('base-elegida').textContent = 'No se pudo obtener tu ubicación. Revisá el permiso o buscá la dirección.';
  } finally {
    boton.disabled = false;
  }
});

crearBuscador($('base'), {
  foco: () => zona,
  alElegir: (r) => {
    const direccion = r.nombre ? [r.nombre, r.direccion].filter(Boolean).join(' · ') : r.direccion;
    base = { direccion, lat: r.lat, lng: r.lng };
    $('base').value = direccion;
    mostrarBase();
  }
});

/* ---------- Vehículo ---------- */

function etiquetasVehiculo() {
  const sel = document.querySelector('input[name="combustible"]:checked');
  const c = COMBUSTIBLES[sel ? sel.value : 'nafta'];
  document.querySelector('label[for="rinde"]').textContent = `Km por ${c.unidad}`;
  document.querySelector('label[for="precio"]').textContent = `Precio por ${c.unidad} ($)`;
}
document.querySelectorAll('input[name="combustible"]').forEach((i) => i.addEventListener('change', etiquetasVehiculo));

function datosVehiculo() {
  const rinde = Number(String($('rinde').value).replace(',', '.')) || 0;
  const precio = Number(String($('precio').value).replace(',', '.')) || 0;
  const combustible = (document.querySelector('input[name="combustible"]:checked') || {}).value || 'nafta';
  return {
    vehiculo: $('vehiculo').value.trim(),
    gasto: rinde > 0 && precio > 0 ? { tipo: 'utilitario', combustible, rinde, precio, extraKm: 0 } : null
  };
}

/* ---------- Guardar todo ---------- */

async function guardarTodo() {
  const boton = $('btn-siguiente');
  boton.disabled = true;
  const nombre = $('nombre').value.trim();
  const telefono = $('telefono').value.trim();
  const { vehiculo, gasto } = datosVehiculo();
  try {
    await guardarUsuario(user.uid, { nombre, telefono, onboardingCompleto: true });
    if (modo === 'unirme') {
      await unirseConCodigo({ uid: user.uid, nombre, codigo: $('codigo').value, telefono, vehiculo, gasto });
    } else {
      await crearEquipo({
        uid: user.uid,
        nombre,
        nombreEquipo: modo === 'equipo' ? $('nombre-equipo').value.trim() : `Vuelta de ${nombre}`,
        modo,
        base,
        zona,
        ajustes: {
          salida: $('hora-salida').value || '08:00',
          demora: Number($('demora').value),
          volver: $('volver').checked
        },
        telefono,
        vehiculo,
        gasto
      });
    }
    guardado = true;
    return true;
  } catch (e) {
    error(e.message === 'codigo-invalido' ? 'Ese código no existe.' : 'No se pudo guardar. Revisá la conexión y probá de nuevo.');
    return false;
  } finally {
    boton.disabled = false;
  }
}

/* ---------- Resumen final ---------- */

function pintarResumen() {
  const { vehiculo, gasto } = datosVehiculo();
  const filas = [['Nombre', $('nombre').value.trim()]];
  if (modo === 'unirme') {
    filas.push(['Equipo', 'Te sumaste con el código ' + $('codigo').value.trim().toUpperCase()]);
  } else {
    filas.push(['Modo', modo === 'equipo' ? `Equipo: ${$('nombre-equipo').value.trim()}` : 'Trabajo solo']);
    filas.push(['Zona', textoZona(zona)]);
    filas.push(['Punto de salida', base ? base.direccion : 'Lo cargás después']);
    filas.push(['Salida habitual', $('hora-salida').value]);
  }
  filas.push(['Vehículo', vehiculo || (gasto ? 'Cargado' : 'Lo cargás después')]);
  $('resumen').innerHTML = filas.map(([a, b]) => `<div class="fila"><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`).join('');
  $('listo-titulo').textContent = modo === 'equipo' ? '¡Tu equipo está listo!' : '¡Ya podés empezar!';
  $('aviso-instalar').classList.toggle('oculto', estaInstalada());
}

$('btn-instalar').addEventListener('click', instalarApp);
