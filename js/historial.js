/* =========================================================
   Vueltrack — Historial y resumen
   Km, tiempo y entregas por período y por fletero.
   Exporta el detalle a Excel (CSV) y el resumen a PDF.
   ========================================================= */
import { iniciarPantalla } from './sesion.js';
import { vueltasEntre, fleterosDelEquipo } from './datos.js';
import { textoResultado } from './estados.js';
import {
  esc,
  fechaISO,
  fechaDesdeISO,
  fechaCorta,
  fechaLarga,
  sumarDias,
  formatoKm,
  formatoDuracion,
  horaDeSegundos,
  aviso
} from './ui.js';

const $ = (id) => document.getElementById(id);
let ctx;
let rango = 'semana';
let fletero = null;
let vueltas = [];
let datos = null;

ctx = await iniciarPantalla({ pagina: 'historial' });
const fleteros = fleterosDelEquipo(ctx.equipo);
fletero = ctx.organizador ? 'todos' : ctx.user.uid;

/* ---------- Período ---------- */

function fechasDelRango() {
  const hoy = fechaISO();
  const f = fechaDesdeISO(hoy);
  if (rango === 'semana') {
    const desdeLunes = (f.getDay() + 6) % 7;
    return [sumarDias(hoy, -desdeLunes), hoy];
  }
  if (rango === 'mes') return [fechaISO(new Date(f.getFullYear(), f.getMonth(), 1)), hoy];
  if (rango === 'anterior') {
    return [fechaISO(new Date(f.getFullYear(), f.getMonth() - 1, 1)), fechaISO(new Date(f.getFullYear(), f.getMonth(), 0))];
  }
  return [$('desde').value || sumarDias(hoy, -30), $('hasta').value || hoy];
}

document.querySelectorAll('[data-rango]').forEach((b) =>
  b.addEventListener('click', () => {
    rango = b.dataset.rango;
    document.querySelectorAll('[data-rango]').forEach((x) => {
      x.classList.toggle('activo', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
    $('fechas').classList.toggle('oculto', rango !== 'elegir');
    if (rango === 'elegir' && !$('desde').value) {
      $('desde').value = sumarDias(fechaISO(), -30);
      $('hasta').value = fechaISO();
    }
    cargar();
  })
);
['desde', 'hasta'].forEach((id) => $(id).addEventListener('change', cargar));

/* ---------- Filtro por fletero (organizador) ---------- */

function pintarFiltro() {
  const caja = $('filtro-fletero');
  if (!ctx.organizador || fleteros.length < 2) {
    caja.classList.add('oculto');
    return;
  }
  caja.classList.remove('oculto');
  const opciones = [{ uid: 'todos', nombre: 'Todos' }, ...fleteros];
  caja.innerHTML = opciones
    .map(
      (o) =>
        `<button type="button" class="chip ${fletero === o.uid ? 'activo' : ''}" data-uid="${esc(o.uid)}" aria-pressed="${fletero === o.uid}">${
          o.color ? `<i class="punto" style="background:${esc(o.color)}"></i>` : ''
        }${esc(o.nombre)}</button>`
    )
    .join('');
}
$('filtro-fletero').addEventListener('click', (e) => {
  const b = e.target.closest('[data-uid]');
  if (!b) return;
  fletero = b.dataset.uid;
  pintarFiltro();
  calcular();
  pintar();
});
pintarFiltro();

/* ---------- Datos ---------- */

async function cargar() {
  const [desde, hasta] = fechasDelRango();
  $('rango-texto').textContent = desde === hasta ? fechaLarga(desde) : `${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
  $('cargando').classList.remove('oculto');
  try {
    vueltas = await vueltasEntre(ctx.equipo.id, desde, hasta);
  } catch (e) {
    vueltas = [];
    aviso('No se pudo cargar el historial. Revisá la conexión.');
  }
  $('cargando').classList.add('oculto');
  calcular();
  pintar();
}

function calcular() {
  const uids = fletero === 'todos' ? fleteros.map((f) => f.uid) : [fletero];
  const total = { dias: 0, paradas: 0, entregadas: 0, noEntregadas: 0, pendientes: 0, km: 0, tiempo: 0, motivos: {} };
  const dias = [];
  const detalle = [];

  vueltas.forEach((v) => {
    const paradas = (v.paradas || []).filter((p) => uids.includes(p.fleteroUid));
    let km = 0;
    let tiempo = 0;
    uids.forEach((uid) => {
      const r = v.rutas && v.rutas[uid];
      if (!r) return;
      km += r.distancia || 0;
      tiempo += r.duracion || 0;
    });
    if (!paradas.length && !km) return;
    const entregadas = paradas.filter((p) => p.estado === 'entregado').length;
    const noEntregadas = paradas.filter((p) => ['noEstaba', 'rechazado', 'reprogramado'].includes(p.estado)).length;
    paradas.forEach((p) => {
      if (p.motivo) {
        const clave = p.motivo.split(':')[0].trim();
        total.motivos[clave] = (total.motivos[clave] || 0) + 1;
      }
      const f = fleteros.find((x) => x.uid === p.fleteroUid);
      detalle.push({ fecha: v.fecha, fletero: f ? f.nombre : '', p });
    });
    dias.push({ fecha: v.fecha, paradas: paradas.length, entregadas, noEntregadas, km, tiempo });
    total.dias++;
    total.paradas += paradas.length;
    total.entregadas += entregadas;
    total.noEntregadas += noEntregadas;
    total.pendientes += paradas.length - entregadas - noEntregadas;
    total.km += km;
    total.tiempo += tiempo;
  });
  datos = { total, dias, detalle };
}

function pintar() {
  if (!datos) return;
  const t = datos.total;
  $('st-dias').textContent = t.dias;
  $('st-entregas').textContent = t.paradas ? `${t.entregadas}/${t.paradas}` : '0';
  $('st-km').textContent = formatoKm(t.km);
  $('st-tiempo').textContent = t.tiempo ? formatoDuracion(t.tiempo) : '—';

  const porcentaje = t.paradas ? Math.round((t.entregadas / t.paradas) * 100) : 0;
  const motivos = Object.entries(t.motivos)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m, n]) => `${m} (${n})`)
    .join(', ');
  $('efectividad').innerHTML = t.paradas
    ? `
      <span class="texto-tenue">Entregas con éxito</span>
      <strong class="subtitulo">${porcentaje}% · ${t.entregadas} de ${t.paradas}</strong>
      <span class="texto-tenue">${t.noEntregadas} no entregadas${t.pendientes ? ` · ${t.pendientes} sin marcar` : ''}</span>
      ${motivos ? `<span class="texto-tenue">Motivos más comunes: ${esc(motivos)}</span>` : ''}`
    : '<span class="texto-tenue">Sin entregas en este período.</span>';

  $('sin-datos').classList.toggle('oculto', datos.dias.length > 0);
  $('dias').classList.toggle('oculto', !datos.dias.length);
  $('dias').innerHTML = [...datos.dias]
    .reverse()
    .map(
      (d) => `
      <a class="fila dia-historial enlace-plano" href="/pages/hoja-ruta.html?fecha=${esc(d.fecha)}" aria-label="Hoja de ruta del ${esc(fechaLarga(d.fecha))}">
        <span class="numero ${d.paradas && d.entregadas === d.paradas ? 'ok' : ''}">${fechaDesdeISO(d.fecha).getDate()}</span>
        <span class="fila-cuerpo">
          <span class="fila-titulo-texto">${esc(fechaCorta(d.fecha))}</span>
          <span class="fila-detalle">${d.entregadas} de ${d.paradas} hechas · ${esc(formatoKm(d.km))} · ${esc(formatoDuracion(d.tiempo))}</span>
        </span>
        <span class="texto-tenue texto-chico">Hoja de ruta ›</span>
      </a>`
    )
    .join('');
  $('btn-excel').disabled = !datos.detalle.length;
  $('btn-pdf').disabled = !datos.dias.length;
}

/* ---------- Exportar ---------- */

function celda(valor) {
  const texto = String(valor ?? '');
  return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

$('btn-excel').addEventListener('click', () => {
  const [desde, hasta] = fechasDelRango();
  const encabezado = ['Fecha', 'Fletero', 'Orden', 'Tipo', 'Nombre', 'Dirección', 'Estado', 'Hora', 'Motivo', 'Bultos', 'Llegada estimada', 'Comprobante'];
  const filas = datos.detalle.map(({ fecha, fletero: nombre, p }) => [
    fecha,
    nombre,
    p.orden || '',
    p.tipo === 'retiro' ? 'Retiro' : 'Entrega',
    p.nombre,
    p.direccion,
    textoResultado(p) || 'pendiente',
    p.horaEstado || '',
    p.motivo || '',
    p.bultos ?? '',
    p.llegada != null ? horaDeSegundos(p.llegada) : '',
    p.comprobante ? 'Sí' : ''
  ]);
  // Punto y coma y BOM: Excel en español lo abre directo con tildes y columnas
  const csv = '﻿' + [encabezado, ...filas].map((f) => f.map(celda).join(';')).join('\r\n');
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  enlace.download = `vueltrack-historial-${desde}-a-${hasta}.csv`;
  document.body.appendChild(enlace);
  enlace.click();
  setTimeout(() => {
    URL.revokeObjectURL(enlace.href);
    enlace.remove();
  }, 1000);
});

$('btn-pdf').addEventListener('click', () => {
  const [desde, hasta] = fechasDelRango();
  const t = datos.total;
  const nombreFletero = fletero === 'todos' ? 'Todos los fleteros' : (fleteros.find((f) => f.uid === fletero) || {}).nombre || '';
  $('presupuesto').innerHTML = `
    <span class="marca-pdf">${esc(ctx.equipo.modo !== 'solo' && ctx.equipo.nombre ? ctx.equipo.nombre : 'Vueltrack')}</span>
    <h1>Resumen de vueltas</h1>
    <div class="tenue-pdf">${esc(fechaLarga(desde))} al ${esc(fechaLarga(hasta))} · ${esc(nombreFletero)}</div>
    <h2>Totales</h2>
    <table>
      <tr><td>Días trabajados</td><td class="num">${t.dias}</td></tr>
      <tr><td>Paradas</td><td class="num">${t.paradas}</td></tr>
      <tr><td>Entregadas</td><td class="num">${t.entregadas}</td></tr>
      <tr><td>No entregadas</td><td class="num">${t.noEntregadas}</td></tr>
      <tr><td>Recorrido</td><td class="num">${esc(formatoKm(t.km))}</td></tr>
      <tr><td>Tiempo en la calle</td><td class="num">${esc(formatoDuracion(t.tiempo))}</td></tr>
    </table>
    <h2>Por día</h2>
    <table>
      <tr><th>Día</th><th class="num">Entregadas</th><th class="num">Km</th><th class="num">Tiempo</th></tr>
      ${datos.dias
        .map(
          (d) =>
            `<tr><td>${esc(fechaCorta(d.fecha))}</td><td class="num">${d.entregadas}/${d.paradas}</td><td class="num">${esc(formatoKm(d.km))}</td><td class="num">${esc(formatoDuracion(d.tiempo))}</td></tr>`
        )
        .join('')}
    </table>
    `;
  const titulo = document.title;
  document.title = `Vueltrack resumen ${desde} a ${hasta}`;
  window.print();
  setTimeout(() => {
    document.title = titulo;
  }, 1000);
});

cargar();
