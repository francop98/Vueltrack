/* =========================================================
   Vueltrack — Armar la vuelta
   ========================================================= */
import { iniciarPantalla } from './sesion.js';
import {
  escucharVuelta,
  escucharClientes,
  guardarVuelta,
  actualizarEquipo,
  fleterosDelEquipo,
  corregirUbicacionCliente
} from './datos.js';
import { crearBuscador, htmlBuscador } from './buscador.js';
import { mapaConPin } from './mapa.js';
import { ordenarYGuardar, mensajeError } from './ordenar.js';
import { paradaHecha, paradaDesdeCliente } from './vuelta.js';
import {
  ICONOS,
  esc,
  fechaISO,
  diaSemana,
  ordenarAlfa,
  idNuevo,
  aviso,
  confirmar,
  abrirHoja,
  botonCargando
} from './ui.js';

const $ = (id) => document.getElementById(id);
const parametros = new URLSearchParams(location.search);
let fecha = parametros.get('fecha') || fechaISO();
let ctx;
let vuelta = null;
let clientes = [];
let cortarVuelta = null;

const paradas = () => (vuelta && vuelta.paradas) || [];

ctx = await iniciarPantalla({
  pagina: 'armar',
  soloOrganizador: true,
  alCambiarEquipo: (nuevo) => {
    ctx = nuevo;
    pintarAjustes();
  }
});

$('fecha').value = fecha;
$('fecha').min = fechaISO();
$('fecha').addEventListener('change', () => {
  if (!$('fecha').value) return;
  fecha = $('fecha').value;
  history.replaceState(null, '', `armar.html?fecha=${fecha}`);
  escucharDia();
});

escucharClientes(ctx.equipo.id, (lista) => {
  clientes = ordenarAlfa(lista);
  pintarClientes();
});

function escucharDia() {
  if (cortarVuelta) cortarVuelta();
  cortarVuelta = escucharVuelta(ctx.equipo.id, fecha, (v) => {
    vuelta = v;
    pintarParadas();
    pintarClientes();
  });
}
escucharDia();
pintarAjustes();

async function guardarParadas(nuevas) {
  await guardarVuelta(ctx.equipo.id, fecha, { paradas: nuevas, ordenada: false });
}

/* ---------- Buscador de direcciones sueltas ---------- */

const buscador = crearBuscador($('dir'), {
  foco: () => ctx.equipo.base,
  alElegir: async (r) => {
    const nueva = {
      id: idNuevo(),
      clienteId: null,
      nombre: r.direccion,
      direccion: r.direccion,
      lat: r.lat,
      lng: r.lng,
      telefono: '',
      nota: '',
      hasta: '',
      urgente: false,
      estado: 'pendiente',
      fleteroUid: null
    };
    buscador.limpiar();
    await guardarParadas([...paradas(), nueva]);
    aviso('Parada agregada');
  }
});

/* ---------- Clientes habituales ---------- */

function idsClientesEnVuelta() {
  return new Set(paradas().map((p) => p.clienteId).filter(Boolean));
}

function pintarClientes() {
  const enVuelta = idsClientesEnVuelta();
  const dia = diaSemana(fecha);
  const lesToca = clientes.filter((c) => (c.dias || []).includes(dia));
  const primero = [...lesToca, ...clientes.filter((c) => !lesToca.includes(c))].slice(0, 10);

  if (!clientes.length) {
    $('chips-clientes').innerHTML = '<a class="chip punteado" href="clientes.html">Cargá tus clientes habituales para sumarlos con un toque</a>';
  } else {
    $('chips-clientes').innerHTML = primero
      .map((c) =>
        enVuelta.has(c.id)
          ? `<button type="button" class="chip activo" data-cliente="${esc(c.id)}" aria-pressed="true">${ICONOS.check}${esc(c.nombre)}</button>`
          : `<button type="button" class="chip" data-cliente="${esc(c.id)}" aria-pressed="false"><span class="mas" aria-hidden="true">+</span>${esc(c.nombre)}</button>`
      )
      .join('');
  }

  const faltan = lesToca.filter((c) => !enVuelta.has(c.id));
  $('btn-toca').classList.toggle('oculto', !faltan.length);
  $('btn-toca').textContent =
    faltan.length === 1 ? `Sumar a ${faltan[0].nombre}, que le toca este día` : `Sumar los ${faltan.length} que les toca este día`;
  $('btn-toca').onclick = async () => {
    await guardarParadas([...paradas(), ...faltan.map(paradaDesdeCliente)]);
    aviso(faltan.length === 1 ? `Sumaste a ${faltan[0].nombre}` : `Sumaste ${faltan.length} clientes`);
  };
}

$('chips-clientes').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-cliente]');
  if (!b) return;
  const cliente = clientes.find((c) => c.id === b.dataset.cliente);
  if (!cliente) return;
  if (idsClientesEnVuelta().has(cliente.id)) {
    aviso('Ya está en la vuelta');
    return;
  }
  await guardarParadas([...paradas(), paradaDesdeCliente(cliente)]);
});

/* ---------- Paradas cargadas ---------- */

function pintarParadas() {
  const lista = paradas();
  $('titulo-paradas').textContent = `Paradas cargadas · ${lista.length}`;
  $('sin-paradas').classList.toggle('oculto', lista.length > 0);
  $('lista-paradas').classList.toggle('oculto', !lista.length);
  const ordenada = vuelta && vuelta.ordenada;
  const visibles = [...lista].sort((a, b) => {
    if (ordenada) return String(a.fleteroUid).localeCompare(String(b.fleteroUid)) || (a.orden || 0) - (b.orden || 0);
    return 0;
  });
  $('lista-paradas').innerHTML = visibles
    .map(
      (p) => `
      <button type="button" class="fila" data-parada="${esc(p.id)}">
        <span class="numero ${paradaHecha(p) ? 'ok' : ''}">${paradaHecha(p) ? ICONOS.check : ordenada && p.orden ? p.orden : ICONOS.pin}</span>
        <span class="fila-cuerpo">
          <span class="fila-titulo-texto">${esc(p.nombre)}</span>
          <span class="fila-detalle">${p.clienteId ? '' : 'Dirección suelta · '}${esc(p.direccion)}</span>
        </span>
        ${p.urgente ? '<span class="etiqueta etiqueta-acento">urgente</span>' : ''}
        ${p.hasta ? `<span class="etiqueta etiqueta-aviso">hasta ${esc(p.hasta)}</span>` : ''}
      </button>`
    )
    .join('');
  pintarBotones();
}

$('lista-paradas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-parada]');
  if (b) editarParada(b.dataset.parada);
});

function editarParada(id) {
  const p = paradas().find((x) => x.id === id);
  if (!p) return;
  let lat = p.lat;
  let lng = p.lng;
  const hoja = abrirHoja({
    titulo: 'Parada',
    html: `
      <div class="campo"><label for="ep-nombre">Nombre</label><input id="ep-nombre" value="${esc(p.nombre)}"></div>
      <span class="texto-tenue">${esc(p.direccion)}</span>
      <div class="grilla-2">
        <div class="campo"><label for="ep-tel">Teléfono</label><input id="ep-tel" type="tel" inputmode="tel" value="${esc(p.telefono)}"></div>
        <div class="campo"><label for="ep-hasta">Recibe hasta</label><input id="ep-hasta" type="time" value="${esc(p.hasta)}"></div>
      </div>
      <div class="campo"><label for="ep-nota">Nota para el fletero</label><textarea id="ep-nota">${esc(p.nota)}</textarea></div>
      <label class="interruptor tarjeta" for="ep-urgente"><span class="etiqueta-campo">Urgente (va primero)</span><input type="checkbox" id="ep-urgente" ${p.urgente ? 'checked' : ''}></label>
      <span class="etiqueta-campo">Ubicación — arrastrá el pin si quedó corrido</span>
      <div class="mapa chico"><div class="mapa-lienzo" id="ep-mapa"></div></div>
      <button type="button" class="btn btn-primario btn-grande" id="ep-guardar">Guardar</button>
      <button type="button" class="btn btn-peligro" id="ep-quitar">${ICONOS.basura}Quitar de la vuelta</button>`
  });
  mapaConPin(hoja.el.querySelector('#ep-mapa'), { lat, lng }, (nLat, nLng) => {
    lat = nLat;
    lng = nLng;
  });

  hoja.el.querySelector('#ep-guardar').addEventListener('click', async () => {
    const movida = lat !== p.lat || lng !== p.lng;
    const cambios = {
      nombre: hoja.el.querySelector('#ep-nombre').value.trim() || p.direccion,
      telefono: hoja.el.querySelector('#ep-tel').value.trim(),
      hasta: hoja.el.querySelector('#ep-hasta').value,
      nota: hoja.el.querySelector('#ep-nota').value.trim(),
      urgente: hoja.el.querySelector('#ep-urgente').checked,
      lat,
      lng
    };
    await guardarParadas(paradas().map((x) => (x.id === id ? { ...x, ...cambios } : x)));
    if (movida && p.clienteId) await corregirUbicacionCliente(ctx.equipo.id, p.clienteId, lat, lng);
    hoja.cerrar();
    aviso(movida ? 'Guardado. La vuelta se vuelve a ordenar con la ubicación nueva.' : 'Guardado');
  });

  hoja.el.querySelector('#ep-quitar').addEventListener('click', async () => {
    const ok = await confirmar({ titulo: '¿Quitar esta parada?', texto: p.nombre, aceptar: 'Quitar', peligro: true });
    if (!ok) return;
    await guardarParadas(paradas().filter((x) => x.id !== id));
    hoja.cerrar();
  });
}

/* ---------- Ajustes de salida ---------- */

function pintarAjustes() {
  const a = ctx.equipo.ajustes || {};
  $('txt-base').textContent = ctx.equipo.base ? ctx.equipo.base.direccion : 'Elegir…';
  $('salida').value = a.salida || '08:00';
  $('volver').checked = a.volver !== false;
  $('demora').value = String(a.demora ?? 5);
  pintarBotones();
}

$('salida').addEventListener('change', () => actualizarEquipo(ctx.equipo.id, { 'ajustes.salida': $('salida').value || '08:00' }));
$('volver').addEventListener('change', () => actualizarEquipo(ctx.equipo.id, { 'ajustes.volver': $('volver').checked }));
$('demora').addEventListener('change', () => actualizarEquipo(ctx.equipo.id, { 'ajustes.demora': Number($('demora').value) }));

$('btn-base').addEventListener('click', elegirBase);

function elegirBase() {
  const hoja = abrirHoja({
    titulo: 'Punto de salida',
    html: `${htmlBuscador('nueva-base', 'Depósito, casa o local')}
      <p class="texto-tenue">La vuelta arranca y termina acá.</p>`
  });
  crearBuscador(hoja.el.querySelector('#nueva-base'), {
    foco: () => ctx.equipo.base,
    alElegir: async (r) => {
      await actualizarEquipo(ctx.equipo.id, { base: { direccion: r.direccion, lat: r.lat, lng: r.lng } });
      hoja.cerrar();
      aviso('Punto de salida guardado');
    }
  });
  hoja.el.querySelector('#nueva-base').focus();
}

/* ---------- Ordenar / repartir ---------- */

function pintarBotones() {
  const fleteros = fleterosDelEquipo(ctx.equipo);
  const hay = paradas().some((p) => !paradaHecha(p));
  $('btn-ordenar').disabled = !hay;
  $('btn-repartir').classList.toggle('oculto', fleteros.length < 2 || !hay);
  $('btn-repartir').href = `repartir.html?fecha=${fecha}`;
}

$('btn-ordenar').addEventListener('click', async () => {
  if (!ctx.equipo.base) {
    aviso('Primero elegí desde dónde salís');
    elegirBase();
    return;
  }
  const fleteros = fleterosDelEquipo(ctx.equipo);
  if (fleteros.length > 1) {
    location.href = `repartir.html?fecha=${fecha}`;
    return;
  }
  const uid = fleteros.length ? fleteros[0].uid : ctx.user.uid;
  const boton = $('btn-ordenar');
  const original = boton.innerHTML;
  botonCargando(boton, true);
  try {
    const lista = paradas().map((p) => (paradaHecha(p) ? p : { ...p, fleteroUid: uid }));
    const { sinAsignar } = await ordenarYGuardar({
      equipo: ctx.equipo,
      fecha,
      paradas: lista,
      vehiculos: [uid],
      modo: 'grupos'
    });
    if (sinAsignar) aviso(`${sinAsignar} paradas no entran en el horario. Revisá los “recibe hasta”.`);
    location.href = fecha === fechaISO() ? 'index.html' : `armar.html?fecha=${fecha}`;
  } catch (e) {
    aviso(mensajeError(e));
  } finally {
    botonCargando(boton, false, original);
  }
});
