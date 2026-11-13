/* =========================================================
   Vueltrack — pantalla Hoy
   ========================================================= */
import { iniciarPantalla } from './sesion.js';
import { escucharVuelta, fleterosDelEquipo } from './datos.js';
import { crearMapa, pintarVuelta } from './mapa.js';
import { gruposDeVuelta, resumen, paradasSinOrdenar } from './vuelta.js';
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
  linkWhatsApp
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
      location.href = `parada.html?id=${encodeURIComponent(p.id)}`;
    }
  });
  $('leyenda').innerHTML =
    grupos.length > 1
      ? grupos
          .map((g) => `<span><i class="punto" style="background:${esc(g.color)}"></i>${esc(g.nombre)} · ${g.paradas.length}</span>`)
          .join('')
      : '';

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
  const faltan = p.llegada != null ? Math.max(0, Math.round((p.llegada - segundosAhora()) / 60)) : null;
  const texto = `¡Hola! Soy ${ctx.yo.nombre} de ${ctx.equipo.nombre}. Estoy llegando${faltan ? ` en unos ${faltan} minutos` : ''}.`;
  caja.innerHTML = `
    <a class="fila-titulo enlace-plano" href="parada.html?id=${encodeURIComponent(p.id)}">
      <div class="titulo-bloque">
        <span class="acento">Próxima parada · ${p.numero} de ${grupo.paradas.length}${grupos.length > 1 && filtro === 'todos' ? ` · ${esc(grupo.nombre)}` : ''}</span>
        <strong id="proxima-nombre" class="subtitulo">${esc(p.nombre)}</strong>
        <span class="tenue">${esc(p.direccion)}${p.hasta ? ` · recibe hasta ${esc(p.hasta)}` : ''}</span>
      </div>
      <div class="titulo-bloque">
        <strong class="subtitulo">${horaDeSegundos(p.llegada)}</strong>
        <span class="tenue">${faltan != null ? (faltan ? `en ${faltan} min` : 'ahora') : ''}</span>
      </div>
    </a>
    <div class="botonera">
      <a class="btn btn-primario" href="${linkGoogleMaps(p.lat, p.lng)}" target="_blank" rel="noopener">${ICONOS.navegar}Navegar</a>
      <a class="btn btn-oscuro" href="${linkWaze(p.lat, p.lng)}" target="_blank" rel="noopener">Waze</a>
      ${p.telefono ? `<a class="btn-icono btn-oscuro" href="${linkTel(p.telefono)}" aria-label="Llamar a ${esc(p.nombre)}">${ICONOS.telefono}</a>` : ''}
      ${p.telefono ? `<a class="btn-icono btn-oscuro" href="${linkWhatsApp(p.telefono, texto)}" target="_blank" rel="noopener" aria-label="Avisar por WhatsApp que llegás">${ICONOS.mensaje}</a>` : ''}
    </div>`;
}

function filaParada(p) {
  let icono = p.numero;
  let claseNum = '';
  let detalle = `${esc(p.direccion)}${p.llegada != null ? ` · ${horaDeSegundos(p.llegada)}` : ''}`;
  if (p.estado === 'entregado') {
    icono = ICONOS.check;
    claseNum = 'ok';
    detalle = `${esc(p.direccion)} · entregado ${p.horaEstado ? esc(p.horaEstado) : ''}`;
  } else if (p.estado === 'noEstaba') {
    icono = '!';
    claseNum = 'no';
    detalle = `${esc(p.direccion)} · no estaba`;
  }
  return `
    <a class="fila ${p.hecha ? 'hecha' : ''} ${p.actual ? 'actual' : ''}" href="parada.html?id=${encodeURIComponent(p.id)}">
      <span class="numero ${claseNum}">${icono}</span>
      <span class="fila-cuerpo">
        <span class="fila-titulo-texto">${esc(p.nombre)}</span>
        <span class="fila-detalle">${detalle}</span>
      </span>
      ${p.urgente && !p.hecha ? '<span class="etiqueta etiqueta-acento">urgente</span>' : ''}
    </a>`;
}

function pintarListas(grupos) {
  $('lista-titulo').textContent = grupos.length === 1 ? `Paradas de ${grupos[0].uid === ctx.user.uid ? 'tu vuelta' : grupos[0].nombre}` : 'Paradas por fletero';
  $('listas').innerHTML = grupos
    .map(
      (g) => `
      ${grupos.length > 1 ? `<span class="letra-grupo"><i class="punto" style="background:${esc(g.color)}"></i> ${esc(g.nombre)}</span>` : ''}
      <div class="lista">${g.paradas.map(filaParada).join('')}</div>`
    )
    .join('');
}
