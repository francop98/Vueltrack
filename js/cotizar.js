/* =========================================================
   Vueltrack — Cotizar un flete
   Calcula km y tiempo con el mismo motor de rutas, suma el
   gasto del vehículo (combustible + amortización), tu hora
   de trabajo, peajes y la ganancia. Arma el presupuesto para
   mandar por WhatsApp o guardar en PDF.
   ========================================================= */
import { iniciarPantalla } from './sesion.js';
import { fleterosDelEquipo } from './datos.js';
import { crearBuscador } from './buscador.js';
import { optimizar } from './rutas.js';
import { costoDeRuta } from './vuelta.js';
import { mensajeError } from './ordenar.js';
import {
  ICONOS,
  esc,
  idNuevo,
  fechaISO,
  fechaLarga,
  formatoKm,
  formatoDuracion,
  formatoPlata,
  aviso,
  botonCargando
} from './ui.js';

const $ = (id) => document.getElementById(id);
const CLAVE = 'vueltrack_cotizar';
let ctx;
let origen = null;
let destinos = [];
let calculo = null;

ctx = await iniciarPantalla({ pagina: 'cotizar' });

/* Valores que se recuerdan en este celular */
function leerPreferencias() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) || '{}');
  } catch (e) {
    return {};
  }
}
function guardarPreferencias() {
  try {
    localStorage.setItem(
      CLAVE,
      JSON.stringify({ hora: $('hora').value, margen: $('margen').value, demora: $('demora').value, vehiculo: $('vehiculo').value })
    );
  } catch (e) {
    /* sin almacenamiento */
  }
}
const pref = leerPreferencias();
if (pref.hora) $('hora').value = pref.hora;
if (pref.margen) $('margen').value = pref.margen;
if (pref.demora) $('demora').value = pref.demora;

/* Vehículos: los fleteros del equipo con datos de gasto cargados */
const fleteros = fleterosDelEquipo(ctx.equipo);
$('vehiculo').innerHTML =
  fleteros
    .map(
      (f) =>
        `<option value="${esc(f.uid)}">${esc(f.vehiculo || 'Vehículo')} · ${esc(f.nombre)}${f.gasto && f.gasto.rinde ? '' : ' (sin datos de gasto)'}</option>`
    )
    .join('') || '<option value="">Sin vehículos cargados</option>';
$('vehiculo').value = pref.vehiculo && fleteros.some((f) => f.uid === pref.vehiculo) ? pref.vehiculo : fleteros.some((f) => f.uid === ctx.user.uid) ? ctx.user.uid : (fleteros[0] || {}).uid || '';

/* Origen: por defecto, el punto de salida del equipo */
if (ctx.equipo.base && ctx.equipo.base.lat != null) {
  origen = { ...ctx.equipo.base };
  $('origen').value = ctx.equipo.base.direccion || '';
}
crearBuscador($('origen'), {
  foco: () => ctx.equipo.base,
  alElegir: (r) => {
    origen = { direccion: r.direccion || r.nombre, lat: r.lat, lng: r.lng };
    $('origen').value = origen.direccion;
    invalidar();
  }
});

const buscadorDestino = crearBuscador($('destino'), {
  foco: () => origen || ctx.equipo.base,
  alElegir: (r) => {
    destinos.push({ id: idNuevo(), nombre: r.nombre || r.direccion, direccion: r.direccion || r.nombre, lat: r.lat, lng: r.lng });
    buscadorDestino.limpiar();
    pintarDestinos();
    invalidar();
  }
});

function pintarDestinos() {
  $('lista-destinos').classList.toggle('oculto', !destinos.length);
  $('lista-destinos').innerHTML = destinos
    .map(
      (d, i) => `
      <div class="fila">
        <span class="numero">${i + 1}</span>
        <span class="fila-cuerpo">
          <span class="fila-titulo-texto">${esc(d.nombre)}</span>
          <span class="fila-detalle">${esc(d.direccion)}</span>
        </span>
        <button type="button" class="btn-icono sin-borde btn-peligro" data-quitar="${esc(d.id)}" aria-label="Quitar ${esc(d.nombre)}">${ICONOS.cruz}</button>
      </div>`
    )
    .join('');
  $('btn-calcular').disabled = !destinos.length;
}
pintarDestinos();

$('lista-destinos').addEventListener('click', (e) => {
  const b = e.target.closest('[data-quitar]');
  if (!b) return;
  destinos = destinos.filter((d) => d.id !== b.dataset.quitar);
  pintarDestinos();
  invalidar();
});

function invalidar() {
  calculo = null;
  $('resultado').classList.add('oculto');
}
['volver', 'demora'].forEach((id) => $(id).addEventListener('change', invalidar));

/* ---------- Cálculo ---------- */

const numero = (id) => Math.max(0, Number(String($(id).value).replace(',', '.')) || 0);
const redondear = (valor) => Math.ceil(valor / 100) * 100;

function costos() {
  if (!calculo) return null;
  const f = fleteros.find((x) => x.uid === $('vehiculo').value);
  const vehiculo = costoDeRuta(calculo.distancia, f && f.gasto);
  const horas = calculo.duracion / 3600;
  const trabajo = horas * numero('hora');
  const otros = numero('otros');
  const subtotal = (vehiculo ? vehiculo.total : 0) + trabajo + otros;
  const ganancia = subtotal * (numero('margen') / 100);
  return {
    vehiculo,
    trabajo,
    horas,
    otros,
    subtotal,
    ganancia,
    sugerido: redondear(subtotal + ganancia),
    sinVehiculo: !vehiculo
  };
}

function pintarResultado() {
  const c = costos();
  if (!c) return;
  $('resultado').classList.remove('oculto');
  $('total').textContent = formatoPlata(c.sugerido);
  $('resumen').textContent = `${formatoKm(calculo.distancia)} · ${formatoDuracion(calculo.duracion)} con ${destinos.length} ${destinos.length === 1 ? 'destino' : 'destinos'}${$('volver').checked ? ' y vuelta' : ''}`;
  const filas = [
    c.vehiculo ? ['Combustible', c.vehiculo.combustible] : null,
    c.vehiculo && c.vehiculo.extra ? ['Amortización y mantenimiento', c.vehiculo.extra] : null,
    c.trabajo ? [`Tu tiempo (${c.horas.toFixed(1).replace('.', ',')} h)`, c.trabajo] : null,
    c.otros ? ['Peajes y otros', c.otros] : null,
    ['Costo total', c.subtotal, 'total'],
    c.ganancia ? [`Ganancia (${numero('margen')}%)`, c.ganancia] : null
  ].filter(Boolean);
  $('detalle').classList.add('detalle-costos');
  $('detalle').innerHTML =
    filas
      .map(([t, v, clase]) => `<div class="fila ${clase || ''}"><span>${esc(t)}</span><strong>${formatoPlata(v)}</strong></div>`)
      .join('') +
    (c.sinVehiculo
      ? '<div class="fila"><span class="texto-tenue">Ese vehículo no tiene cargado el rinde y el precio del combustible: el gasto no está sumado.</span></div>'
      : '');
  if (document.activeElement !== $('precio-final')) $('precio-final').value = c.sugerido;
  pintarPresupuesto();
}

['vehiculo', 'hora', 'otros', 'margen'].forEach((id) =>
  $(id).addEventListener('input', () => {
    guardarPreferencias();
    if (calculo) pintarResultado();
  })
);
$('vehiculo').addEventListener('change', () => {
  guardarPreferencias();
  if (calculo) pintarResultado();
});
['cliente', 'aclaracion', 'precio-final'].forEach((id) => $(id).addEventListener('input', pintarPresupuesto));

$('btn-calcular').addEventListener('click', async () => {
  $('error').classList.add('oculto');
  if (!origen) {
    $('error').textContent = 'Elegí desde dónde sale el flete.';
    $('error').classList.remove('oculto');
    return;
  }
  if (!destinos.length) return;
  guardarPreferencias();
  const boton = $('btn-calcular');
  const original = boton.innerHTML;
  botonCargando(boton, true);
  try {
    const uid = $('vehiculo').value || ctx.user.uid;
    const r = await optimizar({
      base: { lat: origen.lat, lng: origen.lng },
      volver: $('volver').checked,
      demora: numero('demora'),
      salida: 8 * 3600,
      vehiculos: [uid],
      modo: 'grupos',
      orden: 'optimo',
      paradas: destinos.map((d) => ({ id: d.id, lat: d.lat, lng: d.lng, vehiculo: uid, bultos: 0 }))
    });
    const ruta = (r.rutas || [])[0];
    if (!ruta) throw new Error('sin-ruta');
    calculo = { distancia: ruta.distancia || 0, duracion: ruta.duracion || 0 };
    // Los destinos quedan en el orden en que conviene recorrerlos
    const orden = new Map(ruta.paradas.map((p, i) => [p.id, i]));
    destinos.sort((a, b) => (orden.get(a.id) ?? 99) - (orden.get(b.id) ?? 99));
    pintarDestinos();
    pintarResultado();
    $('resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    aviso(mensajeError(e));
  } finally {
    botonCargando(boton, false, original);
  }
});

/* ---------- Presupuesto (WhatsApp y PDF) ---------- */

function precioFinal() {
  const c = costos();
  return numero('precio-final') || (c ? c.sugerido : 0);
}

function textoPresupuesto() {
  const cliente = $('cliente').value.trim();
  const aclaracion = $('aclaracion').value.trim();
  const recorrido = [origen ? origen.direccion : '', ...destinos.map((d) => d.direccion)];
  if ($('volver').checked && origen) recorrido.push(origen.direccion);
  return [
    `*Presupuesto de flete${ctx.equipo.modo !== 'solo' && ctx.equipo.nombre ? ` · ${ctx.equipo.nombre}` : ''}*`,
    cliente ? `Cliente: ${cliente}` : '',
    `Fecha: ${fechaLarga(fechaISO())}`,
    '',
    `Recorrido: ${recorrido.filter(Boolean).join(' → ')}`,
    calculo ? `Distancia aprox.: ${formatoKm(calculo.distancia)} · Tiempo aprox.: ${formatoDuracion(calculo.duracion)}` : '',
    aclaracion ? `\n${aclaracion}` : '',
    '',
    `*Precio: ${formatoPlata(precioFinal())}*`
  ]
    .filter((l, i, arr) => l !== '' || (arr[i - 1] !== '' && i > 0))
    .join('\n');
}

function pintarPresupuesto() {
  if (!calculo) return;
  const cliente = $('cliente').value.trim();
  const aclaracion = $('aclaracion').value.trim();
  $('presupuesto').innerHTML = `
    <span class="marca-pdf">${esc(ctx.equipo.modo !== 'solo' && ctx.equipo.nombre ? ctx.equipo.nombre : ctx.yo.nombre || 'Vueltrack')}</span>
    <h1>Presupuesto de flete</h1>
    <div class="tenue-pdf">${esc(fechaLarga(fechaISO()))}${cliente ? ` · Cliente: ${esc(cliente)}` : ''}</div>
    <h2>Recorrido</h2>
    <table>
      <tr><th>#</th><th>Lugar</th></tr>
      ${origen ? `<tr><td>Salida</td><td>${esc(origen.direccion)}</td></tr>` : ''}
      ${destinos.map((d, i) => `<tr><td>${i + 1}</td><td>${esc(d.nombre)}${d.nombre !== d.direccion ? ` · ${esc(d.direccion)}` : ''}</td></tr>`).join('')}
      ${$('volver').checked && origen ? `<tr><td>Regreso</td><td>${esc(origen.direccion)}</td></tr>` : ''}
    </table>
    <p class="tenue-pdf">Distancia aproximada: ${esc(formatoKm(calculo.distancia))} · Tiempo aproximado: ${esc(formatoDuracion(calculo.duracion))}</p>
    ${aclaracion ? `<h2>Aclaraciones</h2><p>${esc(aclaracion).replace(/\n/g, '<br>')}</p>` : ''}
    <div class="total-pdf">Precio: ${esc(formatoPlata(precioFinal()))}</div>`;
  $('btn-whatsapp').href = `https://wa.me/?text=${encodeURIComponent(textoPresupuesto())}`;
}

$('btn-whatsapp').addEventListener('click', () => {
  $('btn-whatsapp').href = `https://wa.me/?text=${encodeURIComponent(textoPresupuesto())}`;
});

$('btn-pdf').addEventListener('click', () => {
  pintarPresupuesto();
  const titulo = document.title;
  document.title = `Presupuesto ${$('cliente').value.trim() || 'flete'} ${fechaISO()}`;
  window.print();
  setTimeout(() => {
    document.title = titulo;
  }, 1000);
});
