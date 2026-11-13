/* =========================================================
   Vueltrack — Mi vehículo: datos para calcular el gasto
   ========================================================= */
import { iniciarPantalla } from './sesion.js';
import { actualizarMiembro, escucharVuelta } from './datos.js';
import { COMBUSTIBLES, costoDeRuta } from './vuelta.js';
import { fechaISO, formatoKm, formatoPlata, aviso } from './ui.js';

const $ = (id) => document.getElementById(id);
const fecha = fechaISO();
let ctx;
let vuelta = null;
let cargado = false;

ctx = await iniciarPantalla({
  pagina: 'vehiculo',
  alCambiarEquipo: (nuevo) => {
    ctx = nuevo;
  }
});

if (!ctx.fletero) {
  location.replace('/');
}

function marcar(nombre, valor) {
  const input = document.querySelector(`input[name="${nombre}"][value="${valor}"]`);
  if (input) input.checked = true;
}

function elegido(nombre) {
  const input = document.querySelector(`input[name="${nombre}"]:checked`);
  return input ? input.value : '';
}

function cargarDatos() {
  const g = ctx.yo.gasto || {};
  $('nombre').value = ctx.yo.vehiculo || '';
  marcar('tipo', g.tipo || 'utilitario');
  marcar('combustible', g.combustible || 'nafta');
  $('rinde').value = g.rinde ?? '';
  $('precio').value = g.precio ?? '';
  $('extra').value = g.extraKm ?? '';
  cargado = true;
}
cargarDatos();

function datosDelFormulario() {
  return {
    tipo: elegido('tipo'),
    combustible: elegido('combustible'),
    rinde: Number(String($('rinde').value).replace(',', '.')) || 0,
    precio: Number(String($('precio').value).replace(',', '.')) || 0,
    extraKm: Number(String($('extra').value).replace(',', '.')) || 0
  };
}

function actualizarEtiquetas() {
  const c = COMBUSTIBLES[elegido('combustible')] || COMBUSTIBLES.nafta;
  $('label-rinde').textContent = `Rinde (${c.rinde})`;
  $('label-precio').textContent = `Precio ($ por ${c.unidad})`;
}

function pintarResumen() {
  if (!cargado) return;
  actualizarEtiquetas();
  const gasto = datosDelFormulario();
  const cien = costoDeRuta(100000, gasto);
  const ruta = vuelta && vuelta.rutas ? vuelta.rutas[ctx.user.uid] : null;
  const hoy = ruta ? costoDeRuta(ruta.distancia, gasto) : null;
  if (!cien) {
    $('res-hoy').textContent = 'Completá cuánto rinde y el precio';
    $('res-100').textContent = '';
    return;
  }
  $('res-hoy').textContent = hoy
    ? `Hoy: ${formatoPlata(hoy.total)} (${formatoKm(ruta.distancia)})`
    : 'Hoy todavía no tenés vuelta';
  $('res-100').textContent = `Cada 100 km: ${formatoPlata(cien.total)}${
    cien.extra ? ` (${formatoPlata(cien.combustible)} de combustible + ${formatoPlata(cien.extra)} de otros gastos)` : ''
  }`;
}

escucharVuelta(ctx.equipo.id, fecha, (v) => {
  vuelta = v;
  pintarResumen();
});

$('form').addEventListener('input', pintarResumen);
$('form').addEventListener('change', pintarResumen);
pintarResumen();

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const gasto = datosDelFormulario();
  if (!(gasto.rinde > 0) || !(gasto.precio > 0)) {
    $('error').textContent = 'Completá cuánto rinde y el precio del combustible.';
    $('error').classList.remove('oculto');
    return;
  }
  $('error').classList.add('oculto');
  await actualizarMiembro(ctx.equipo.id, ctx.user.uid, {
    vehiculo: $('nombre').value.trim(),
    gasto
  });
  aviso('Vehículo guardado');
});
