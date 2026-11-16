/* =========================================================
   Vueltrack — Modo manejo
   Una sola parada por vez, con botones grandes para usar
   rápido en la calle. La pantalla queda encendida.
   ========================================================= */
import { iniciarPantalla } from './sesion.js';
import { escucharVuelta } from './datos.js';
import { paradasDe, paradaHecha, textoHorario } from './vuelta.js';
import { marcarEstado, elegirNoEntregado, conectarAviso } from './estados.js';
import { compartirSiCorresponde } from './enVivo.js';
import {
  ICONOS,
  esc,
  fechaISO,
  horaDeSegundos,
  segundosAhora,
  linkGoogleMaps,
  linkWaze,
  linkTel,
  linkGoogleMapsVuelta,
  PARADAS_POR_TRAMO,
  aviso
} from './ui.js';

const $ = (id) => document.getElementById(id);
const fecha = fechaISO();
let ctx;
let vuelta = null;
let ocupado = false;

ctx = await iniciarPantalla({ pagina: 'manejo' });
compartirSiCorresponde(ctx);

/* Mantener la pantalla encendida mientras se usa el modo manejo */
let bloqueo = null;
async function mantenerEncendida() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') bloqueo = await navigator.wakeLock.request('screen');
  } catch (e) {
    bloqueo = null;
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') mantenerEncendida();
});
mantenerEncendida();

escucharVuelta(ctx.equipo.id, fecha, (v) => {
  vuelta = v;
  pintar();
});

const misParadas = () => paradasDe(vuelta, ctx.user.uid);
const actual = () => misParadas().find((p) => !paradaHecha(p)) || null;

function pintar() {
  const suyas = misParadas();
  const p = actual();
  const hechas = suyas.filter(paradaHecha).length;

  $('progreso').innerHTML = suyas
    .map((x) => `<span class="${paradaHecha(x) ? 'hecho' : p && x.id === p.id ? 'actual' : ''}"></span>`)
    .join('');

  if (!suyas.length) {
    $('contexto').textContent = 'Modo manejo';
    $('cuerpo').innerHTML = `
      <div class="vacio manejo-fin">
        <strong>No tenés paradas para hoy</strong>
        <a class="btn btn-primario" href="/">Volver</a>
      </div>`;
    return;
  }

  if (!p) {
    $('contexto').textContent = `${hechas} de ${suyas.length} hechas`;
    $('cuerpo').innerHTML = `
      <div class="vacio manejo-fin">
        ${ICONOS.check}
        <strong>¡Vuelta terminada!</strong>
        <p>Hiciste las ${suyas.length} paradas de hoy.</p>
        <a class="btn btn-primario" href="/">Ver el resumen</a>
      </div>`;
    return;
  }

  const posicion = suyas.findIndex((x) => x.id === p.id) + 1;
  $('contexto').textContent = `Parada ${posicion} de ${suyas.length} · ${hechas} hechas`;
  const pendientes = suyas.filter((x) => !paradaHecha(x));
  const faltan = p.llegada != null ? Math.max(0, Math.round((p.llegada - segundosAhora()) / 60)) : null;
  const datos = [
    p.llegada != null ? `${horaDeSegundos(p.llegada)}${faltan ? ` · en ${faltan} min` : ''}` : '',
    textoHorario(p).replace(/^./, (c) => c.toUpperCase()),
    Number(p.bultos) > 1 ? `${p.bultos} bultos` : '',
    p.urgente ? 'Urgente' : ''
  ].filter(Boolean);
  const palabra = p.tipo === 'retiro' ? 'Retirado' : 'Entregado';

  $('cuerpo').innerHTML = `
    <section class="manejo-parada">
      <span class="tipo">${p.tipo === 'retiro' ? 'Retiro' : 'Entrega'}</span>
      <h1>${esc(p.nombre)}</h1>
      <span class="direccion">${esc(p.direccion)}</span>
      ${datos.length ? `<div class="manejo-datos">${datos.map((d) => `<span>${esc(d)}</span>`).join('')}</div>` : ''}
    </section>
    ${p.nota ? `<div class="manejo-nota">${esc(p.nota)}</div>` : ''}
    <div class="manejo-botones">
      <a class="btn btn-primario ancho" href="${linkGoogleMaps(p.lat, p.lng)}" target="_blank" rel="noopener">${ICONOS.navegar}Navegar</a>
      <a class="btn" href="${linkWaze(p.lat, p.lng)}" target="_blank" rel="noopener">Waze</a>
      ${
        pendientes.length > 1
          ? `<a class="btn" href="${linkGoogleMapsVuelta(pendientes)}" target="_blank" rel="noopener">Toda la vuelta${pendientes.length > PARADAS_POR_TRAMO ? ` (${PARADAS_POR_TRAMO})` : ''}</a>`
          : `<a class="btn" href="/pages/parada.html?id=${encodeURIComponent(p.id)}">Detalle</a>`
      }
      ${p.telefono ? `<a class="btn" href="${linkTel(p.telefono)}">${ICONOS.telefono}Llamar</a>` : ''}
      <a class="btn ${p.telefono ? '' : 'ancho'}" id="btn-avisar" href="#" target="_blank" rel="noopener">${ICONOS.mensaje}Avisar</a>
    </div>
    <div class="manejo-final">
      <button type="button" class="btn btn-ok btn-entregado" data-accion="entregado">${ICONOS.check}${palabra}</button>
      <button type="button" class="btn" data-accion="no">No se pudo</button>
      <a class="btn" href="/pages/parada.html?id=${encodeURIComponent(p.id)}">Foto o firma</a>
    </div>`;
  conectarAviso($('btn-avisar'), ctx, fecha, () => vuelta, actual);
}

$('cuerpo').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-accion]');
  const p = actual();
  if (!b || !p || ocupado) return;
  if (b.dataset.accion === 'no') {
    elegirNoEntregado(ctx, fecha, vuelta, p);
    return;
  }
  ocupado = true;
  b.disabled = true;
  try {
    await marcarEstado(ctx, fecha, p.id, 'entregado', { motivo: '' });
    aviso(`${p.tipo === 'retiro' ? 'Retirado' : 'Entregado'}: ${p.nombre}`);
    if (navigator.vibrate) navigator.vibrate(60);
  } catch (err) {
    aviso('No se pudo guardar. Se reintenta cuando vuelva la señal.');
    b.disabled = false;
  } finally {
    ocupado = false;
  }
});

window.addEventListener('pagehide', () => {
  if (bloqueo) bloqueo.release().catch(() => {});
});
