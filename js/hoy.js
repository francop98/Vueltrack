/* =========================================================
   Vueltrack — pantalla Hoy
   ========================================================= */
import { iniciarPantalla } from './sesion.js';
import { escucharVuelta, fleterosDelEquipo, escucharUbicaciones } from './datos.js';
import { crearMapa, pintarVuelta, pintarFleteros } from './mapa.js';
import { gruposDeVuelta, resumen, paradasSinOrdenar, textoHorario } from './vuelta.js';
import { conectarAviso, textoResultado } from './estados.js';
import { compartirSiCorresponde, puedeCompartir, estaCompartiendo, cambiarCompartir, haceCuanto, ubicacionesRecientes } from './enVivo.js';
import { reordenarFletero, mensajeError, nombreOrden, ORDENES } from './ordenar.js';
import { elegirOrden } from './salida.js';
import { miUbicacion } from './rutas.js';
import {
  ICONOS,
  esc,
  fechaISO,
  fechaLarga,
  formatoKm,
  formatoDuracion,
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
let filtro = null;
let mapa = null;

$('fecha').textContent = fechaLarga(fecha);

ctx = await iniciarPantalla({
  pagina: 'hoy',
  alCambiarEquipo: (nuevo) => {
    ctx = nuevo;
    pintar();
  }
});

filtro = ctx.organizador ? 'todos' : ctx.user.uid;
compartirSiCorresponde(ctx);

/* ---------- Ubicación en vivo ---------- */
let ubicaciones = [];
function pintarCompartir() {
  const caja = $('compartir');
  const ver = puedeCompartir(ctx);
  caja.classList.toggle('oculto', !ver);
  if (ver) $('compartir-check').checked = estaCompartiendo();
}
$('compartir-check').addEventListener('change', async (e) => {
  await cambiarCompartir(ctx, e.target.checked);
  aviso(e.target.checked ? 'El equipo ve dónde estás mientras tengas la app abierta' : 'Dejaste de compartir tu ubicación');
});
pintarCompartir();

if (ctx.organizador && ctx.equipo.modo === 'equipo') {
  escucharUbicaciones(ctx.equipo.id, (lista) => {
    ubicaciones = ubicacionesRecientes(lista).filter((u) => u.uid !== ctx.user.uid);
    pintarEnVivo();
  });
}

function pintarEnVivo() {
  if (!mapa) return;
  const fleteros = fleterosDelEquipo(ctx.equipo);
  const visibles = ubicaciones
    .filter((u) => filtro === 'todos' || u.uid === filtro)
    .map((u) => {
      const f = fleteros.find((x) => x.uid === u.uid);
      return { ...u, color: f ? f.color : '#475569', nombre: f ? f.nombre : u.nombre, detalle: haceCuanto(u.ts) };
    });
  pintarFleteros(mapa, visibles);
  $('en-vivo').classList.toggle('oculto', !visibles.length);
  $('en-vivo').innerHTML = visibles
    .map((u) => `<span><i class="punto" style="background:${esc(u.color)}"></i>${esc(u.nombre)} · ${esc(u.detalle)}</span>`)
    .join('');
}

escucharVuelta(ctx.equipo.id, fecha, (v) => {
  vuelta = v;
  pintar();
});

function mostrar(id, si) {
  $(id).classList.toggle('oculto', !si);
}

function pintar() {
  $('cargando').classList.add('oculto');
  const fleteros = fleterosDelEquipo(ctx.equipo);
  const todos = gruposDeVuelta(vuelta, fleteros);
  pintarFiltro(todos);

  const grupos = filtro === 'todos' ? todos : todos.filter((g) => g.uid === filtro);
  const propia = filtro === ctx.user.uid || (!ctx.organizador && ctx.fletero);
  $('titulo').textContent = propia || todos.length <= 1 ? 'Tu vuelta de hoy' : 'La vuelta de hoy';

  if (!grupos.length) {
    pintarVacio();
    return;
  }

  mostrar('vacio', false);
  mostrar('stats', true);
  mostrar('mapa-caja', true);
  mostrar('bloque-lista', true);
  mostrar('link-editar', ctx.organizador);

  const r = resumen(grupos);
  $('st-paradas').textContent = r.hechas ? `${r.hechas}/${r.paradas}` : r.paradas;
  $('st-km').textContent = formatoKm(r.distancia);
  $('st-tiempo').textContent = formatoDuracion(r.duracion);
  $('st-fin').textContent = r.fin != null ? horaDeSegundos(r.fin) : '—';

  if (!mapa) mapa = crearMapa($('mapa'), { centro: ctx.equipo.base || undefined });
  pintarVuelta(mapa, {
    base: ctx.equipo.base,
    grupos,
    alTocarParada: (p) => {
      location.href = `/pages/parada.html?id=${encodeURIComponent(p.id)}`;
    }
  });
  $('leyenda').innerHTML =
    grupos.length > 1
      ? grupos
          .map((g) => `<span><i class="punto" style="background:${esc(g.color)}"></i>${esc(g.nombre)} · ${g.paradas.length}</span>`)
          .join('')
      : '';

  pintarEnVivo();
  pintarProxima(grupos);
  pintarListas(grupos);
}

function pintarFiltro(grupos) {
  const caja = $('filtro');
  if (!ctx.organizador || grupos.length < 2) {
    caja.classList.add('oculto');
    if (ctx.organizador) filtro = 'todos';
    return;
  }
  caja.classList.remove('oculto');
  const opciones = [{ uid: 'todos', nombre: 'Todos' }, ...grupos.map((g) => ({ uid: g.uid, nombre: g.nombre, color: g.color }))];
  caja.innerHTML = opciones
    .map(
      (o) =>
        `<button type="button" class="chip ${filtro === o.uid ? 'activo' : ''}" data-uid="${esc(o.uid)}" aria-pressed="${filtro === o.uid}">${
          o.color ? `<i class="punto" style="background:${esc(o.color)}"></i>` : ''
        }${esc(o.uid === ctx.user.uid ? `${o.nombre} (vos)` : o.nombre)}</button>`
    )
    .join('');
  caja.querySelectorAll('[data-uid]').forEach((b) =>
    b.addEventListener('click', () => {
      filtro = b.dataset.uid;
      pintar();
    })
  );
}

function pintarVacio() {
  ['stats', 'mapa-caja', 'proxima', 'bloque-lista'].forEach((id) => mostrar(id, false));
  mostrar('vacio', true);
  const sinOrdenar = paradasSinOrdenar(vuelta).length;
  if (ctx.organizador) {
    $('vacio-titulo').textContent = sinOrdenar ? `Tenés ${sinOrdenar} paradas sin ordenar` : 'Todavía no armaste la vuelta de hoy';
    $('vacio-texto').textContent = sinOrdenar
      ? 'Entrá a Armar y tocá “Ordenar la vuelta”.'
      : 'Cargá direcciones o sumá clientes habituales y Vueltrack la ordena.';
    $('vacio-boton').textContent = sinOrdenar ? 'Seguir armando' : 'Armar la vuelta';
    mostrar('vacio-boton', true);
  } else {
    $('vacio-titulo').textContent = 'Todavía no tenés paradas para hoy';
    $('vacio-texto').textContent = 'Cuando el organizador reparta la vuelta, te aparece acá.';
    mostrar('vacio-boton', false);
  }
}

function uidParaProxima(grupos) {
  if (filtro !== 'todos') return filtro;
  if (grupos.some((g) => g.uid === ctx.user.uid)) return ctx.user.uid;
  return grupos.length === 1 ? grupos[0].uid : null;
}

function pintarProxima(grupos) {
  const caja = $('proxima');
  const uid = uidParaProxima(grupos);
  const grupo = grupos.find((g) => g.uid === uid);
  if (!grupo) {
    caja.classList.add('oculto');
    return;
  }
  caja.classList.remove('oculto');
  const p = grupo.paradas.find((x) => x.actual);
  if (!p) {
    caja.innerHTML = `
      <span class="acento">Vuelta terminada</span>
      <strong id="proxima-nombre">Listo, ${esc(grupo.nombre)}: no quedan paradas pendientes.</strong>`;
    return;
  }
  const pendientes = grupo.paradas.filter((x) => !x.hecha);
  const faltan = p.llegada != null ? Math.max(0, Math.round((p.llegada - segundosAhora()) / 60)) : null;
  const esMia = grupo.uid === ctx.user.uid;
  caja.innerHTML = `
    <a class="fila-titulo enlace-plano" href="/pages/parada.html?id=${encodeURIComponent(p.id)}">
      <div class="titulo-bloque">
        <span class="acento">Próxima parada · ${p.numero} de ${grupo.paradas.length}${grupos.length > 1 && filtro === 'todos' ? ` · ${esc(grupo.nombre)}` : ''}</span>
        <strong id="proxima-nombre" class="subtitulo">${esc(p.nombre)}</strong>
        <span class="tenue">${p.tipo === 'retiro' ? 'Retiro · ' : ''}${esc(p.direccion)}${textoHorario(p) ? ` · ${esc(textoHorario(p))}` : ''}</span>
      </div>
      <div class="titulo-bloque">
        <strong class="subtitulo">${horaDeSegundos(p.llegada)}</strong>
        <span class="tenue">${faltan != null ? (faltan ? `en ${faltan} min` : 'ahora') : ''}</span>
      </div>
    </a>
    <div class="botonera">
      ${
        pendientes.length > 1
          ? `<a class="btn btn-primario" href="${linkGoogleMapsVuelta(pendientes)}" target="_blank" rel="noopener">${ICONOS.navegar}Toda la vuelta${
              pendientes.length > PARADAS_POR_TRAMO ? ` (${PARADAS_POR_TRAMO} de ${pendientes.length})` : ''
            }</a>`
          : ''
      }
      <a class="btn ${pendientes.length > 1 ? 'btn-oscuro' : 'btn-primario'}" href="${linkGoogleMaps(p.lat, p.lng)}" target="_blank" rel="noopener">${ICONOS.navegar}Solo esta</a>
      <a class="btn btn-oscuro" href="${linkWaze(p.lat, p.lng)}" target="_blank" rel="noopener">Waze</a>
      ${p.telefono ? `<a class="btn-icono btn-oscuro" href="${linkTel(p.telefono)}" aria-label="Llamar a ${esc(p.nombre)}">${ICONOS.telefono}</a>` : ''}
      <a class="btn-icono btn-oscuro" id="btn-avisar" href="#" target="_blank" rel="noopener" aria-label="Avisar por WhatsApp que vas">${ICONOS.mensaje}</a>
    </div>
    ${esMia ? `<a class="btn btn-oscuro" href="/pages/manejo.html">${ICONOS.auto}Modo manejo</a>` : ''}
    ${
      pendientes.length > PARADAS_POR_TRAMO
        ? `<span class="tenue texto-chico">Google Maps navega hasta ${PARADAS_POR_TRAMO} paradas por vez. Al terminar ese tramo, volvé a tocar “Toda la vuelta”.</span>`
        : ''
    }`;
  conectarAviso($('btn-avisar'), ctx, fecha, () => vuelta, () => (vuelta.paradas || []).find((x) => x.id === p.id));
}

function filaParada(p) {
  let icono = p.numero;
  let claseNum = p.tipo === 'retiro' ? 'retiro' : '';
  const horario = textoHorario(p);
  let detalle = `${esc(p.direccion)}${p.llegada != null ? ` · ${horaDeSegundos(p.llegada)}` : ''}${horario ? ` · ${esc(horario)}` : ''}`;
  if (p.estado === 'entregado') {
    icono = ICONOS.check;
    claseNum = 'ok';
    detalle = `${esc(p.direccion)} · ${esc(textoResultado(p))}`;
  } else if (p.hecha) {
    icono = '!';
    claseNum = 'no';
    detalle = `${esc(p.direccion)} · ${esc(textoResultado(p))}`;
  }
  const etiquetas = [
    p.tipo === 'retiro' && !p.hecha ? '<span class="etiqueta etiqueta-azul">retiro</span>' : '',
    p.urgente && !p.hecha ? '<span class="etiqueta etiqueta-acento">urgente</span>' : ''
  ].join('');
  return `
    <div class="fila ${p.hecha ? 'hecha' : ''} ${p.actual ? 'actual' : ''}">
      <a class="fila enlace-plano sin-padding" href="/pages/parada.html?id=${encodeURIComponent(p.id)}">
        <span class="numero ${claseNum}">${icono}</span>
        <span class="fila-cuerpo">
          <span class="fila-titulo-texto">${esc(p.nombre)}</span>
          <span class="fila-detalle">${detalle}</span>
        </span>
        ${etiquetas}
      </a>
      ${
        p.hecha
          ? ''
          : `<a class="btn-icono sin-borde mas-acento" href="${linkGoogleMaps(p.lat, p.lng)}" target="_blank" rel="noopener" aria-label="Navegar solo a ${esc(p.nombre)}">${ICONOS.navegar}</a>`
      }
    </div>`;
}

function uidDeLaLista(grupos) {
  if (grupos.length !== 1) return null;
  const uid = grupos[0].uid;
  return ctx.organizador || uid === ctx.user.uid ? uid : null;
}

$('btn-reordenar').addEventListener('click', () => {
  const fleteros = fleterosDelEquipo(ctx.equipo);
  const todos = gruposDeVuelta(vuelta, fleteros);
  const grupos = filtro === 'todos' ? todos : todos.filter((g) => g.uid === filtro);
  const uid = uidDeLaLista(grupos);
  if (!uid) return;
  const hoja = elegirOrden({
    titulo: 'Reordenar la vuelta',
    actual: (vuelta && vuelta.orden) || 'optimo',
    ordenes: ORDENES,
    extra: `<label class="interruptor tarjeta" for="desde-aca"><span><strong>Arrancar desde donde estoy</strong><br><span class="texto-tenue">Usa la ubicación actual del celular</span></span><input type="checkbox" id="desde-aca" checked></label>`,
    alElegir: async (orden, el) => {
      const desdeAca = el.querySelector('#desde-aca').checked;
      aviso('Reordenando…');
      try {
        let desde = null;
        if (desdeAca) desde = await miUbicacion().catch(() => null);
        const r = await reordenarFletero({ equipo: ctx.equipo, fecha, vuelta, uid, orden, desde });
        if (r.llegaTarde) aviso(`Listo. Con este orden, ${r.llegaTarde} paradas llegan después de su horario de cierre.`);
        else aviso(`Listo: ${nombreOrden(orden)}${desdeAca && !desde ? ' (sin tu ubicación, desde el punto de salida)' : ''}`);
      } catch (e) {
        aviso(mensajeError(e));
      }
    }
  });
  return hoja;
});

function pintarListas(grupos) {
  $('btn-reordenar').classList.toggle('oculto', !uidDeLaLista(grupos));
  $('lista-titulo').textContent = grupos.length === 1 ? `Paradas de ${grupos[0].uid === ctx.user.uid ? 'tu vuelta' : grupos[0].nombre}` : 'Paradas por fletero';
  $('listas').innerHTML = grupos
    .map(
      (g) => `
      ${grupos.length > 1 ? `<span class="letra-grupo"><i class="punto" style="background:${esc(g.color)}"></i> ${esc(g.nombre)}</span>` : ''}
      <div class="lista">${g.paradas.map(filaParada).join('')}</div>`
    )
    .join('');
}
