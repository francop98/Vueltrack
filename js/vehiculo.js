/* =========================================================
   Vueltrack — Mi vehículo: datos, capacidad, vencimientos y service
   (Los datos se guardan en miembros.{uid}.gasto por compatibilidad)
   ========================================================= */
import { iniciarPantalla } from './sesion.js';
import { actualizarMiembro } from './datos.js';
import { TIPOS_VENCIMIENTO, diasHasta, estadoService, kmRecorridosDesde, tieneService } from './mantenimiento.js';
import { fechaISO, fechaLarga, aviso, abrirHoja, esc, idNuevo, confirmar, ordenarAlfa, ICONOS } from './ui.js';

const $ = (id) => document.getElementById(id);
let ctx;

ctx = await iniciarPantalla({
  pagina: 'vehiculo',
  alCambiarEquipo: (nuevo) => {
    ctx = nuevo;
    pintarVencimientos();
  }
});

if (!ctx.fletero) {
  location.replace('/');
}

function cargarDatos() {
  const g = ctx.yo.gasto || {};
  $('nombre').value = ctx.yo.vehiculo || '';
  const tipo = document.querySelector(`input[name="tipo"][value="${g.tipo || 'utilitario'}"]`);
  if (tipo) tipo.checked = true;
  $('capacidad').value = g.capacidad || '';
}
cargarDatos();

let guardando = false;
$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (guardando) return;
  guardando = true;
  $('btn-guardar').disabled = true;
  const anterior = ctx.yo.gasto || {};
  const gasto = {
    ...anterior,
    tipo: (document.querySelector('input[name="tipo"]:checked') || {}).value || 'utilitario',
    capacidad: Math.max(0, Math.round(Number($('capacidad').value) || 0)) || null
  };
  try {
    await actualizarMiembro(ctx.equipo.id, ctx.user.uid, { vehiculo: $('nombre').value.trim(), gasto });
    ctx.yo.gasto = gasto;
    ctx.yo.vehiculo = $('nombre').value.trim();
    aviso('Vehículo guardado');
  } catch (err) {
    aviso('No se pudo guardar. Revisá la conexión.');
  } finally {
    guardando = false;
    $('btn-guardar').disabled = false;
  }
});

/* ---------- Vencimientos ---------- */

async function guardarMantenimiento(cambios) {
  const gasto = { ...(ctx.yo.gasto || {}), ...cambios };
  await actualizarMiembro(ctx.equipo.id, ctx.user.uid, { gasto });
  ctx.yo.gasto = gasto;
  pintarVencimientos();
  pintarService();
}

function pintarVencimientos() {
  const lista = ordenarAlfa((ctx.yo.gasto || {}).vencimientos || []);
  $('sin-vencimientos').classList.toggle('oculto', lista.length > 0);
  $('lista-vencimientos').classList.toggle('oculto', !lista.length);
  $('lista-vencimientos').innerHTML = lista
    .map((v) => {
      const dias = diasHasta(v.fecha);
      const estado = dias < 0 ? 'Vencido' : dias === 0 ? 'Vence hoy' : `Faltan ${dias} ${dias === 1 ? 'día' : 'días'}`;
      const clase = dias <= 0 ? 'no' : dias <= 15 ? 'retiro' : 'ok';
      return `
      <div class="fila">
        <button type="button" class="fila enlace-plano sin-padding" data-vencimiento="${esc(v.id)}">
          <span class="numero ${clase}">${dias <= 15 ? '!' : ICONOS.check}</span>
          <span class="fila-cuerpo">
            <span class="fila-titulo-texto">${esc(v.nombre)}</span>
            <span class="fila-detalle">${esc(fechaLarga(v.fecha))} · ${esc(estado)}</span>
          </span>
        </button>
        <button type="button" class="btn-icono sin-borde btn-peligro" data-borrar-vencimiento="${esc(v.id)}" aria-label="Eliminar ${esc(v.nombre)}">${ICONOS.basura}</button>
      </div>`;
    })
    .join('');
}

function editarVencimiento(v) {
  const actual = v || { id: idNuevo(), nombre: 'VTV', fecha: '' };
  const conocido = TIPOS_VENCIMIENTO.includes(actual.nombre);
  const hoja = abrirHoja({
    titulo: v ? 'Editar vencimiento' : 'Nuevo vencimiento',
    html: `
      <div class="campo">
        <label for="vt-tipo">Qué vence</label>
        <select id="vt-tipo" class="input">
          ${TIPOS_VENCIMIENTO.map((t) => `<option value="${esc(t)}" ${(conocido ? actual.nombre : 'Otro') === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
        </select>
      </div>
      <div class="campo ${conocido && actual.nombre !== 'Otro' ? 'oculto' : ''}" id="vt-otro-caja">
        <label for="vt-otro">Nombre</label>
        <input id="vt-otro" value="${conocido ? '' : esc(actual.nombre)}" placeholder="Ej.: habilitación municipal">
      </div>
      <div class="campo">
        <label for="vt-fecha">Fecha de vencimiento</label>
        <input type="date" id="vt-fecha" class="input" value="${esc(actual.fecha)}">
      </div>
      <button type="button" class="btn btn-primario btn-grande" id="vt-guardar">Guardar</button>`
  });
  const el = hoja.el;
  el.querySelector('#vt-tipo').addEventListener('change', (e) => el.querySelector('#vt-otro-caja').classList.toggle('oculto', e.target.value !== 'Otro'));
  el.querySelector('#vt-guardar').addEventListener('click', async () => {
    const tipo = el.querySelector('#vt-tipo').value;
    const nombre = tipo === 'Otro' ? el.querySelector('#vt-otro').value.trim() || 'Otro' : tipo;
    const fecha = el.querySelector('#vt-fecha').value;
    if (!fecha) {
      aviso('Falta la fecha');
      return;
    }
    const lista = ((ctx.yo.gasto || {}).vencimientos || []).filter((x) => x.id !== actual.id);
    await guardarMantenimiento({ vencimientos: [...lista, { id: actual.id, nombre, fecha }] });
    hoja.cerrar();
    aviso('Vencimiento guardado');
  });
}

$('btn-vencimiento').addEventListener('click', () => editarVencimiento(null));
$('lista-vencimientos').addEventListener('click', async (e) => {
  const lista = (ctx.yo.gasto || {}).vencimientos || [];
  const borrar = e.target.closest('[data-borrar-vencimiento]');
  if (borrar) {
    const v = lista.find((x) => x.id === borrar.dataset.borrarVencimiento);
    if (!v) return;
    const ok = await confirmar({ titulo: '¿Eliminar este vencimiento?', texto: `${v.nombre} · ${fechaLarga(v.fecha)}`, aceptar: 'Eliminar', peligro: true });
    if (!ok) return;
    await guardarMantenimiento({ vencimientos: lista.filter((x) => x.id !== v.id) });
    aviso('Vencimiento eliminado');
    return;
  }
  const b = e.target.closest('[data-vencimiento]');
  if (b) editarVencimiento(lista.find((x) => x.id === b.dataset.vencimiento));
});

/* ---------- Service por km ---------- */

let kmDesdeTablero = 0;
async function pintarService() {
  const gasto = ctx.yo.gasto || {};
  const caja = $('estado-service');
  if (!tieneService(gasto)) {
    caja.innerHTML = '<span class="texto-tenue">Cargá cada cuántos km hacés el service y te avisamos cuando se acerque, sumando los km de tus vueltas.</span>';
    $('btn-service').textContent = 'Cargar datos del service';
    return;
  }
  kmDesdeTablero = await kmRecorridosDesde(ctx.equipo.id, ctx.user.uid, gasto.service.tableroFecha);
  const s = estadoService(gasto, kmDesdeTablero);
  caja.innerHTML = `
    <span class="texto-tenue">Próximo service a los ${s.proximo.toLocaleString('es-AR')} km</span>
    <strong class="subtitulo">${s.faltan > 0 ? `Faltan unos ${s.faltan.toLocaleString('es-AR')} km` : `Atrasado unos ${Math.abs(s.faltan).toLocaleString('es-AR')} km`}</strong>
    <span class="texto-tenue">Tablero estimado: ${s.tablero.toLocaleString('es-AR')} km (actualizalo de vez en cuando)</span>`;
  $('btn-service').textContent = 'Actualizar km o service';
}

$('btn-service').addEventListener('click', () => {
  const s = (ctx.yo.gasto || {}).service || {};
  const estimado = estadoService(ctx.yo.gasto, kmDesdeTablero);
  const hoja = abrirHoja({
    titulo: 'Service del vehículo',
    html: `
      <div class="campo">
        <label for="sv-tablero">Km que marca hoy el tablero</label>
        <input id="sv-tablero" type="number" inputmode="numeric" min="0" step="1" value="${esc(estimado ? estimado.tablero : s.tableroKm || '')}" placeholder="Ej.: 85000">
      </div>
      <div class="grilla-2 siempre">
        <div class="campo">
          <label for="sv-ultimo">Km del último service</label>
          <input id="sv-ultimo" type="number" inputmode="numeric" min="0" step="1" value="${esc(s.ultimoKm ?? '')}" placeholder="Ej.: 80000">
        </div>
        <div class="campo">
          <label for="sv-cada">Cada cuántos km</label>
          <input id="sv-cada" type="number" inputmode="numeric" min="0" step="500" value="${esc(s.cadaKm || 10000)}">
        </div>
      </div>
      <button type="button" class="btn btn-contorno" id="sv-hoy">Hice el service hoy</button>
      <button type="button" class="btn btn-primario btn-grande" id="sv-guardar">Guardar</button>`
  });
  const el = hoja.el;
  el.querySelector('#sv-hoy').addEventListener('click', () => {
    el.querySelector('#sv-ultimo').value = el.querySelector('#sv-tablero').value;
  });
  el.querySelector('#sv-guardar').addEventListener('click', async () => {
    const tableroKm = Number(el.querySelector('#sv-tablero').value) || 0;
    const ultimoKm = Number(el.querySelector('#sv-ultimo').value);
    const cadaKm = Number(el.querySelector('#sv-cada').value) || 0;
    if (!(tableroKm > 0) || !(cadaKm > 0) || !Number.isFinite(ultimoKm)) {
      aviso('Completá los km del tablero, del último service y cada cuántos km');
      return;
    }
    await guardarMantenimiento({ service: { tableroKm, ultimoKm, cadaKm, tableroFecha: fechaISO() } });
    hoja.cerrar();
    aviso('Service guardado');
  });
});

pintarVencimientos();
pintarService();
