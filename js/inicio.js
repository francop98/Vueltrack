/* =========================================================
   Vueltrack — Inicio: la vuelta de hoy
   Saludo y avisos arriba; después la próxima parada
   y la lista de paradas (lo que antes era la pantalla Hoy).
   ========================================================= */
import { iniciarPantalla } from './sesion.js';
import { escucharVuelta, fleterosDelEquipo } from './datos.js';
import { gruposDeVuelta, resumen, paradasSinOrdenar, textoHorario, paradaHecha } from './vuelta.js';
import { conectarAviso, textoResultado, marcarHecho, marcarEstado, htmlBotonesHecho } from './estados.js';
import { compartirSiCorresponde, puedeCompartir, estaCompartiendo, cambiarCompartir } from './enVivo.js';
import { reordenarFletero, mensajeError, nombreOrden, ORDENES } from './ordenar.js';
import { elegirOrden } from './salida.js';
import { abrirAgregarDestino } from './agregarDestino.js';
import { borrarDestino, preguntarBorrar, abrirAccionesDestino } from './accionesParada.js';
import { miUbicacion } from './rutas.js';
import { abrirGuia, guiaVista } from './guia.js';
import { instalarApp, sePuedeInstalar } from './instalar.js';
import { elegirZona } from './zona.js';
import { alertasDelVehiculo, kmRecorridosDesde, tieneService } from './mantenimiento.js';
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
  linkWhatsApp,
  PARADAS_POR_TRAMO,
  aviso
} from './ui.js';

const $ = (id) => document.getElementById(id);
const fecha = fechaISO();
// Quién puede marcar: quien organiza o el fletero de esa parada
const puedoMarcar = (p) => ctx.organizador || p.fleteroUid === ctx.user.uid;
// Fila deslizada que muestra sus acciones
let abierta = null;
let ctx;
let vuelta = null;
let filtro = null;

$('fecha').textContent = fechaLarga(fecha);

ctx = await iniciarPantalla({
  pagina: 'inicio',
  alCambiarEquipo: (nuevo) => {
    ctx = nuevo;
    pintar();
  }
});

filtro = ctx.organizador ? 'todos' : ctx.user.uid;
compartirSiCorresponde(ctx);

/* ---------- Compartir ubicación (el mapa con los fleteros en vivo está en Armar) ---------- */
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

escucharVuelta(ctx.equipo.id, fecha, (v) => {
  vuelta = conCambiosLocales(v);
  pintar();
});

function mostrar(id, si) {
  $(id).classList.toggle('oculto', !si);
}

function pintar() {
  $('cargando').classList.add('oculto');
  pintarCabecera();
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
  mostrar('bloque-lista', true);
  mostrar('link-editar', ctx.organizador);
  // Sumar destinos a la vuelta ya armada: quien organiza o el fletero independiente
  mostrar('btn-agregar-destino', !ctx.fleteroDeEquipo && (ctx.organizador || ctx.equipo.modo === 'solo'));

  const r = resumen(grupos);
  $('st-paradas').textContent = r.hechas ? `${r.hechas}/${r.paradas}` : r.paradas;
  $('st-km').textContent = formatoKm(r.distancia);
  $('st-tiempo').textContent = formatoDuracion(r.duracion);
  $('st-fin').textContent = r.fin != null ? horaDeSegundos(r.fin) : '—';

  pintarProxima(grupos);
  pintarListas(grupos);
  pintarHechas(grupos);
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
  ['stats', 'proxima', 'bloque-lista', 'bloque-hechas'].forEach((id) => mostrar(id, false));
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
  // Quien organiza no queda "primero": solo se muestra la suya si es el único que sale
  if (!ctx.organizador && grupos.some((g) => g.uid === ctx.user.uid)) return ctx.user.uid;
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
    ${puedoMarcar(p) ? htmlBotonesHecho(p, '').replace(/data-accion=/g, `data-parada="${esc(p.id)}" data-accion=`) : ''}
    ${esMia ? `<a class="btn btn-oscuro" href="/pages/manejo.html">${ICONOS.auto}Modo manejo</a>` : ''}
    ${
      pendientes.length > PARADAS_POR_TRAMO
        ? `<span class="tenue texto-chico">Google Maps navega hasta ${PARADAS_POR_TRAMO} paradas por vez. Al terminar ese tramo, volvé a tocar “Toda la vuelta”.</span>`
        : ''
    }`;
  conectarAviso($('btn-avisar'), ctx, fecha, () => vuelta, () => (vuelta.paradas || []).find((x) => x.id === p.id));
}

function filaParada(p) {
  const horario = textoHorario(p);
  const resumen = [p.llegada != null ? horaDeSegundos(p.llegada) : '', p.direccion, horario].filter(Boolean).join(' · ');
  const etiquetas = [
    `<span class="etiqueta ${p.tipo === 'retiro' ? 'etiqueta-azul' : 'etiqueta-verde'}">${p.tipo === 'retiro' ? 'retiro' : 'entrega'}</span>`,
    p.urgente ? '<span class="etiqueta etiqueta-acento">urgente</span>' : ''
  ].join('');
  const frente = `
    <div class="fila fila-destino ${p.actual ? 'actual' : ''} ${deslizable(p) ? 'fila-frente' : ''}" data-fila="${esc(p.id)}">
      <button type="button" class="fila enlace-plano sin-padding" data-abrir="${esc(p.id)}" aria-label="Opciones de ${esc(p.nombre)}">
        <span class="numero ${p.tipo === 'retiro' ? 'retiro' : ''}">${p.numero}</span>
        <span class="fila-cuerpo">
          <span class="fila-titulo-texto">${esc(p.nombre)}</span>
          <span class="fila-detalle">${esc(resumen)}</span>
          <span class="fila-etiquetas">${etiquetas}</span>
        </span>
      </button>
      ${
        puedoMarcar(p)
          ? `<button type="button" class="btn-tilde" data-hecho="${esc(p.id)}" aria-label="Marcar ${esc(p.nombre)} como ${p.tipo === 'retiro' ? 'retirado' : 'entregado'}">${ICONOS.check}</button>`
          : ''
      }
    </div>`;
  if (!deslizable(p)) return frente;
  // Deslizando a la izquierda aparece Borrar
  return `
    <div class="fila-deslizable" data-desliza="${esc(p.id)}">
      <div class="fila-acciones">
        <button type="button" class="accion-fila accion-borrar" data-borrar="${esc(p.id)}">${ICONOS.basura}<span>Borrar</span></button>
      </div>
      ${frente}
    </div>`;
}

/* Gestionar (borrar, reasignar, otro día): quien organiza o el independiente, no el fletero de equipo */
const puedoGestionar = () => !ctx.fleteroDeEquipo && (ctx.organizador || ctx.equipo.modo === 'solo');
function deslizable(p) {
  return !p.hecha && puedoGestionar();
}

/* ---------- Cambios que se ven al instante ----------
   Al tocar el tilde o borrar, la fila sale de la lista en el momento, sin esperar
   a que confirme el servidor. Si llega una versión vieja de la vuelta mientras
   tanto, el cambio se sigue mostrando hasta que el servidor lo confirme. */
const cambiosLocales = new Map();

function conCambiosLocales(v) {
  if (!v || !cambiosLocales.size) return v;
  const ahora = Date.now();
  let paradas = v.paradas || [];
  cambiosLocales.forEach((c, id) => {
    const servidor = paradas.find((x) => x.id === id);
    const confirmado = c.borrar ? !servidor : servidor && servidor.estado === c.datos.estado;
    if (confirmado || ahora > c.vence) {
      cambiosLocales.delete(id);
      return;
    }
    paradas = c.borrar ? paradas.filter((x) => x.id !== id) : paradas.map((x) => (x.id === id ? { ...x, ...c.datos } : x));
  });
  return { ...v, paradas };
}

function aplicarLocal(id, cambio) {
  cambiosLocales.set(id, { ...cambio, vence: Date.now() + 20000 });
  vuelta = conCambiosLocales(vuelta);
}

/* La fila se pinta de verde (o rojo) y se va; después se repinta todo */
function animarSalida(id, clase, despues) {
  const fila = document.querySelector(`#listas [data-fila="${CSS.escape(id)}"]`);
  const caja = fila && (fila.closest('.fila-deslizable') || fila);
  if (!caja) {
    despues();
    return;
  }
  caja.classList.add(clase);
  setTimeout(() => {
    caja.classList.add('saliendo');
    setTimeout(despues, 220);
  }, 260);
}

/* Marcar hecha con un toque (con "Deshacer" por si fue sin querer) */
async function marcarRapido(id, realizado) {
  const p = ((vuelta && vuelta.paradas) || []).find((x) => x.id === id);
  if (!p || paradaHecha(p)) return;
  const que = realizado || (p.tipo === 'retiro' ? 'retirado' : 'entregado');
  if (navigator.vibrate) navigator.vibrate(40);
  const hora = horaDeSegundos(segundosAhora());
  animarSalida(id, 'marcada', () => {
    aplicarLocal(id, { datos: { estado: 'entregado', realizado: que, horaEstado: hora, marcadoPor: ctx.user.uid } });
    pintar();
  });
  aviso(`${p.nombre}: ${que}`, {
    accion: 'Deshacer',
    alTocar: () => {
      aplicarLocal(id, { datos: { estado: 'pendiente', realizado: '', horaEstado: '' } });
      pintar();
      marcarEstado(ctx, fecha, id, 'pendiente', { motivo: '', realizado: '', horaEstado: '' }).catch(() => {});
    }
  });
  try {
    await marcarHecho(ctx, fecha, id, que);
  } catch (err) {
    console.error('No se pudo marcar', err);
    cambiosLocales.delete(id);
    aviso(err && err.code === 'permission-denied' ? 'No tenés permiso para marcar esta parada.' : 'No se pudo guardar. Revisá la conexión y probá de nuevo.');
    pintar();
  }
}

async function borrarRapido(id, preguntar = true) {
  const p = ((vuelta && vuelta.paradas) || []).find((x) => x.id === id);
  if (!p) return;
  if (preguntar && !(await preguntarBorrar(p))) {
    cerrarAbierta();
    return;
  }
  animarSalida(id, 'borrada', () => {
    aplicarLocal(id, { borrar: true });
    pintar();
  });
  const ok = await borrarDestino({ ctx, fecha, parada: p, sinPreguntar: true });
  if (!ok) {
    cambiosLocales.delete(id);
    pintar();
  }
}

function abrirDestino(id) {
  const p = ((vuelta && vuelta.paradas) || []).find((x) => x.id === id);
  if (!p) return;
  abrirAccionesDestino({
    ctx,
    fecha,
    vuelta,
    parada: p,
    puedeMarcar: puedoMarcar(p) && !paradaHecha(p),
    puedeGestionar: puedoGestionar() && !paradaHecha(p),
    alHecho: (pid, que) => marcarRapido(pid, que),
    alBorrar: (pid) => borrarRapido(pid, true)
  });
}

/* ---------- Deslizar una fila a la izquierda (Borrar) ---------- */
function cerrarAbierta() {
  if (!abierta) return;
  const frente = abierta.querySelector('.fila-frente');
  if (frente) frente.style.transform = '';
  abierta.classList.remove('abierta');
  abierta = null;
}

(function conectarDeslizar() {
  const cont = $('listas');
  let fila = null;
  let x0 = 0;
  let y0 = 0;
  let dx = 0;
  let base = 0;
  let movio = false;
  let horizontal = null;
  const ancho = () => (fila ? fila.querySelector('.fila-acciones').offsetWidth : 0);

  cont.addEventListener('pointerdown', (e) => {
    const f = e.target.closest('.fila-deslizable');
    movio = false;
    if (!f || e.target.closest('.fila-acciones')) return;
    if (abierta && abierta !== f) cerrarAbierta();
    fila = f;
    x0 = e.clientX;
    y0 = e.clientY;
    dx = 0;
    base = f.classList.contains('abierta') ? -ancho() : 0;
    horizontal = null;
  });
  cont.addEventListener('pointermove', (e) => {
    if (!fila) return;
    const mx = e.clientX - x0;
    const my = e.clientY - y0;
    if (horizontal === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) horizontal = Math.abs(mx) > Math.abs(my);
    if (!horizontal) return;
    movio = true;
    fila.classList.add('deslizando');
    dx = Math.max(-ancho() - 30, Math.min(0, base + mx));
    const frente = fila.querySelector('.fila-frente');
    frente.style.transition = 'none';
    frente.style.transform = `translateX(${dx}px)`;
  });
  const soltar = () => {
    if (!fila) return;
    const frente = fila.querySelector('.fila-frente');
    frente.style.transition = '';
    fila.classList.remove('deslizando');
    if (movio) {
      if (dx < -ancho() / 2) {
        frente.style.transform = `translateX(${-ancho()}px)`;
        fila.classList.add('abierta');
        abierta = fila;
      } else {
        frente.style.transform = '';
        fila.classList.remove('abierta');
        if (abierta === fila) abierta = null;
      }
    }
    fila = null;
  };
  cont.addEventListener('pointerup', soltar);
  cont.addEventListener('pointercancel', soltar);
  // Si se deslizó, el toque no abre nada; con la fila abierta, tocarla la cierra
  cont.addEventListener(
    'click',
    (e) => {
      if (movio) {
        e.preventDefault();
        e.stopPropagation();
        movio = false;
        return;
      }
      const f = e.target.closest('.fila-deslizable');
      if (f && f.classList.contains('abierta') && !e.target.closest('.fila-acciones')) {
        e.preventDefault();
        e.stopPropagation();
        cerrarAbierta();
      }
    },
    true
  );
  document.addEventListener('pointerdown', (e) => {
    if (abierta && !abierta.contains(e.target)) cerrarAbierta();
  });
})();

$('listas').addEventListener('click', (e) => {
  const tilde = e.target.closest('[data-hecho]');
  if (tilde) {
    tilde.disabled = true;
    marcarRapido(tilde.dataset.hecho);
    return;
  }
  const borrar = e.target.closest('[data-borrar]');
  if (borrar) {
    borrarRapido(borrar.dataset.borrar, true);
    return;
  }
  const abrir = e.target.closest('[data-abrir]');
  if (abrir) abrirDestino(abrir.dataset.abrir);
});

function uidDeLaLista(grupos) {
  if (grupos.length !== 1) return null;
  const uid = grupos[0].uid;
  return ctx.organizador || uid === ctx.user.uid ? uid : null;
}

$('btn-agregar-destino').addEventListener('click', () => {
  abrirAgregarDestino({ ctx, fecha, vuelta });
});

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
    extra: `<button type="button" class="opcion-lista" id="btn-a-mano">${ICONOS.arrastrar}<span><strong>A mano, arrastrando</strong><span>Vos elegís el orden y se recalculan los horarios</span></span></button>
      <label class="interruptor tarjeta" for="desde-aca"><span><strong>Arrancar desde donde estoy</strong><br><span class="texto-tenue">Usa la ubicación actual del celular</span></span><input type="checkbox" id="desde-aca" checked></label>`,
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
  hoja.el.querySelector('#btn-a-mano').addEventListener('click', () => {
    hoja.cerrar();
    empezarArrastre(uid);
  });
  return hoja;
});

/* ---------- Ordenar a mano, arrastrando ---------- */

let arrastre = null; // { uid } mientras se está ordenando a mano

function empezarArrastre(uid) {
  arrastre = { uid };
  pintar();
  $('bloque-lista').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function htmlArrastre(grupo) {
  const pendientes = grupo.paradas.filter((p) => !p.hecha);
  return `
    <div class="tarjeta arrastre-ayuda">
      <span class="texto-tenue">Mantené apretado <strong>${ICONOS.arrastrar}</strong> y arrastrá cada parada al lugar que quieras.</span>
      <div class="grilla-2 siempre">
        <button type="button" class="btn" id="arrastre-cancelar">Cancelar</button>
        <button type="button" class="btn btn-primario" id="arrastre-guardar">Guardar orden</button>
      </div>
    </div>
    <div class="lista" id="lista-arrastre">
      ${pendientes
        .map(
          (p, i) => `
        <div class="fila fila-arrastre" data-id="${esc(p.id)}">
          <span class="numero ${p.tipo === 'retiro' ? 'retiro' : ''}">${i + 1}</span>
          <span class="fila-cuerpo">
            <span class="fila-titulo-texto">${esc(p.nombre)}</span>
            <span class="fila-detalle">${esc(p.direccion)}</span>
          </span>
          <button type="button" class="asa" aria-label="Mover ${esc(p.nombre)}">${ICONOS.arrastrar}</button>
        </div>`
        )
        .join('')}
    </div>`;
}

function renumerar(lista) {
  lista.querySelectorAll('.fila-arrastre .numero').forEach((n, i) => {
    n.textContent = i + 1;
  });
}

/* Arrastre con el dedo (o el mouse): la fila se mueve al pasar por encima de otra */
function activarArrastre(lista) {
  const contenedor = document.querySelector('.app');
  let fila = null;
  lista.addEventListener('pointerdown', (e) => {
    const asa = e.target.closest('.asa');
    if (!asa) return;
    e.preventDefault();
    fila = asa.closest('.fila-arrastre');
    fila.classList.add('arrastrando');
    asa.setPointerCapture(e.pointerId);
  });
  lista.addEventListener('pointermove', (e) => {
    if (!fila) return;
    // Desplaza la pantalla si el dedo llega a los bordes
    if (e.clientY < 110) contenedor.scrollTop -= 10;
    else if (e.clientY > window.innerHeight - 140) contenedor.scrollTop += 10;
    const debajo = document.elementFromPoint(e.clientX, e.clientY);
    const otra = debajo && debajo.closest('.fila-arrastre');
    if (!otra || otra === fila || otra.parentNode !== lista) return;
    const caja = otra.getBoundingClientRect();
    const despues = e.clientY > caja.top + caja.height / 2;
    lista.insertBefore(fila, despues ? otra.nextSibling : otra);
    renumerar(lista);
  });
  const soltar = () => {
    if (!fila) return;
    fila.classList.remove('arrastrando');
    fila = null;
  };
  lista.addEventListener('pointerup', soltar);
  lista.addEventListener('pointercancel', soltar);
}

function conectarArrastre() {
  const lista = $('lista-arrastre');
  if (!lista) return;
  activarArrastre(lista);
  $('arrastre-cancelar').addEventListener('click', () => {
    arrastre = null;
    pintar();
  });
  $('arrastre-guardar').addEventListener('click', async (e) => {
    const boton = e.currentTarget;
    const ids = [...lista.querySelectorAll('.fila-arrastre')].map((f) => f.dataset.id);
    boton.disabled = true;
    aviso('Calculando horarios en ese orden…');
    try {
      const r = await reordenarFletero({ equipo: ctx.equipo, fecha, vuelta, uid: arrastre.uid, orden: 'manual', ordenManual: ids, desde: null });
      arrastre = null;
      aviso(r.llegaTarde ? `Guardado. Con este orden, ${r.llegaTarde} paradas llegan después de su horario.` : 'Orden guardado');
      pintar();
    } catch (err) {
      boton.disabled = false;
      aviso(mensajeError(err));
    }
  });
}



function pintarListas(grupos) {
  abierta = null;
  if (arrastre) {
    const grupo = grupos.find((g) => g.uid === arrastre.uid);
    // Mientras se arrastra, un cambio de la vuelta no desarma lo que se está ordenando
    if (grupo && $('lista-arrastre')) return;
    if (grupo) {
      $('btn-reordenar').classList.add('oculto');
      $('link-editar').classList.add('oculto');
      $('btn-agregar-destino').classList.add('oculto');
      $('lista-titulo').textContent = 'Ordenar a mano';
      $('listas').innerHTML = htmlArrastre(grupo);
      conectarArrastre();
      return;
    }
    arrastre = null;
  }
  // Reordenar: lo hace quien organiza o el fletero independiente, no el fletero de equipo
  $('btn-reordenar').classList.toggle('oculto', !uidDeLaLista(grupos) || ctx.fleteroDeEquipo);
  $('lista-titulo').textContent = grupos.length === 1 ? `Paradas de ${grupos[0].uid === ctx.user.uid ? 'tu vuelta' : grupos[0].nombre}` : 'Paradas por fletero';
  const externos = new Set(fleterosDelEquipo(ctx.equipo).filter((f) => f.externo).map((f) => f.uid));
  $('listas').innerHTML = grupos
    .map(
      (g) => `
      ${grupos.length > 1 ? `<span class="letra-grupo"><i class="punto" style="background:${esc(g.color)}"></i> ${esc(g.nombre)}</span>` : ''}
      ${
        ctx.organizador && externos.has(g.uid) && g.paradas.some((p) => !p.hecha)
          ? `<a class="btn btn-contorno" href="${esc(linkRecorridoWhatsApp(g))}" target="_blank" rel="noopener">${ICONOS.mensaje}Mandarle el recorrido a ${esc(g.nombre.split(' ')[0])} por WhatsApp</a>`
          : ''
      }
      ${listaDelGrupo(g)}`
    )
    .join('');
}

/* Solo las pendientes: al marcarlas hechas pasan a "Hechas hoy", más abajo */
function listaDelGrupo(g) {
  const pendientes = g.paradas.filter((p) => !p.hecha);
  return pendientes.length
    ? `<div class="lista">${pendientes.map(filaParada).join('')}</div>`
    : '<p class="texto-tenue">No quedan paradas pendientes.</p>';
}

/* Hechas hoy: lo que ya salió de la ruta, lo último arriba, en verde */
function pintarHechas(grupos) {
  const varios = grupos.length > 1;
  const hechas = grupos
    .flatMap((g) => g.paradas.filter((p) => p.hecha).map((p) => ({ ...p, quien: g.nombre })))
    .sort((a, b) => String(b.horaEstado || '').localeCompare(String(a.horaEstado || '')));
  mostrar('bloque-hechas', hechas.length > 0);
  $('hechas-titulo').textContent = `Hechas hoy · ${hechas.length}`;
  $('lista-hechas').innerHTML = hechas
    .map((p) => {
      const bien = p.estado === 'entregado';
      return `
      <a class="fila fila-hecha ${bien ? '' : 'fila-no-hecha'} enlace-plano" href="/pages/parada.html?id=${encodeURIComponent(p.id)}">
        <span class="numero">${bien ? ICONOS.check : '!'}</span>
        <span class="fila-cuerpo">
          <span class="fila-titulo-texto">${esc(p.nombre)}</span>
          <span class="fila-detalle">${esc([textoResultado(p), varios ? p.quien : '', p.direccion].filter(Boolean).join(' · '))}</span>
        </span>
      </a>`;
    })
    .join('');
}

$('proxima').addEventListener('click', (e) => {
  const b = e.target.closest('[data-accion="entregado"], [data-accion="retirado"]');
  if (!b || !b.dataset.parada) return;
  b.disabled = true;
  marcarRapido(b.dataset.parada, b.dataset.accion);
});

/* Fletero sin la app: el recorrido ordenado, con horarios y links de Google Maps, por WhatsApp */
function linkRecorridoWhatsApp(g) {
  const f = fleterosDelEquipo(ctx.equipo).find((x) => x.uid === g.uid) || {};
  const pendientes = g.paradas.filter((p) => !p.hecha);
  const lineas = pendientes.map((p, i) => {
    const extra = [p.llegada != null ? `aprox. ${horaDeSegundos(p.llegada)}` : '', textoHorario(p), p.tipo === 'retiro' ? 'RETIRO' : '', p.nota].filter(Boolean).join(' · ');
    return `${i + 1}. ${p.nombre}${p.nombre !== p.direccion ? ` – ${p.direccion}` : ''}${extra ? ` (${extra})` : ''}${p.telefono ? ` · Tel. ${p.telefono}` : ''}`;
  });
  const tramos = [];
  for (let i = 0; i < pendientes.length; i += PARADAS_POR_TRAMO) tramos.push(linkGoogleMapsVuelta(pendientes.slice(i, i + PARADAS_POR_TRAMO)));
  const texto = [
    `Hola ${String(f.nombre || '').split(' ')[0]}! Tu vuelta de hoy (${pendientes.length} ${pendientes.length === 1 ? 'parada' : 'paradas'}):`,
    '',
    ...lineas,
    '',
    tramos.length === 1 ? `Recorrido en Google Maps: ${tramos[0]}` : tramos.map((t, i) => `Recorrido ${i + 1}: ${t}`).join('\n')
  ].join('\n');
  return linkWhatsApp(f.telefono || '', texto);
}

/* =========================================================
   Extras del Inicio: guía, instalar, zona y vencimientos
   ========================================================= */

/* Guía la primera vez (o si se pidió desde el onboarding) */
if (new URLSearchParams(location.search).get('guia') === '1' || !guiaVista(ctx)) {
  history.replaceState(null, '', '/');
  setTimeout(() => abrirGuia(ctx), 400);
}

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

$('aviso-zona').addEventListener('click', () => elegirZona(ctx.equipo));

function pintarCabecera() {
  window.dispatchEvent(new Event('vueltrack:listo'));
  $('aviso-zona').classList.toggle('oculto', !ctx.organizador || !!ctx.equipo.zona);
  const nombre = (ctx.yo.nombre || '').split(' ')[0];
  $('saludo').textContent = nombre ? `Hola, ${nombre}` : 'Hola';
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
