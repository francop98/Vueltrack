/* =========================================================
   Vueltrack — Armar la vuelta
   ========================================================= */
import { iniciarPantalla } from './sesion.js';
import {
  escucharVuelta,
  escucharClientes,
  guardarVuelta,
  actualizarEquipo,
  fleterosDelEquipo
} from './datos.js';
import { crearBuscador } from './buscador.js';
import { ordenarYGuardar, mensajeError, horaDeSalida, nombreOrden, ORDENES } from './ordenar.js';
import { elegirPuntoDeSalida, elegirOrden } from './salida.js';
import { editarParada, confirmarQuitar } from './editarParada.js';
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
  botonCargando,
  horaAhora
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
  history.replaceState(null, '', `/pages/armar.html?fecha=${fecha}`);
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
    pintarAjustes();
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
  clientes: () => clientes,
  alElegir: async (r) => {
    if (r.tipo === 'cliente') {
      const cliente = clientes.find((c) => c.id === r.clienteId);
      buscador.limpiar();
      if (!cliente) return;
      if (idsClientesEnVuelta().has(cliente.id)) {
        aviso('Ya está en la vuelta');
        return;
      }
      await guardarParadas([...paradas(), paradaDesdeCliente(cliente)]);
      aviso(`${cliente.nombre} sumado a la vuelta`);
      return;
    }
    const nueva = {
      id: idNuevo(),
      clienteId: null,
      nombre: r.nombre || r.direccion,
      direccion: r.direccion || r.nombre,
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
    if (r.aproximada) {
      // La altura no está en el mapa: se abre la parada para ubicar el pin en la puerta
      aviso('No tenemos esa altura exacta: arrastrá el pin hasta la puerta');
      setTimeout(() => editar(nueva.id), 300);
    } else {
      aviso('Parada agregada');
    }
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
    $('chips-clientes').innerHTML = '<a class="chip punteado" href="/pages/clientes.html">Cargá tus clientes habituales para sumarlos con un toque</a>';
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
      <div class="fila">
        <button type="button" class="fila enlace-plano sin-padding" data-editar="${esc(p.id)}">
          <span class="numero ${paradaHecha(p) ? 'ok' : ''}">${paradaHecha(p) ? ICONOS.check : ordenada && p.orden ? p.orden : ICONOS.pin}</span>
          <span class="fila-cuerpo">
            <span class="fila-titulo-texto">${esc(p.nombre)}</span>
            <span class="fila-detalle">${esc(p.direccion)}${p.hasta ? ` · cierra ${esc(p.hasta)}` : ''}</span>
          </span>
          ${p.urgente ? '<span class="etiqueta etiqueta-acento">urgente</span>' : ''}
        </button>
        <button type="button" class="btn-icono sin-borde" data-editar="${esc(p.id)}" aria-label="Editar ${esc(p.nombre)}">${ICONOS.lapiz}</button>
        <button type="button" class="btn-icono sin-borde btn-peligro" data-quitar="${esc(p.id)}" aria-label="Eliminar ${esc(p.nombre)}">${ICONOS.basura}</button>
      </div>`
    )
    .join('');
  pintarBotones();
}

$('lista-paradas').addEventListener('click', (e) => {
  const quitar = e.target.closest('[data-quitar]');
  if (quitar) {
    quitarDirecto(quitar.dataset.quitar);
    return;
  }
  const b = e.target.closest('[data-editar]');
  if (b) editar(b.dataset.editar);
});

function editar(id) {
  const p = paradas().find((x) => x.id === id);
  if (!p) return;
  editarParada({
    parada: p,
    equipo: ctx.equipo,
    guardar: (cambios) => guardarParadas(paradas().map((x) => (x.id === id ? { ...x, ...cambios } : x))),
    quitar: () => guardarParadas(paradas().filter((x) => x.id !== id))
  });
}

async function quitarDirecto(id) {
  const p = paradas().find((x) => x.id === id);
  if (!p || !(await confirmarQuitar(p))) return;
  await guardarParadas(paradas().filter((x) => x.id !== id));
  aviso('Destino eliminado');
}

/* ---------- Ajustes de salida ---------- */

function pintarAjustes() {
  const a = ctx.equipo.ajustes || {};
  $('txt-base').textContent = ctx.equipo.base ? ctx.equipo.base.direccion : 'Elegir…';
  if (document.activeElement !== $('salida')) $('salida').value = horaDeSalida(vuelta, ctx.equipo, fecha);
  $('volver').checked = a.volver !== false;
  $('demora').value = String(a.demora ?? 5);
  $('txt-orden').textContent = nombreOrden(a.orden || 'optimo');
  pintarBotones();
}

async function guardarSalida(hora) {
  await guardarVuelta(ctx.equipo.id, fecha, { salida: hora });
  await actualizarEquipo(ctx.equipo.id, { 'ajustes.salida': hora });
}

$('salida').addEventListener('change', () => {
  if ($('salida').value) guardarSalida($('salida').value);
});
$('btn-ahora').addEventListener('click', async () => {
  const hora = horaAhora();
  $('salida').value = hora;
  await guardarSalida(hora);
  aviso(`Salida a las ${hora}`);
});
$('volver').addEventListener('change', () => actualizarEquipo(ctx.equipo.id, { 'ajustes.volver': $('volver').checked }));
$('demora').addEventListener('change', () => actualizarEquipo(ctx.equipo.id, { 'ajustes.demora': Number($('demora').value) }));

$('btn-base').addEventListener('click', () => elegirPuntoDeSalida(ctx.equipo));

$('btn-orden').addEventListener('click', () =>
  elegirOrden({
    actual: (ctx.equipo.ajustes || {}).orden || 'optimo',
    ordenes: ORDENES,
    alElegir: async (orden) => {
      await actualizarEquipo(ctx.equipo.id, { 'ajustes.orden': orden });
      aviso(`Orden: ${nombreOrden(orden)}. Tocá “Ordenar la vuelta”.`);
    }
  })
);

/* ---------- Ordenar / repartir ---------- */

function pintarBotones() {
  const fleteros = fleterosDelEquipo(ctx.equipo);
  const hay = paradas().some((p) => !paradaHecha(p));
  $('btn-ordenar').disabled = !hay;
  $('btn-repartir').classList.toggle('oculto', fleteros.length < 2 || !hay);
  $('btn-repartir').href = `/pages/repartir.html?fecha=${fecha}`;
}

$('btn-ordenar').addEventListener('click', async () => {
  if (!ctx.equipo.base) {
    aviso('Primero elegí desde dónde salís');
    elegirPuntoDeSalida(ctx.equipo);
    return;
  }
  const fleteros = fleterosDelEquipo(ctx.equipo);
  if (fleteros.length > 1) {
    location.href = `/pages/repartir.html?fecha=${fecha}`;
    return;
  }
  const uid = fleteros.length ? fleteros[0].uid : ctx.user.uid;
  const boton = $('btn-ordenar');
  const original = boton.innerHTML;
  botonCargando(boton, true);
  try {
    const lista = paradas().map((p) => (paradaHecha(p) ? p : { ...p, fleteroUid: uid }));
    const { sinAsignar, llegaTarde } = await ordenarYGuardar({
      equipo: ctx.equipo,
      fecha,
      paradas: lista,
      vehiculos: [uid],
      modo: 'grupos',
      salida: $('salida').value || horaDeSalida(vuelta, ctx.equipo, fecha),
      orden: (ctx.equipo.ajustes || {}).orden || 'optimo'
    });
    if (sinAsignar) aviso(`${sinAsignar} paradas no entran en el horario. Revisá los horarios de cierre.`);
    else if (llegaTarde) aviso(`Con este orden, ${llegaTarde} paradas llegan después de su horario de cierre.`);
    location.href = fecha === fechaISO() ? '/pages/hoy.html' : `/pages/armar.html?fecha=${fecha}`;
  } catch (e) {
    aviso(mensajeError(e));
  } finally {
    botonCargando(boton, false, original);
  }
});
