/* =========================================================
   Vueltrack — Mi vehículo: datos para calcular el gasto
   ========================================================= */
import { iniciarPantalla } from './sesion.js';
import { actualizarMiembro, escucharVuelta } from './datos.js';
import { COMBUSTIBLES, costoDeRuta } from './vuelta.js';
import { rindeSugerido, kmAnualesSugeridos, calcularAmortizacion } from './consumos.js';
import { TIPOS_VENCIMIENTO, diasHasta, estadoService, kmRecorridosDesde, tieneService } from './mantenimiento.js';
import { fechaISO, fechaLarga, formatoKm, formatoPlata, aviso, abrirHoja, esc, idNuevo, confirmar, ordenarAlfa, ICONOS } from './ui.js';

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
  $('capacidad').value = g.capacidad || '';
  pintarFechaPrecio(g.precioFecha);
  cargado = true;
}

function pintarFechaPrecio(iso) {
  if (!iso) return;
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  const cuando = dias <= 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`;
  $('precio-fecha').textContent = `Precio actualizado ${cuando}. Actualizalo cuando cambie.`;
}
cargarDatos();

function datosDelFormulario() {
  const anterior = ctx.yo.gasto || {};
  return {
    ...anterior,
    amort: anterior.amort || null,
    precioFecha: anterior.precioFecha || null,
    capacidad: Math.max(0, Math.round(Number($('capacidad').value) || 0)) || null,
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

/* ---------- Rinde sugerido según modelo, tipo y combustible ---------- */
let sugerido = null;

function pintarSugerencia() {
  sugerido = rindeSugerido({
    nombre: $('nombre').value,
    tipo: elegido('tipo'),
    combustible: elegido('combustible')
  });
  const c = COMBUSTIBLES[elegido('combustible')] || COMBUSTIBLES.nafta;
  const actual = Number(String($('rinde').value).replace(',', '.')) || 0;
  if (!sugerido || actual === sugerido.valor) {
    $('sug-rinde').classList.add('oculto');
    return;
  }
  $('sug-rinde-texto').textContent = `Rinde aproximado (${sugerido.origen}): ${String(sugerido.valor).replace('.', ',')} ${c.rinde}`;
  $('sug-rinde').classList.remove('oculto');
}

$('usar-rinde').addEventListener('click', () => {
  if (!sugerido) return;
  $('rinde').value = sugerido.valor;
  pintarResumen();
});

/* ---------- Calculadora de amortización ---------- */
$('btn-amortizacion').addEventListener('click', () => {
  const previo = (ctx.yo.gasto && ctx.yo.gasto.amort) || {};
  const tipo = elegido('tipo');
  const hoja = abrirHoja({
    titulo: 'Calcular amortización',
    html: `
      <p class="texto-tenue">Calcula cuánto pierde de valor tu vehículo y cuánto gastás en mantenerlo por cada km recorrido.</p>
      <div class="campo">
        <label for="am-valor">Valor actual del vehículo ($)</label>
        <input id="am-valor" type="number" inputmode="decimal" min="0" step="1000" placeholder="0" value="${esc(previo.valor ?? '')}">
      </div>
      <div class="grilla-2 siempre">
        <div class="campo">
          <label for="am-anios">Años que pensás usarlo</label>
          <input id="am-anios" type="number" inputmode="decimal" min="1" step="1" value="${esc(previo.anios ?? 5)}">
        </div>
        <div class="campo">
          <label for="am-reventa">Valor de reventa (%)</label>
          <input id="am-reventa" type="number" inputmode="decimal" min="0" max="100" step="1" value="${esc(previo.reventa ?? 40)}">
        </div>
      </div>
      <div class="campo">
        <label for="am-km">Km que hacés por año</label>
        <input id="am-km" type="number" inputmode="decimal" min="0" step="1000" value="${esc(previo.kmAnio ?? kmAnualesSugeridos(tipo))}">
      </div>
      <div class="campo">
        <label for="am-mant">Gasto anual en service, cubiertas, seguro y patente ($, opcional)</label>
        <input id="am-mant" type="number" inputmode="decimal" min="0" step="1000" placeholder="0" value="${esc(previo.mantenimiento ?? '')}">
      </div>
      <div class="resultado-calculo" id="am-resultado">
        <span class="texto-tenue">Por km</span>
        <strong id="am-total">Completá el valor del vehículo</strong>
        <span class="texto-tenue" id="am-detalle"></span>
      </div>
      <button type="button" class="btn btn-primario btn-grande" id="am-usar" disabled>Usar este valor</button>`
  });
  const q = (id) => hoja.el.querySelector(`#${id}`);
  const leer = () => ({
    valor: Number(q('am-valor').value) || 0,
    anios: Number(q('am-anios').value) || 0,
    reventa: Number(q('am-reventa').value) || 0,
    kmAnio: Number(q('am-km').value) || 0,
    mantenimiento: Number(q('am-mant').value) || 0
  });
  let resultado = null;
  const recalcular = () => {
    resultado = calcularAmortizacion(leer());
    q('am-usar').disabled = !resultado;
    if (!resultado) {
      q('am-total').textContent = 'Completá el valor del vehículo';
      q('am-detalle').textContent = '';
      return;
    }
    q('am-total').textContent = `${formatoPlata(resultado.totalKm)} por km`;
    q('am-detalle').textContent = `${formatoPlata(resultado.amortizacionKm)} de amortización + ${formatoPlata(resultado.mantenimientoKm)} de mantenimiento`;
  };
  hoja.el.addEventListener('input', recalcular);
  recalcular();
  q('am-usar').addEventListener('click', async () => {
    if (!resultado) return;
    $('extra').value = resultado.totalKm;
    const gasto = { ...datosDelFormulario(), amort: leer() };
    hoja.cerrar();
    pintarResumen();
    if (gasto.rinde > 0 && gasto.precio > 0) {
      await guardar(gasto);
    } else {
      ctx.yo.gasto = { ...(ctx.yo.gasto || {}), amort: gasto.amort };
      aviso('Completá el rinde y el precio, y guardá el vehículo');
    }
  });
});

function pintarResumen() {
  if (!cargado) return;
  actualizarEtiquetas();
  pintarSugerencia();
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
    cien.extra ? ` (${formatoPlata(cien.combustible)} de combustible + ${formatoPlata(cien.extra)} de amortización y mantenimiento)` : ''
  }`;
}

escucharVuelta(ctx.equipo.id, fecha, (v) => {
  vuelta = v;
  pintarResumen();
});

$('form').addEventListener('input', pintarResumen);
$('form').addEventListener('change', pintarResumen);
pintarResumen();

async function guardar(gasto) {
  const anterior = ctx.yo.gasto || {};
  if (gasto.precio !== Number(anterior.precio) || !gasto.precioFecha) {
    gasto.precioFecha = new Date().toISOString();
  }
  await actualizarMiembro(ctx.equipo.id, ctx.user.uid, {
    vehiculo: $('nombre').value.trim(),
    gasto
  });
  ctx.yo.gasto = gasto;
  pintarFechaPrecio(gasto.precioFecha);
  aviso('Vehículo guardado');
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const gasto = datosDelFormulario();
  if (!(gasto.rinde > 0) || !(gasto.precio > 0)) {
    $('error').textContent = 'Completá cuánto rinde y el precio del combustible.';
    $('error').classList.remove('oculto');
    return;
  }
  $('error').classList.add('oculto');
  await guardar(gasto);
});

/* ---------- Vencimientos ---------- */

async function guardarMantenimiento(cambios) {
  const gasto = { ...(ctx.yo.gasto || {}), ...cambios };
  await actualizarMiembro(ctx.equipo.id, ctx.user.uid, { gasto });
  ctx.yo.gasto = gasto;
  pintarVencimientos();
  pintarService();
}

function pintarVencimientos() {
  const lista = ordenarAlfa((ctx.yo.gasto || {}).vencimientos || []);
  $('sin-vencimientos').classList.toggle('oculto', lista.length > 0);
  $('lista-vencimientos').classList.toggle('oculto', !lista.length);
  $('lista-vencimientos').innerHTML = lista
    .map((v) => {
      const dias = diasHasta(v.fecha);
      const estado = dias < 0 ? 'Vencido' : dias === 0 ? 'Vence hoy' : `Faltan ${dias} ${dias === 1 ? 'día' : 'días'}`;
      const clase = dias <= 0 ? 'no' : dias <= 15 ? 'retiro' : 'ok';
      return `
      <div class="fila">
        <button type="button" class="fila enlace-plano sin-padding" data-vencimiento="${esc(v.id)}">
          <span class="numero ${clase}">${dias <= 15 ? '!' : ICONOS.check}</span>
          <span class="fila-cuerpo">
            <span class="fila-titulo-texto">${esc(v.nombre)}</span>
            <span class="fila-detalle">${esc(fechaLarga(v.fecha))} · ${esc(estado)}</span>
          </span>
        </button>
        <button type="button" class="btn-icono sin-borde btn-peligro" data-borrar-vencimiento="${esc(v.id)}" aria-label="Eliminar ${esc(v.nombre)}">${ICONOS.basura}</button>
      </div>`;
    })
    .join('');
}

function editarVencimiento(v) {
  const actual = v || { id: idNuevo(), nombre: 'VTV', fecha: '' };
  const conocido = TIPOS_VENCIMIENTO.includes(actual.nombre);
  const hoja = abrirHoja({
    titulo: v ? 'Editar vencimiento' : 'Nuevo vencimiento',
    html: `
      <div class="campo">
        <label for="vt-tipo">Qué vence</label>
        <select id="vt-tipo" class="input">
          ${TIPOS_VENCIMIENTO.map((t) => `<option value="${esc(t)}" ${(conocido ? actual.nombre : 'Otro') === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
        </select>
      </div>
      <div class="campo ${conocido && actual.nombre !== 'Otro' ? 'oculto' : ''}" id="vt-otro-caja">
        <label for="vt-otro">Nombre</label>
        <input id="vt-otro" value="${conocido ? '' : esc(actual.nombre)}" placeholder="Ej.: habilitación municipal">
      </div>
      <div class="campo">
        <label for="vt-fecha">Fecha de vencimiento</label>
        <input type="date" id="vt-fecha" class="input" value="${esc(actual.fecha)}">
      </div>
      <button type="button" class="btn btn-primario btn-grande" id="vt-guardar">Guardar</button>`
  });
  const el = hoja.el;
  el.querySelector('#vt-tipo').addEventListener('change', (e) => el.querySelector('#vt-otro-caja').classList.toggle('oculto', e.target.value !== 'Otro'));
  el.querySelector('#vt-guardar').addEventListener('click', async () => {
    const tipo = el.querySelector('#vt-tipo').value;
    const nombre = tipo === 'Otro' ? el.querySelector('#vt-otro').value.trim() || 'Otro' : tipo;
    const fecha = el.querySelector('#vt-fecha').value;
    if (!fecha) {
      aviso('Falta la fecha');
      return;
    }
    const lista = ((ctx.yo.gasto || {}).vencimientos || []).filter((x) => x.id !== actual.id);
    await guardarMantenimiento({ vencimientos: [...lista, { id: actual.id, nombre, fecha }] });
    hoja.cerrar();
    aviso('Vencimiento guardado');
  });
}

$('btn-vencimiento').addEventListener('click', () => editarVencimiento(null));
$('lista-vencimientos').addEventListener('click', async (e) => {
  const lista = (ctx.yo.gasto || {}).vencimientos || [];
  const borrar = e.target.closest('[data-borrar-vencimiento]');
  if (borrar) {
    const v = lista.find((x) => x.id === borrar.dataset.borrarVencimiento);
    if (!v) return;
    const ok = await confirmar({ titulo: '¿Eliminar este vencimiento?', texto: `${v.nombre} · ${fechaLarga(v.fecha)}`, aceptar: 'Eliminar', peligro: true });
    if (!ok) return;
    await guardarMantenimiento({ vencimientos: lista.filter((x) => x.id !== v.id) });
    aviso('Vencimiento eliminado');
    return;
  }
  const b = e.target.closest('[data-vencimiento]');
  if (b) editarVencimiento(lista.find((x) => x.id === b.dataset.vencimiento));
});

/* ---------- Service por km ---------- */

let kmDesdeTablero = 0;
async function pintarService() {
  const gasto = ctx.yo.gasto || {};
  const caja = $('estado-service');
  if (!tieneService(gasto)) {
    caja.innerHTML = '<span class="texto-tenue">Cargá cada cuántos km hacés el service y te avisamos cuando se acerque, sumando los km de tus vueltas.</span>';
    $('btn-service').textContent = 'Cargar datos del service';
    return;
  }
  kmDesdeTablero = await kmRecorridosDesde(ctx.equipo.id, ctx.user.uid, gasto.service.tableroFecha);
  const s = estadoService(gasto, kmDesdeTablero);
  caja.innerHTML = `
    <span class="texto-tenue">Próximo service a los ${s.proximo.toLocaleString('es-AR')} km</span>
    <strong class="subtitulo">${s.faltan > 0 ? `Faltan unos ${s.faltan.toLocaleString('es-AR')} km` : `Atrasado unos ${Math.abs(s.faltan).toLocaleString('es-AR')} km`}</strong>
    <span class="texto-tenue">Tablero estimado: ${s.tablero.toLocaleString('es-AR')} km (actualizalo de vez en cuando)</span>`;
  $('btn-service').textContent = 'Actualizar km o service';
}

$('btn-service').addEventListener('click', () => {
  const s = (ctx.yo.gasto || {}).service || {};
  const estimado = estadoService(ctx.yo.gasto, kmDesdeTablero);
  const hoja = abrirHoja({
    titulo: 'Service del vehículo',
    html: `
      <div class="campo">
        <label for="sv-tablero">Km que marca hoy el tablero</label>
        <input id="sv-tablero" type="number" inputmode="numeric" min="0" step="1" value="${esc(estimado ? estimado.tablero : s.tableroKm || '')}" placeholder="Ej.: 85000">
      </div>
      <div class="grilla-2 siempre">
        <div class="campo">
          <label for="sv-ultimo">Km del último service</label>
          <input id="sv-ultimo" type="number" inputmode="numeric" min="0" step="1" value="${esc(s.ultimoKm ?? '')}" placeholder="Ej.: 80000">
        </div>
        <div class="campo">
          <label for="sv-cada">Cada cuántos km</label>
          <input id="sv-cada" type="number" inputmode="numeric" min="0" step="500" value="${esc(s.cadaKm || 10000)}">
        </div>
      </div>
      <button type="button" class="btn btn-contorno" id="sv-hoy">Hice el service hoy</button>
      <button type="button" class="btn btn-primario btn-grande" id="sv-guardar">Guardar</button>`
  });
  const el = hoja.el;
  el.querySelector('#sv-hoy').addEventListener('click', () => {
    el.querySelector('#sv-ultimo').value = el.querySelector('#sv-tablero').value;
  });
  el.querySelector('#sv-guardar').addEventListener('click', async () => {
    const tableroKm = Number(el.querySelector('#sv-tablero').value) || 0;
    const ultimoKm = Number(el.querySelector('#sv-ultimo').value);
    const cadaKm = Number(el.querySelector('#sv-cada').value) || 0;
    if (!(tableroKm > 0) || !(cadaKm > 0) || !Number.isFinite(ultimoKm)) {
      aviso('Completá los km del tablero, del último service y cada cuántos km');
      return;
    }
    await guardarMantenimiento({ service: { tableroKm, ultimoKm, cadaKm, tableroFecha: fechaISO() } });
    hoja.cerrar();
    aviso('Service guardado');
  });
});

pintarVencimientos();
pintarService();
