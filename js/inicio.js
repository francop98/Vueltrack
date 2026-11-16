/* =========================================================
   Vueltrack — Inicio: la vuelta de hoy
   Saludo y avisos arriba; después el mapa, la próxima parada
   y la lista de paradas (lo que antes era la pantalla Hoy).
   ========================================================= */
import { iniciarPantalla } from './sesion.js';
import { escucharVuelta, fleterosDelEquipo, escucharUbicaciones } from './datos.js';
import { crearMapa, pintarVuelta, pintarFleteros } from './mapa.js';
import { gruposDeVuelta, resumen, paradasSinOrdenar, textoHorario, paradaHecha } from './vuelta.js';
import { conectarAviso, textoResultado, marcarHecho, marcarEstado, htmlBotonesHecho } from './estados.js';
import { compartirSiCorresponde, puedeCompartir, estaCompartiendo, cambiarCompartir, haceCuanto, ubicacionesRecientes } from './enVivo.js';
import { reordenarFletero, mensajeError, nombreOrden, ORDENES } from './ordenar.js';
import { elegirOrden } from './salida.js';
import { abrirAgregarDestino } from './agregarDestino.js';
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
const abiertasHechas = new Set();
let ctx;
let vuelta = null;
let filtro = null;
let mapa = null;

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
  mostrar('mapa-caja', true);
  mostrar('bloque-lista', true);
  mostrar('link-editar', ctx.organizador);
  // Sumar destinos a la vuelta ya armada: quien organiza o el fletero independiente
  mostrar('btn-agregar-destino', !ctx.fleteroDeEquipo && (ctx.organizador || ctx.equipo.modo === 'solo'));

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
      ${
        !p.hecha && puedoMarcar(p)
          ? `<button type="button" class="btn-icono sin-borde btn-hecho-rapido" data-hecho="${esc(p.id)}" aria-label="Marcar ${esc(p.nombre)} como ${p.tipo === 'retiro' ? 'retirado' : 'entregado'}">${ICONOS.check}</button>`
          : ''
      }
    </div>`;
}

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

/* Las pendientes arriba; las ya hechas salen de la ruta y quedan plegadas abajo */
function listaDelGrupo(g) {
  const pendientes = g.paradas.filter((p) => !p.hecha);
  const hechas = g.paradas.filter((p) => p.hecha);
  return `
    ${pendientes.length ? `<div class="lista">${pendientes.map(filaParada).join('')}</div>` : '<p class="texto-tenue">No quedan paradas pendientes.</p>'}
    ${
      hechas.length
        ? `<details class="hechas-plegable"${abiertasHechas.has(g.uid) ? ' open' : ''} data-grupo="${esc(g.uid)}">
        <summary>Hechas · ${hechas.length}</summary>
        <div class="lista">${hechas.map(filaParada).join('')}</div>
      </details>`
        : ''
    }`;
}


$('listas').addEventListener(
  'toggle',
  (e) => {
    const d = e.target.closest && e.target.closest('details[data-grupo]');
    if (!d) return;
    if (d.open) abiertasHechas.add(d.dataset.grupo);
    else abiertasHechas.delete(d.dataset.grupo);
  },
  true
);

/* Marcar hecha con un toque (con "Deshacer" por si fue sin querer) */
async function marcarRapido(id, realizado) {
  const p = ((vuelta && vuelta.paradas) || []).find((x) => x.id === id);
  if (!p || paradaHecha(p)) return;
  const que = realizado || (p.tipo === 'retiro' ? 'retirado' : 'entregado');
  try {
    await marcarHecho(ctx, fecha, id, que);
    if (navigator.vibrate) navigator.vibrate(40);
    aviso(`${p.nombre}: ${que}`, {
      accion: 'Deshacer',
      alTocar: () => marcarEstado(ctx, fecha, id, 'pendiente', { motivo: '', realizado: '', horaEstado: '' }).catch(() => {})
    });
  } catch (err) {
    aviso('No se pudo guardar. Se reintenta cuando vuelva la señal.');
  }
}

$('listas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-hecho]');
  if (!b) return;
  e.preventDefault();
  b.disabled = true;
  marcarRapido(b.dataset.hecho);
});

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
