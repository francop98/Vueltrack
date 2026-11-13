/* =========================================================
   Vueltrack — Repartir la vuelta entre fleteros
   Por zona: divide el mapa en zonas, una por fletero.
   Parejo:   reparte para que todos tengan una cantidad pareja.
   A mano:   vos elegís quién va a cada parada.
   ========================================================= */
import { iniciarPantalla } from './sesion.js';
import { escucharVuelta, fleterosDelEquipo } from './datos.js';
import { crearMapa, pintarVuelta } from './mapa.js';
import { dividirPorZona } from './rutas.js';
import { calcularVuelta, guardarCalculo, mensajeError, horaDeSalida, nombreOrden, ORDENES } from './ordenar.js';
import { elegirOrden } from './salida.js';
import { actualizarEquipo } from './datos.js';
import { gruposDeVuelta, paradaHecha, costoDeRuta } from './vuelta.js';
import {
  esc,
  fechaISO,
  fechaCorta,
  iniciales,
  formatoKm,
  formatoDuracion,
  horaDeSegundos,
  aviso,
  botonCargando,
  formatoPlata,
  ICONOS
} from './ui.js';

const $ = (id) => document.getElementById(id);
const fecha = new URLSearchParams(location.search).get('fecha') || fechaISO();
const AYUDAS = {
  zona: 'Cada fletero se queda con una zona del mapa. Tocá una parada para pasarla a otro.',
  parejo: 'Reparte para que todos tengan una cantidad pareja de paradas y terminen parecido.',
  mano: 'Elegí quién va a cada parada, en la lista o tocando el pin en el mapa.'
};

let ctx;
let vuelta = null;
let fleteros = [];
let seleccionados = [];
let modo = 'zona';
let asignacion = new Map();
let calculo = null;
let mapa = null;
let primeraVez = true;

const pendientes = () => ((vuelta && vuelta.paradas) || []).filter((p) => !paradaHecha(p));
const fleterosActivos = () => fleteros.filter((f) => seleccionados.includes(f.uid));

ctx = await iniciarPantalla({ pagina: 'armar', soloOrganizador: true });
fleteros = fleterosDelEquipo(ctx.equipo);
seleccionados = fleteros.map((f) => f.uid);
$('btn-atras').href = `/pages/armar.html?fecha=${fecha}`;
mapa = crearMapa($('mapa'), { centro: ctx.equipo.base || undefined });

escucharVuelta(ctx.equipo.id, fecha, (v) => {
  vuelta = v;
  if (primeraVez) {
    primeraVez = false;
    asignacionInicial();
    pintarTodo();
    if (pendientes().length) calcular();
  }
});

function asignacionInicial() {
  asignacion = new Map();
  const lista = pendientes();
  const ya = lista.every((p) => p.fleteroUid && seleccionados.includes(p.fleteroUid));
  if (ya && vuelta && vuelta.ordenada) {
    lista.forEach((p) => asignacion.set(p.id, p.fleteroUid));
  } else {
    asignarPorZona();
  }
}

function asignarPorZona() {
  const lista = pendientes();
  const activos = fleterosActivos();
  const zonas = dividirPorZona(lista, activos.length);
  asignacion = new Map();
  lista.forEach((p, i) => asignacion.set(p.id, activos[zonas[i]] ? activos[zonas[i]].uid : activos[0]?.uid));
}

function invalidar() {
  calculo = null;
  $('btn-confirmar').disabled = true;
  $('aviso-sin-asignar').classList.add('oculto');
}

/* ---------- Pintado ---------- */

function pintarTodo() {
  const lista = pendientes();
  $('sobre').textContent = `${lista.length} paradas · ${fechaCorta(fecha)}`;
  pintarChips();
  pintarModos();
  pintarOrden();
  pintarMapa();
  pintarMano();
  pintarTarjetas();
}

function pintarChips() {
  $('chips-fleteros').innerHTML = fleteros
    .map((f) => {
      const activo = seleccionados.includes(f.uid);
      return `<button type="button" class="chip ${activo ? 'activo' : ''}" data-uid="${esc(f.uid)}" aria-pressed="${activo}"><i class="punto" style="background:${esc(f.color)}"></i>${esc(f.nombre)}</button>`;
    })
    .join('');
}

$('chips-fleteros').addEventListener('click', (e) => {
  const b = e.target.closest('[data-uid]');
  if (!b) return;
  const uid = b.dataset.uid;
  if (seleccionados.includes(uid)) {
    if (seleccionados.length === 1) {
      aviso('Tiene que salir al menos un fletero');
      return;
    }
    seleccionados = seleccionados.filter((x) => x !== uid);
  } else {
    seleccionados = [...seleccionados, uid];
  }
  if (modo === 'mano') {
    const activos = fleterosActivos();
    asignacion.forEach((v, k) => {
      if (!seleccionados.includes(v)) asignacion.set(k, activos[0].uid);
    });
  } else {
    asignarPorZona();
  }
  invalidar();
  pintarTodo();
});

function pintarOrden() {
  $('btn-orden').innerHTML = `${ICONOS.ordenar}Orden: ${esc(nombreOrden((ctx.equipo.ajustes || {}).orden || 'optimo'))}`;
}

$('btn-orden').addEventListener('click', () =>
  elegirOrden({
    actual: (ctx.equipo.ajustes || {}).orden || 'optimo',
    ordenes: ORDENES,
    alElegir: async (orden) => {
      ctx.equipo.ajustes = { ...(ctx.equipo.ajustes || {}), orden };
      await actualizarEquipo(ctx.equipo.id, { 'ajustes.orden': orden });
      invalidar();
      pintarOrden();
      calcular();
    }
  })
);

function pintarModos() {
  document.querySelectorAll('#modos [data-modo]').forEach((b) => b.classList.toggle('activo', b.dataset.modo === modo));
  $('ayuda-modo').textContent = AYUDAS[modo];
  $('bloque-mano').classList.toggle('oculto', modo !== 'mano');
}

document.querySelectorAll('#modos [data-modo]').forEach((b) =>
  b.addEventListener('click', () => {
    if (modo === b.dataset.modo) return;
    modo = b.dataset.modo;
    if (modo === 'zona') asignarPorZona();
    invalidar();
    pintarTodo();
  })
);

function vueltaDePrueba() {
  if (calculo) return { paradas: calculo.paradas, rutas: calculo.rutas };
  const contador = {};
  const paradas = pendientes().map((p) => {
    const uid = modo === 'parejo' ? '__sin__' : asignacion.get(p.id);
    contador[uid] = (contador[uid] || 0) + 1;
    return { ...p, fleteroUid: uid, orden: contador[uid] };
  });
  return { paradas, rutas: {} };
}

function pintarMapa() {
  const v = vueltaDePrueba();
  let grupos;
  if (!calculo && modo === 'parejo') {
    grupos = gruposDeVuelta(v, [{ uid: '__sin__', nombre: 'Sin repartir', color: '#64748B' }]);
  } else {
    grupos = gruposDeVuelta(v, fleterosActivos());
  }
  pintarVuelta(mapa, {
    base: ctx.equipo.base,
    grupos,
    alTocarParada: (p) => pasarAlSiguiente(p.id)
  });
  $('leyenda').innerHTML = grupos
    .map((g) => `<span><i class="punto" style="background:${esc(g.color)}"></i>${esc(g.nombre)} · ${g.paradas.length}</span>`)
    .join('');
}

function pasarAlSiguiente(paradaId) {
  const activos = fleterosActivos();
  if (activos.length < 2) return;
  if (modo !== 'mano') {
    if (calculo) calculo.paradas.forEach((p) => p.fleteroUid && asignacion.set(p.id, p.fleteroUid));
    modo = 'mano';
  }
  const actual = asignacion.get(paradaId);
  const i = activos.findIndex((f) => f.uid === actual);
  const siguiente = activos[(i + 1) % activos.length];
  asignacion.set(paradaId, siguiente.uid);
  invalidar();
  pintarTodo();
  aviso(`Pasó a ${siguiente.nombre}. Tocá “Calcular reparto”.`);
}

function pintarMano() {
  if (modo !== 'mano') return;
  const activos = fleterosActivos();
  $('lista-mano').innerHTML = pendientes()
    .map(
      (p) => `
      <div class="fila">
        <span class="fila-cuerpo">
          <span class="fila-titulo-texto">${esc(p.nombre)}</span>
          <span class="fila-detalle">${esc(p.direccion)}</span>
        </span>
        <label class="solo-lector" for="m-${esc(p.id)}">Fletero para ${esc(p.nombre)}</label>
        <select class="input input-hora" id="m-${esc(p.id)}" data-parada="${esc(p.id)}">
          ${activos.map((f) => `<option value="${esc(f.uid)}" ${asignacion.get(p.id) === f.uid ? 'selected' : ''}>${esc(f.nombre)}</option>`).join('')}
        </select>
      </div>`
    )
    .join('');
}

$('lista-mano').addEventListener('change', (e) => {
  const s = e.target.closest('[data-parada]');
  if (!s) return;
  asignacion.set(s.dataset.parada, s.value);
  invalidar();
  pintarMapa();
  pintarTarjetas();
});

function pintarTarjetas() {
  const v = vueltaDePrueba();
  const activos = fleterosActivos();
  $('tarjetas').innerHTML = activos
    .map((f) => {
      const cant = v.paradas.filter((p) => p.fleteroUid === f.uid).length;
      const ruta = calculo ? calculo.rutas[f.uid] : null;
      const sinDatos = !calculo;
      const costo = ruta ? costoDeRuta(ruta.distancia, f.gasto) : null;
      return `
        <div class="tarjeta tarjeta-fletero" style="--color-fletero:${esc(f.color)}">
          <div class="fila-titulo">
            <div class="botonera">
              <span class="iniciales redondo">${esc(iniciales(f.nombre))}</span>
              <span class="titulo-bloque">
                <strong>${esc(f.nombre)}</strong>
                <span class="texto-tenue">${esc(f.vehiculo || 'Fletero')}</span>
              </span>
            </div>
            <strong>${ruta && ruta.fin != null ? `vuelve ${horaDeSegundos(ruta.fin)}` : ''}</strong>
          </div>
          ${costo ? `<span class="texto-tenue">Gasto estimado: <strong>${formatoPlata(costo.total)}</strong></span>` : ''}
          <div class="grilla-stats de-3">
            <div class="stat"><span class="stat-valor">${sinDatos && modo === 'parejo' ? '—' : cant}</span><span class="stat-nombre">paradas</span></div>
            <div class="stat"><span class="stat-valor">${ruta ? formatoKm(ruta.distancia) : '—'}</span><span class="stat-nombre">recorrido</span></div>
            <div class="stat"><span class="stat-valor">${ruta ? formatoDuracion(ruta.duracion) : '—'}</span><span class="stat-nombre">con paradas</span></div>
          </div>
        </div>`;
    })
    .join('');
}

/* ---------- Calcular y confirmar ---------- */

async function calcular() {
  const lista = pendientes();
  if (!lista.length) {
    aviso('No hay paradas pendientes para repartir');
    return;
  }
  if (!ctx.equipo.base) {
    aviso('Primero elegí el punto de salida en Armar');
    return;
  }
  const boton = $('btn-calcular');
  const original = boton.innerHTML;
  botonCargando(boton, true);
  try {
    const todas = (vuelta.paradas || []).map((p) =>
      paradaHecha(p) ? p : { ...p, fleteroUid: modo === 'parejo' ? null : asignacion.get(p.id) }
    );
    calculo = await calcularVuelta({
      equipo: ctx.equipo,
      fecha,
      paradas: todas,
      vehiculos: seleccionados,
      modo: modo === 'parejo' ? 'parejo' : 'grupos',
      salida: horaDeSalida(vuelta, ctx.equipo, fecha),
      orden: (ctx.equipo.ajustes || {}).orden || 'optimo'
    });
    calculo.paradas.forEach((p) => {
      if (!paradaHecha(p) && p.fleteroUid) asignacion.set(p.id, p.fleteroUid);
    });
    $('btn-confirmar').disabled = false;
    const aviso1 = $('aviso-sin-asignar');
    aviso1.textContent = calculo.sinAsignar
      ? `${calculo.sinAsignar} paradas no entran en el horario de nadie. Revisá los “recibe hasta” o sumá otro fletero.`
      : '';
    aviso1.classList.toggle('oculto', !calculo.sinAsignar);
  } catch (e) {
    aviso(mensajeError(e));
  } finally {
    botonCargando(boton, false, original);
    pintarTodo();
  }
}

$('btn-calcular').addEventListener('click', calcular);

$('btn-confirmar').addEventListener('click', async () => {
  if (!calculo) return;
  $('btn-confirmar').disabled = true;
  try {
    await guardarCalculo(ctx.equipo, fecha, calculo);
    aviso('Listo, cada fletero ya ve su vuelta');
    location.href = fecha === fechaISO() ? '/pages/hoy.html' : `/pages/armar.html?fecha=${fecha}`;
  } catch (e) {
    aviso('No se pudo guardar. Probá de nuevo.');
    $('btn-confirmar').disabled = false;
  }
});
