/* =========================================================
   Vueltrack — Parada (modo fletero, en la calle)
   ========================================================= */
import { iniciarPantalla } from './sesion.js';
import { escucharVuelta, cambiarParada, corregirUbicacionCliente, fleterosDelEquipo } from './datos.js';
import { paradasDe, paradaHecha, textoHorario } from './vuelta.js';
import { editarParada, confirmarQuitar } from './editarParada.js';
import { marcarEstado, elegirNoEntregado, pasarAlFinal, conectarAviso, textoResultado } from './estados.js';
import { pintarComprobante } from './comprobante.js';
import { recordarLugar } from './lugares.js';
import { compartirSiCorresponde } from './enVivo.js';
import {
  ICONOS,
  esc,
  fechaISO,
  horaDeSegundos,
  linkGoogleMaps,
  linkWaze,
  linkTel,
  linkGoogleMapsVuelta,
  PARADAS_POR_TRAMO,
  aviso,
  confirmar
} from './ui.js';

const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get('id');
const fecha = fechaISO();
let ctx;
let vuelta = null;
let ocupado = false;

ctx = await iniciarPantalla({ pagina: 'parada' });
compartirSiCorresponde(ctx);
let comprobanteDe = null;

escucharVuelta(ctx.equipo.id, fecha, (v) => {
  vuelta = v;
  pintar();
});

function laParada() {
  return ((vuelta && vuelta.paradas) || []).find((p) => p.id === id) || null;
}

function puedoMarcar(p) {
  return ctx.organizador || p.fleteroUid === ctx.user.uid;
}

function pintar() {
  const p = laParada();
  if (!p) {
    $('nombre').textContent = 'Esta parada ya no está en la vuelta';
    $('acciones').innerHTML = '<a class="btn btn-primario" href="/">Volver a la vuelta</a>';
    $('botones-estado').innerHTML = '';
    $('btn-ubicacion').classList.add('oculto');
    $('gestion').classList.add('oculto');
    return;
  }

  const fletero = fleterosDelEquipo(ctx.equipo).find((f) => f.uid === p.fleteroUid);
  const suyas = paradasDe(vuelta, p.fleteroUid);
  const posicion = suyas.findIndex((x) => x.id === p.id) + 1;
  const proxima = suyas.find((x) => !paradaHecha(x));

  $('contexto').textContent = `${fletero ? `Vuelta de ${fletero.nombre}` : 'Vuelta'} · parada ${posicion} de ${suyas.length}`;
  $('progreso').innerHTML = suyas
    .map((x) => `<span class="${paradaHecha(x) ? 'hecho' : proxima && x.id === proxima.id ? 'actual' : ''}"></span>`)
    .join('');
  $('nombre').textContent = p.nombre;
  $('direccion').textContent = p.direccion;
  document.title = `Vueltrack — ${p.nombre}`;

  const pastillas = [];
  if (p.tipo === 'retiro') pastillas.push('Retiro');
  if (p.llegada != null && !paradaHecha(p)) pastillas.push(`Llegás ${horaDeSegundos(p.llegada)}`);
  if (textoHorario(p)) pastillas.push(textoHorario(p).replace(/^./, (c) => c.toUpperCase()));
  if (Number(p.bultos) > 1) pastillas.push(`${p.bultos} bultos`);
  if (p.urgente) pastillas.push('Urgente');
  if (paradaHecha(p)) pastillas.push(textoResultado(p).replace(/^./, (c) => c.toUpperCase()));
  $('pastillas').innerHTML = pastillas.map((t) => `<span class="pastilla">${esc(t)}</span>`).join('');

  const desdeEsta = suyas.findIndex((x) => x.id === p.id);
  const restantes = paradaHecha(p) ? [] : suyas.slice(desdeEsta).filter((x) => !paradaHecha(x));
  $('acciones').innerHTML = `
    ${
      restantes.length > 1
        ? `<a class="btn btn-primario btn-grande celda-completa" href="${linkGoogleMapsVuelta(restantes)}" target="_blank" rel="noopener">${ICONOS.navegar}Navegar toda la vuelta desde acá${
            restantes.length > PARADAS_POR_TRAMO ? ` (${PARADAS_POR_TRAMO} de ${restantes.length})` : ''
          }</a>`
        : ''
    }
    <a class="btn ${restantes.length > 1 ? 'btn-contorno' : 'btn-primario'} btn-grande" href="${linkGoogleMaps(p.lat, p.lng)}" target="_blank" rel="noopener">${ICONOS.navegar}Solo esta</a>
    <a class="btn btn-contorno btn-grande" href="${linkWaze(p.lat, p.lng)}" target="_blank" rel="noopener">${ICONOS.navegar}Waze</a>
    ${p.telefono ? `<a class="btn" href="${linkTel(p.telefono)}">${ICONOS.telefono}Llamar</a>` : ''}
    ${paradaHecha(p) ? '' : `<a class="btn ${p.telefono ? '' : 'celda-completa'}" id="btn-avisar" href="#" target="_blank" rel="noopener">${ICONOS.mensaje}Avisar que voy</a>`}`;
  if (!paradaHecha(p)) conectarAviso($('btn-avisar'), ctx, fecha, () => vuelta, laParada);

  $('motivo').classList.toggle('oculto', !p.motivo);
  $('motivo-texto').textContent = p.motivo || '';

  $('nota').classList.toggle('oculto', !p.nota);
  $('nota-texto').textContent = p.nota || '';

  const siguiente = suyas.find((x) => !paradaHecha(x) && x.id !== p.id && (x.orden || 0) > (p.orden || 0)) || suyas.find((x) => !paradaHecha(x) && x.id !== p.id);
  if (siguiente) {
    $('siguiente').classList.remove('oculto');
    $('siguiente').href = `/pages/parada.html?id=${encodeURIComponent(siguiente.id)}`;
    $('siguiente').innerHTML = `
      <div class="botonera-texto">
        <span class="numero">${suyas.findIndex((x) => x.id === siguiente.id) + 1}</span>
        <span class="fila-cuerpo">
          <span class="fila-detalle">Después sigue</span>
          <span class="fila-titulo-texto">${esc(siguiente.nombre)} · ${esc(siguiente.direccion)}</span>
        </span>
        <strong class="texto-tenue">${siguiente.llegada != null ? horaDeSegundos(siguiente.llegada) : ''}</strong>
      </div>`;
  } else {
    $('siguiente').classList.add('oculto');
  }

  $('gestion').classList.toggle('oculto', !ctx.organizador);

  const puede = puedoMarcar(p);
  $('btn-ubicacion').classList.toggle('oculto', !puede);
  const palabra = p.tipo === 'retiro' ? 'Retirado' : 'Entregado';
  if (!puede) {
    $('botones-estado').innerHTML = '';
  } else if (paradaHecha(p)) {
    $('botones-estado').innerHTML =
      p.estado === 'reprogramado'
        ? `<span class="texto-tenue">Ya se sumó pendiente a la vuelta de ese día.</span>`
        : `<button type="button" class="btn" data-accion="deshacer">Volver a dejarla pendiente</button>`;
  } else {
    $('botones-estado').innerHTML = `
      <button type="button" class="btn btn-ok btn-grande" data-accion="entregado">${ICONOS.check}${palabra}</button>
      <div class="grilla-2">
        <button type="button" class="btn" data-accion="no">${p.tipo === 'retiro' ? 'No se pudo retirar' : 'No se pudo entregar'}</button>
        <button type="button" class="btn" data-accion="final">Pasar para el final</button>
      </div>`;
  }

  // Comprobante: se pinta una sola vez por parada (para no recargar la foto con cada cambio)
  if (comprobanteDe !== `${p.id}:${p.comprobante ? 1 : 0}:${p.estado}`) {
    comprobanteDe = `${p.id}:${p.comprobante ? 1 : 0}:${p.estado}`;
    pintarComprobante($('comprobante'), { ctx, fecha, parada: { ...p }, puedeCargar: puede && p.estado === 'entregado' });
  }
}

function irALaSiguiente() {
  const p = laParada();
  const pendiente = paradasDe(vuelta, p ? p.fleteroUid : ctx.user.uid).find((x) => !paradaHecha(x) && x.id !== id);
  location.href = pendiente ? `/pages/parada.html?id=${encodeURIComponent(pendiente.id)}` : '/';
}

$('botones-estado').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-accion]');
  if (!b || ocupado) return;
  const accion = b.dataset.accion;
  const p = laParada();
  if (!p) return;
  if (accion === 'no') {
    elegirNoEntregado(ctx, fecha, vuelta, p, () => setTimeout(irALaSiguiente, 500));
    return;
  }
  ocupado = true;
  try {
    if (accion === 'entregado') {
      await marcarEstado(ctx, fecha, id, 'entregado', { motivo: '' });
      aviso(p.tipo === 'retiro' ? 'Retirado' : 'Entregado');
    } else if (accion === 'final') {
      await pasarAlFinal(ctx, fecha, id);
      aviso('La pasaste para el final');
      setTimeout(irALaSiguiente, 500);
    } else if (accion === 'deshacer') {
      await marcarEstado(ctx, fecha, id, 'pendiente', { motivo: '' });
    }
  } catch (err) {
    aviso('No se pudo guardar. Se reintenta cuando vuelva la señal.');
  } finally {
    ocupado = false;
  }
});

$('btn-ubicacion').addEventListener('click', async () => {
  const p = laParada();
  if (!p || !navigator.geolocation) {
    aviso('Este celular no permite usar la ubicación');
    return;
  }
  const ok = await confirmar({
    titulo: '¿Guardar tu ubicación actual?',
    texto: `Usalo parado en la puerta de ${p.nombre}. La próxima vez el pin va a caer acá.`,
    aceptar: 'Guardar ubicación'
  });
  if (!ok) return;
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      await cambiarParada(ctx.equipo.id, fecha, id, (paradas, i) => {
        if (i >= 0) paradas[i] = { ...paradas[i], lat, lng };
        return paradas;
      });
      if (p.clienteId) await corregirUbicacionCliente(ctx.equipo.id, p.clienteId, lat, lng);
      recordarLugar({ texto: p.direccion, nombre: p.clienteId ? '' : p.nombre, direccion: p.direccion, lat, lng });
      aviso('Ubicación guardada');
    },
    () => aviso('No se pudo obtener la ubicación. Revisá el permiso de ubicación.'),
    { enableHighAccuracy: true, timeout: 15000 }
  );
});

/* ---------- Editar o eliminar el destino (organizador) ---------- */

$('btn-editar').addEventListener('click', () => {
  const p = laParada();
  if (!p) return;
  editarParada({
    parada: p,
    equipo: ctx.equipo,
    ordenada: true,
    otras: (vuelta && vuelta.paradas) || [],
    guardar: (cambios) =>
      cambiarParada(ctx.equipo.id, fecha, id, (paradas, i) => {
        if (i >= 0) paradas[i] = { ...paradas[i], ...cambios };
        return paradas;
      }),
    quitar: async () => {
      await cambiarParada(ctx.equipo.id, fecha, id, (paradas) => paradas.filter((x) => x.id !== id));
      location.href = '/';
    }
  });
});

$('btn-eliminar').addEventListener('click', async () => {
  const p = laParada();
  if (!p || !(await confirmarQuitar(p))) return;
  await cambiarParada(ctx.equipo.id, fecha, id, (paradas) => paradas.filter((x) => x.id !== id));
  aviso('Destino eliminado');
  location.href = '/';
});
