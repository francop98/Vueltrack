/* =========================================================
   Vueltrack — Armar la vuelta
   ========================================================= */
import { iniciarPantalla } from './sesion.js';
import {
  escucharVuelta,
  escucharClientes,
  guardarVuelta,
  obtenerVuelta,
  actualizarEquipo,
  fleterosDelEquipo
} from './datos.js';
import { crearBuscador } from './buscador.js';
import { ordenarYGuardar, mensajeError, horaDeSalida, nombreOrden, ORDENES } from './ordenar.js';
import { elegirPuntoDeSalida, elegirOrden } from './salida.js';
import { editarParada, confirmarQuitar } from './editarParada.js';
import { paradaHecha, paradaDesdeCliente, paradaNueva, copiaParaOtroDia, textoHorario } from './vuelta.js';
import { buscarDirecciones } from './rutas.js';
import {
  ICONOS,
  esc,
  fechaISO,
  diaSemana,
  sumarDias,
  fechaLarga,
  ordenarAlfa,
  aviso,
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
  clientesListos = true;
  if (pendienteAuto) sumarClientesDelDiaSolos();
});

function escucharDia() {
  if (cortarVuelta) cortarVuelta();
  let primera = true;
  cortarVuelta = escucharVuelta(ctx.equipo.id, fecha, (v) => {
    vuelta = v;
    pintarParadas();
    pintarAjustes();
    pintarClientes();
    if (primera) {
      primera = false;
      sumarClientesDelDiaSolos();
    }
  });
}

/* Vueltas que se repiten: si el día está vacío, se suman solos los clientes que les toca */
let clientesListos = false;
let pendienteAuto = false;
async function sumarClientesDelDiaSolos() {
  if (!clientesListos) {
    pendienteAuto = true;
    return;
  }
  pendienteAuto = false;
  const a = ctx.equipo.ajustes || {};
  if (a.autoClientes === false || vuelta || fecha < fechaISO()) return;
  const dia = diaSemana(fecha);
  const lesToca = clientes.filter((c) => (c.dias || []).includes(dia));
  if (!lesToca.length) return;
  // Se confirma con el servidor que el día sigue vacío antes de escribir
  const enServidor = await obtenerVuelta(ctx.equipo.id, fecha).catch(() => undefined);
  if (enServidor !== null) return;
  await guardarParadas(lesToca.map(paradaDesdeCliente));
  aviso(lesToca.length === 1 ? `Sumamos a ${lesToca[0].nombre}, que le toca este día` : `Sumamos los ${lesToca.length} clientes que les toca este día`);
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
    const nueva = paradaNueva({
      nombre: r.nombre || r.direccion,
      direccion: r.direccion || r.nombre,
      lat: r.lat,
      lng: r.lng
    });
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
  const porId = new Map(lista.map((p) => [p.id, p]));
  $('lista-paradas').innerHTML = visibles
    .map((p) => {
      const entrega = p.tipo === 'retiro' && p.entregaId ? porId.get(p.entregaId) : null;
      const detalle = [
        p.direccion,
        textoHorario(p),
        Number(p.bultos) > 1 ? `${p.bultos} bultos` : '',
        entrega ? `se entrega en ${entrega.nombre}` : ''
      ]
        .filter(Boolean)
        .join(' · ');
      return `
      <div class="fila">
        <button type="button" class="fila enlace-plano sin-padding" data-editar="${esc(p.id)}">
          <span class="numero ${paradaHecha(p) ? 'ok' : p.tipo === 'retiro' ? 'retiro' : ''}">${paradaHecha(p) ? ICONOS.check : ordenada && p.orden ? p.orden : ICONOS.pin}</span>
          <span class="fila-cuerpo">
            <span class="fila-titulo-texto">${esc(p.nombre)}</span>
            <span class="fila-detalle">${esc(detalle)}</span>
          </span>
          ${p.tipo === 'retiro' ? '<span class="etiqueta etiqueta-azul">retiro</span>' : ''}
          ${p.urgente ? '<span class="etiqueta etiqueta-acento">urgente</span>' : ''}
        </button>
        <button type="button" class="btn-icono sin-borde" data-editar="${esc(p.id)}" aria-label="Editar ${esc(p.nombre)}">${ICONOS.lapiz}</button>
        <button type="button" class="btn-icono sin-borde btn-peligro" data-quitar="${esc(p.id)}" aria-label="Eliminar ${esc(p.nombre)}">${ICONOS.basura}</button>
      </div>`;
    })
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
    otras: paradas(),
    guardar: (cambios) => guardarParadas(paradas().map((x) => (x.id === id ? { ...x, ...cambios } : x))),
    quitar: () => guardarParadas(sinVinculo(paradas().filter((x) => x.id !== id), id))
  });
}

/* Si se borra una entrega, el retiro que apuntaba a ella queda sin entrega */
function sinVinculo(lista, idBorrado) {
  return lista.map((x) => (x.entregaId === idBorrado ? { ...x, entregaId: null } : x));
}

async function quitarDirecto(id) {
  const p = paradas().find((x) => x.id === id);
  if (!p || !(await confirmarQuitar(p))) return;
  await guardarParadas(sinVinculo(paradas().filter((x) => x.id !== id), id));
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
  $('txt-pausa').textContent = a.pausa && a.pausa.desde && Number(a.pausa.minutos) > 0 ? `${a.pausa.minutos} min, entre ${a.pausa.desde} y ${a.pausa.hasta}` : 'Sin pausa';
  $('auto-clientes').checked = a.autoClientes !== false;
  pintarBotones();
}

$('auto-clientes').addEventListener('change', () => actualizarEquipo(ctx.equipo.id, { 'ajustes.autoClientes': $('auto-clientes').checked }));

/* ---------- Pausa de la jornada (almuerzo) ---------- */
$('btn-pausa').addEventListener('click', () => {
  const actual = (ctx.equipo.ajustes || {}).pausa || { desde: '13:00', hasta: '14:30', minutos: 30 };
  const hoja = abrirHoja({
    titulo: 'Pausa de la jornada',
    html: `
      <p class="texto-tenue">Se suma al recorrido para que las horas de llegada sean reales. Se toma en algún momento dentro de ese horario.</p>
      <div class="grilla-2 siempre">
        <div class="campo"><label for="pa-desde">Entre las</label><input type="time" id="pa-desde" value="${esc(actual.desde || '13:00')}"></div>
        <div class="campo"><label for="pa-hasta">Y las</label><input type="time" id="pa-hasta" value="${esc(actual.hasta || '14:30')}"></div>
      </div>
      <div class="campo">
        <label for="pa-min">Duración</label>
        <select id="pa-min" class="input">
          ${[15, 20, 30, 45, 60, 90].map((m) => `<option value="${m}" ${Number(actual.minutos) === m ? 'selected' : ''}>${m} min</option>`).join('')}
        </select>
      </div>
      <button type="button" class="btn btn-primario btn-grande" id="pa-guardar">Guardar pausa</button>
      <button type="button" class="btn" id="pa-quitar">Sin pausa</button>`
  });
  hoja.el.querySelector('#pa-guardar').addEventListener('click', async () => {
    const desde = hoja.el.querySelector('#pa-desde').value;
    const hasta = hoja.el.querySelector('#pa-hasta').value;
    if (!desde || !hasta || desde > hasta) {
      aviso('Revisá el horario de la pausa');
      return;
    }
    await actualizarEquipo(ctx.equipo.id, { 'ajustes.pausa': { desde, hasta, minutos: Number(hoja.el.querySelector('#pa-min').value) } });
    hoja.cerrar();
    aviso('Pausa guardada. Se aplica al ordenar la vuelta.');
  });
  hoja.el.querySelector('#pa-quitar').addEventListener('click', async () => {
    await actualizarEquipo(ctx.equipo.id, { 'ajustes.pausa': null });
    hoja.cerrar();
    aviso('Sin pausa');
  });
});

/* ---------- Carga rápida: pegar una lista de direcciones ---------- */
$('btn-pegar').addEventListener('click', () => {
  const hoja = abrirHoja({
    titulo: 'Pegar varias direcciones',
    html: `
      <p class="texto-tenue">Una dirección o lugar por renglón. Podés copiarlas de un WhatsApp, un Excel o un correo.</p>
      <div class="campo">
        <label for="pg-texto">Direcciones</label>
        <textarea id="pg-texto" rows="8" placeholder="Ej.:&#10;Chiclana 765&#10;Alsina 120&#10;Cooperativa Obrera Villa Mitre"></textarea>
      </div>
      <div class="lista oculto" id="pg-resultado"></div>
      <button type="button" class="btn btn-primario btn-grande" id="pg-buscar">Buscar direcciones</button>
      <button type="button" class="btn btn-primario btn-grande oculto" id="pg-agregar"></button>`
  });
  const el = hoja.el;
  let encontradas = [];
  el.querySelector('#pg-buscar').addEventListener('click', async (e) => {
    const boton = e.currentTarget;
    const lineas = el
      .querySelector('#pg-texto')
      .value.split(/\r?\n/)
      .map((l) => l.replace(/^\s*(?:[-•*]+|\d+[.)])\s*/, '').trim())
      .filter((l) => l.length > 2)
      .slice(0, 48);
    if (!lineas.length) {
      aviso('Pegá al menos una dirección');
      return;
    }
    const original = boton.innerHTML;
    botonCargando(boton, true);
    boton.innerHTML = '<span class="girando" aria-hidden="true"></span> Buscando…';
    encontradas = [];
    const filas = [];
    for (const linea of lineas) {
      let r = null;
      try {
        r = (await buscarDirecciones(linea, ctx.equipo.base))[0] || null;
      } catch (err) {
        r = null;
      }
      if (r) encontradas.push({ linea, r });
      filas.push(`
        <div class="fila">
          <span class="numero ${r ? 'ok' : 'no'}">${r ? ICONOS.check : '!'}</span>
          <span class="fila-cuerpo">
            <span class="fila-titulo-texto">${esc(linea)}</span>
            <span class="fila-detalle">${r ? esc(r.direccion || r.nombre) : 'No la encontramos: cargala a mano'}</span>
          </span>
        </div>`);
      el.querySelector('#pg-resultado').innerHTML = filas.join('');
      el.querySelector('#pg-resultado').classList.remove('oculto');
    }
    botonCargando(boton, false, original);
    const agregar = el.querySelector('#pg-agregar');
    agregar.classList.toggle('oculto', !encontradas.length);
    agregar.textContent = `Agregar ${encontradas.length} ${encontradas.length === 1 ? 'parada' : 'paradas'}`;
  });
  el.querySelector('#pg-agregar').addEventListener('click', async () => {
    const nuevas = encontradas.map(({ linea, r }) =>
      paradaNueva({ nombre: r.nombre || linea, direccion: r.direccion || r.nombre || linea, lat: r.lat, lng: r.lng })
    );
    await guardarParadas([...paradas(), ...nuevas]);
    hoja.cerrar();
    aviso(`Agregaste ${nuevas.length} paradas. Revisá que estén bien ubicadas.`);
  });
});

/* ---------- Repetir una vuelta anterior ---------- */
$('btn-repetir').addEventListener('click', () => {
  const sugerida = sumarDias(fecha, -7);
  const hoja = abrirHoja({
    titulo: 'Repetir una vuelta anterior',
    html: `
      <p class="texto-tenue">Copia las paradas de otro día a esta vuelta, todas pendientes.</p>
      <div class="campo">
        <label for="rp-fecha">Día a copiar</label>
        <input type="date" id="rp-fecha" class="input" value="${sugerida}" max="${sumarDias(fecha, -1)}">
      </div>
      <span class="texto-tenue" id="rp-info"></span>
      <button type="button" class="btn btn-primario btn-grande" id="rp-copiar" disabled>Copiar paradas</button>`
  });
  const el = hoja.el;
  let origen = null;
  const revisar = async () => {
    const dia = el.querySelector('#rp-fecha').value;
    origen = dia ? await obtenerVuelta(ctx.equipo.id, dia).catch(() => null) : null;
    const n = origen && origen.paradas ? origen.paradas.length : 0;
    el.querySelector('#rp-info').textContent = n
      ? `${fechaLarga(dia)}: ${n} ${n === 1 ? 'parada' : 'paradas'}`
      : 'Ese día no tiene paradas cargadas.';
    el.querySelector('#rp-copiar').disabled = !n;
  };
  el.querySelector('#rp-fecha').addEventListener('change', revisar);
  revisar();
  el.querySelector('#rp-copiar').addEventListener('click', async () => {
    if (!origen) return;
    const yaEstan = new Set(paradas().map((p) => p.clienteId).filter(Boolean));
    const lista = origen.paradas.filter((p) => !p.clienteId || !yaEstan.has(p.clienteId));
    const nuevosIds = new Map();
    const copias = lista.map((p) => {
      const c = copiaParaOtroDia(p);
      delete c.reprogramadaDe;
      nuevosIds.set(p.id, c.id);
      return c;
    });
    copias.forEach((c) => {
      c.entregaId = c.entregaId && nuevosIds.has(c.entregaId) ? nuevosIds.get(c.entregaId) : null;
    });
    await guardarParadas([...paradas(), ...copias]);
    hoja.cerrar();
    aviso(`Copiaste ${copias.length} paradas`);
  });
});

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
    if (sinAsignar) aviso(`${sinAsignar} paradas no entran en el horario o en la capacidad del vehículo. Revisá horarios y bultos.`);
    else if (llegaTarde) aviso(`Con este orden, ${llegaTarde} paradas llegan después de su horario de cierre.`);
    location.href = fecha === fechaISO() ? '/pages/hoy.html' : `/pages/armar.html?fecha=${fecha}`;
  } catch (e) {
    aviso(mensajeError(e));
  } finally {
    botonCargando(boton, false, original);
  }
});
