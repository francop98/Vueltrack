/* =========================================================
   Vueltrack — Pantalla principal (menú)
   ========================================================= */
import { iniciarPantalla } from './sesion.js';
import { abrirGuia, guiaVista } from './guia.js';
import { instalarApp, sePuedeInstalar } from './instalar.js';
import { elegirZona } from './zona.js';
import { escucharVuelta, fleterosDelEquipo } from './datos.js';
import { gruposDeVuelta, resumen, paradasSinOrdenar, paradaHecha } from './vuelta.js';
import { alertasDelVehiculo, kmRecorridosDesde, tieneService } from './mantenimiento.js';
import {
  ICONOS,
  esc,
  fechaISO,
  fechaLarga,
  formatoKm,
  horaDeSegundos,
  linkGoogleMapsVuelta,
  PARADAS_POR_TRAMO
} from './ui.js';

const $ = (id) => document.getElementById(id);
const fecha = fechaISO();
let ctx;
let vuelta = null;

$('fecha').textContent = fechaLarga(fecha);

ctx = await iniciarPantalla({
  pagina: 'inicio',
  alCambiarEquipo: (nuevo) => {
    ctx = nuevo;
    pintar();
  }
});

/* Guía la primera vez (o si se pidió desde el onboarding) */
if (new URLSearchParams(location.search).get('guia') === '1' || !guiaVista(ctx)) {
  history.replaceState(null, '', '/');
  setTimeout(() => abrirGuia(ctx), 400);
}

/* Aviso para instalar la app */
function pintarInstalar() {
  let oculto = false;
  try {
    oculto = localStorage.getItem('vueltrack_aviso_instalar') === 'no';
  } catch (e) {
    oculto = false;
  }
  $('aviso-instalar').classList.toggle('oculto', oculto || !sePuedeInstalar());
}
pintarInstalar();
document.addEventListener('vueltrack:instalada', pintarInstalar);
$('btn-instalar').addEventListener('click', instalarApp);
$('btn-instalar-cerrar').addEventListener('click', () => {
  try {
    localStorage.setItem('vueltrack_aviso_instalar', 'no');
  } catch (e) {
    /* sin almacenamiento */
  }
  pintarInstalar();
});

escucharVuelta(ctx.equipo.id, fecha, (v) => {
  vuelta = v;
  pintar();
});

$('aviso-zona').addEventListener('click', () => elegirZona(ctx.equipo));

function pintar() {
  $('cargando').classList.add('oculto');
  window.dispatchEvent(new Event('vueltrack:listo'));
  $('aviso-zona').classList.toggle('oculto', !ctx.organizador || !!ctx.equipo.zona);
  const nombre = (ctx.yo.nombre || '').split(' ')[0];
  $('saludo').textContent = `Hola, ${nombre}`;
  $('equipo-nombre').textContent = ctx.equipo.modo === 'solo' ? 'Trabajás solo' : ctx.equipo.nombre;
  pintarResumen();
  pintarMosaico();
  pintarAlertas();
}

/* Vencimientos y service del vehículo */
let kmService = null;
async function pintarAlertas() {
  const caja = $('alertas');
  const gasto = ctx.yo.gasto;
  if (!ctx.fletero || !gasto) {
    caja.classList.add('oculto');
    return;
  }
  if (tieneService(gasto) && kmService === null) {
    kmService = await kmRecorridosDesde(ctx.equipo.id, ctx.user.uid, gasto.service.tableroFecha);
  }
  const alertas = alertasDelVehiculo(gasto, kmService || 0);
  caja.classList.toggle('oculto', !alertas.length);
  caja.innerHTML = alertas
    .map((a) => `<span class="alerta ${a.nivel}">${ICONOS.auto}<span>${esc(a.texto)}</span></span>`)
    .join('');
}

function grupoPropioOGeneral() {
  const fleteros = fleterosDelEquipo(ctx.equipo);
  const grupos = gruposDeVuelta(vuelta, fleteros);
  const propio = grupos.find((g) => g.uid === ctx.user.uid);
  return { grupos, propio };
}

function pintarResumen() {
  const caja = $('resumen');
  caja.classList.remove('oculto');
  const { grupos, propio } = grupoPropioOGeneral();

  if (!grupos.length) {
    const sinOrdenar = paradasSinOrdenar(vuelta).length;
    caja.innerHTML = `
      <span class="acento">La vuelta de hoy</span>
      <strong class="subtitulo" id="resumen-titulo">${
        sinOrdenar ? `Tenés ${sinOrdenar} paradas sin ordenar` : 'Todavía no hay vuelta para hoy'
      }</strong>
      ${
        ctx.organizador
          ? `<a class="btn btn-primario" href="/pages/armar.html">${ICONOS.armar}${sinOrdenar ? 'Seguir armando' : 'Armar la vuelta'}</a>`
          : '<span class="tenue">Cuando te asignen paradas, aparecen acá.</span>'
      }`;
    return;
  }

  if (propio) {
    const r = resumen([propio]);
    const pendientes = propio.paradas.filter((p) => !paradaHecha(p));
    const proxima = pendientes[0];
    const tramo = Math.min(pendientes.length, PARADAS_POR_TRAMO);
    caja.innerHTML = `
      <span class="acento">Tu vuelta de hoy · ${r.hechas} de ${r.paradas} hechas</span>
      <strong class="subtitulo" id="resumen-titulo">${
        proxima ? `Próxima: ${esc(proxima.nombre)}` : '¡Vuelta terminada!'
      }</strong>
      ${proxima ? `<span class="tenue">${esc(proxima.direccion)} · ${horaDeSegundos(proxima.llegada)}</span>` : ''}
      <div class="botonera">
        <a class="btn btn-oscuro" href="/pages/hoy.html">${ICONOS.ruta}Ver la vuelta</a>
        ${
          proxima
            ? `<a class="btn btn-primario" href="${linkGoogleMapsVuelta(pendientes)}" target="_blank" rel="noopener">${ICONOS.navegar}Navegar ${
                tramo > 1 ? `(${tramo} paradas)` : ''
              }</a>`
            : ''
        }
      </div>`;
    return;
  }

  const r = resumen(grupos);
  caja.innerHTML = `
    <span class="acento">La vuelta de hoy · ${grupos.length} ${grupos.length === 1 ? 'fletero' : 'fleteros'}</span>
    <strong class="subtitulo" id="resumen-titulo">${r.hechas} de ${r.paradas} paradas hechas</strong>
    <span class="tenue">${formatoKm(r.distancia)} en total${r.fin != null ? ` · terminan ${horaDeSegundos(r.fin)}` : ''}</span>
    <a class="btn btn-primario" href="/pages/hoy.html">${ICONOS.ruta}Ver la vuelta</a>`;
}

function baldosa({ href, icono, titulo, texto, id }) {
  if (id) {
    return `<button type="button" class="baldosa" id="${id}">${icono}<span><strong>${esc(titulo)}</strong><span>${esc(texto)}</span></span></button>`;
  }
  return `<a class="baldosa" href="${href}">${icono}<span><strong>${esc(titulo)}</strong><span>${esc(texto)}</span></span></a>`;
}

function pintarMosaico() {
  const varios = fleterosDelEquipo(ctx.equipo).length > 1;
  // Solo accesos que no están en la barra de abajo
  const items = [
    ctx.organizador && varios && { href: `/pages/repartir.html?fecha=${fecha}`, icono: ICONOS.equipo, titulo: 'Repartir', texto: 'Dividir entre fleteros' },
    ctx.organizador && ctx.fletero && { href: '/pages/manejo.html', icono: ICONOS.navegar, titulo: 'Modo manejo', texto: 'Una parada por vez' },
    ctx.fletero && { href: '/pages/vehiculo.html', icono: ICONOS.auto, titulo: 'Mi vehículo', texto: 'Vencimientos y service' },
    { href: '/pages/equipo.html', icono: ICONOS.equipo, titulo: ctx.equipo.modo === 'solo' ? 'Modo de trabajo' : 'Equipo', texto: ctx.equipo.modo === 'solo' ? 'Trabajo solo' : 'Integrantes y roles' }
  ].filter(Boolean);
  $('mosaico').innerHTML = items.map(baldosa).join('');
}
