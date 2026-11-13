/* =========================================================
   Vueltrack — Parada (modo fletero, en la calle)
   ========================================================= */
import { iniciarPantalla } from './sesion.js';
import { escucharVuelta, cambiarParada, corregirUbicacionCliente, fleterosDelEquipo } from './datos.js';
import { paradasDe, paradaHecha } from './vuelta.js';
import {
  ICONOS,
  esc,
  fechaISO,
  horaDeSegundos,
  segundosAhora,
  linkGoogleMaps,
  linkWaze,
  linkTel,
  linkWhatsApp,
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

function horaAhora() {
  return horaDeSegundos(segundosAhora());
}

function pintar() {
  const p = laParada();
  if (!p) {
    $('nombre').textContent = 'Esta parada ya no está en la vuelta';
    $('acciones').innerHTML = '<a class="btn btn-primario" href="index.html">Volver a la vuelta</a>';
    $('botones-estado').innerHTML = '';
    $('btn-ubicacion').classList.add('oculto');
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
  if (p.llegada != null && !paradaHecha(p)) pastillas.push(`Llegás ${horaDeSegundos(p.llegada)}`);
  if (p.hasta) pastillas.push(`Recibe hasta ${p.hasta}`);
  if (p.urgente) pastillas.push('Urgente');
  if (p.estado === 'entregado') pastillas.push(`Entregado ${p.horaEstado || ''}`);
  if (p.estado === 'noEstaba') pastillas.push(`No estaba (${p.horaEstado || ''})`);
  $('pastillas').innerHTML = pastillas.map((t) => `<span class="pastilla">${esc(t)}</span>`).join('');

  const faltan = p.llegada != null ? Math.max(0, Math.round((p.llegada - segundosAhora()) / 60)) : null;
  const mensaje = `¡Hola! Soy ${ctx.yo.nombre} de ${ctx.equipo.nombre}. Estoy llegando${faltan ? ` en unos ${faltan} minutos` : ''}.`;
  $('acciones').innerHTML = `
    <a class="btn btn-primario btn-grande" href="${linkGoogleMaps(p.lat, p.lng)}" target="_blank" rel="noopener">${ICONOS.navegar}Google Maps</a>
    <a class="btn btn-contorno btn-grande" href="${linkWaze(p.lat, p.lng)}" target="_blank" rel="noopener">${ICONOS.navegar}Waze</a>
    ${
      p.telefono
        ? `<a class="btn" href="${linkTel(p.telefono)}">${ICONOS.telefono}Llamar</a>
           <a class="btn" href="${linkWhatsApp(p.telefono, mensaje)}" target="_blank" rel="noopener">${ICONOS.mensaje}Avisar que llego</a>`
        : '<span class="texto-tenue celda-completa">Sin teléfono cargado para llamar o avisar.</span>'
    }`;

  $('nota').classList.toggle('oculto', !p.nota);
  $('nota-texto').textContent = p.nota || '';

  const siguiente = suyas.find((x) => !paradaHecha(x) && x.id !== p.id && (x.orden || 0) > (p.orden || 0)) || suyas.find((x) => !paradaHecha(x) && x.id !== p.id);
  if (siguiente) {
    $('siguiente').classList.remove('oculto');
    $('siguiente').href = `parada.html?id=${encodeURIComponent(siguiente.id)}`;
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

  const puede = puedoMarcar(p);
  $('btn-ubicacion').classList.toggle('oculto', !puede);
  if (!puede) {
    $('botones-estado').innerHTML = '';
  } else if (paradaHecha(p)) {
    $('botones-estado').innerHTML = `<button type="button" class="btn" data-accion="deshacer">Volver a dejarla pendiente</button>`;
  } else {
    $('botones-estado').innerHTML = `
      <button type="button" class="btn btn-ok" data-accion="entregado">${ICONOS.check}Entregado</button>
      <div class="grilla-2">
        <button type="button" class="btn" data-accion="noEstaba">No estaba</button>
        <button type="button" class="btn" data-accion="final">Pasar para el final</button>
      </div>`;
  }
}

function irALaSiguiente() {
  const p = laParada();
  const pendiente = paradasDe(vuelta, p ? p.fleteroUid : ctx.user.uid).find((x) => !paradaHecha(x) && x.id !== id);
  location.href = pendiente ? `parada.html?id=${encodeURIComponent(pendiente.id)}` : 'index.html';
}

$('botones-estado').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-accion]');
  if (!b || ocupado) return;
  const accion = b.dataset.accion;
  ocupado = true;
  try {
    if (accion === 'entregado' || accion === 'noEstaba') {
      const hora = horaAhora();
      await cambiarParada(ctx.equipo.id, fecha, id, (paradas, i) => {
        if (i >= 0) paradas[i] = { ...paradas[i], estado: accion, horaEstado: hora, marcadoPor: ctx.user.uid };
        return paradas;
      });
      aviso(accion === 'entregado' ? 'Entregado' : 'Marcada como “no estaba”');
      setTimeout(irALaSiguiente, 500);
    } else if (accion === 'final') {
      await cambiarParada(ctx.equipo.id, fecha, id, (paradas, i) => {
        if (i < 0) return paradas;
        const uid = paradas[i].fleteroUid;
        const suyas = paradas.filter((x) => x.fleteroUid === uid).sort((a, c) => (a.orden || 0) - (c.orden || 0));
        const movida = suyas.splice(suyas.findIndex((x) => x.id === id), 1)[0];
        suyas.push({ ...movida, llegada: null });
        const nuevoOrden = new Map(suyas.map((x, n) => [x.id, n + 1]));
        return paradas.map((x) =>
          x.fleteroUid === uid ? { ...(x.id === id ? { ...x, llegada: null } : x), orden: nuevoOrden.get(x.id) } : x
        );
      });
      aviso('La pasaste para el final');
      setTimeout(irALaSiguiente, 500);
    } else if (accion === 'deshacer') {
      await cambiarParada(ctx.equipo.id, fecha, id, (paradas, i) => {
        if (i >= 0) paradas[i] = { ...paradas[i], estado: 'pendiente', horaEstado: '' };
        return paradas;
      });
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
      aviso('Ubicación guardada');
    },
    () => aviso('No se pudo obtener la ubicación. Revisá el permiso de ubicación.'),
    { enableHighAccuracy: true, timeout: 15000 }
  );
});
