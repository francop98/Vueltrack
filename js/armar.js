/* =========================================================
   Vueltrack — Armar la vuelta
   ========================================================= */
import { iniciarPantalla } from './sesion.js';
import {
  escucharVuelta,
  escucharClientes,
  guardarVuelta,
  obtenerVuelta,
  agregarFleteroSinApp,
  limpiarFleterosTemporales,
  borrarVuelta,
  actualizarEquipo,
  fleterosDelEquipo
} from './datos.js';
import { crearBuscador } from './buscador.js';
import { ordenarYGuardar, mensajeError, horaDeSalida, nombreOrden, ORDENES } from './ordenar.js';
import { elegirPuntoDeSalida, elegirOrden } from './salida.js';
import { editarParada, confirmarQuitar } from './editarParada.js';
import { paradaHecha, paradaDesdeCliente, paradaNueva, copiaParaOtroDia, textoHorario } from './vuelta.js';
import { buscarDirecciones } from './rutas.js';
import { activosDelDia, asignarPendientes, redistribuirPorZona, incompatibles } from './asignar.js';
import { editarQueLleva, puedeLlevar, noLlevaDelDia, selectorCargas } from './cargas.js';
import { direccionesFrecuentes, agregarFrecuente, descartarFrecuente } from './frecuentes.js';
import {
  ICONOS,
  esc,
  fechaISO,
  diaSemana,
  sumarDias,
  fechaLarga,
  ordenarAlfa,
  aviso,
  linkWhatsApp,
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
    // Cambió el equipo (fletero nuevo, rol, ajustes): se repinta todo lo que depende de él
    ctx = nuevo;
    pintarSalen();
    pintarParadas();
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

if (ctx.organizador) limpiarFleterosTemporales(ctx.equipo, fechaISO()).catch(() => {});

/* ---------- Direcciones frecuentes: sugerir agregarlas a clientes ---------- */
let frecuentes = [];
let frecuentesBuscadas = false;
async function buscarFrecuentes() {
  frecuentesBuscadas = true;
  frecuentes = await direccionesFrecuentes(ctx.equipo.id, clientes);
  pintarFrecuentes();
}
function pintarFrecuentes() {
  $('bloque-frecuentes').classList.toggle('oculto', !frecuentes.length);
  $('lista-frecuentes').innerHTML = frecuentes
    .map(
      (f) => `
      <div class="fila">
        <span class="fila-cuerpo">
          <span class="fila-titulo-texto">${esc(f.nombre)}</span>
          <span class="fila-detalle">${esc(f.direccion)} · ${f.veces} días en el último mes</span>
        </span>
        <button type="button" class="btn btn-primario btn-chico-fila" data-agregar-frecuente="${esc(f.clave)}">Agregar a clientes</button>
        <button type="button" class="btn-icono sin-borde" data-descartar-frecuente="${esc(f.clave)}" aria-label="No sugerir más ${esc(f.nombre)}">${ICONOS.cruz}</button>
      </div>`
    )
    .join('');
}
$('lista-frecuentes').addEventListener('click', async (e) => {
  const agregar = e.target.closest('[data-agregar-frecuente]');
  const descartar = e.target.closest('[data-descartar-frecuente]');
  const c = (agregar || descartar) && (agregar || descartar).dataset[agregar ? 'agregarFrecuente' : 'descartarFrecuente'];
  const f = frecuentes.find((x) => x.clave === c);
  if (!f) return;
  frecuentes = frecuentes.filter((x) => x !== f);
  pintarFrecuentes();
  if (descartar) {
    descartarFrecuente(f.clave);
    return;
  }
  try {
    await agregarFrecuente(ctx.equipo.id, f);
    aviso(`${f.nombre} quedó en tus clientes. Los demás datos los completás en Clientes.`);
  } catch (err) {
    aviso('No se pudo agregar. Revisá la conexión.');
  }
});

escucharClientes(ctx.equipo.id, (lista) => {
  clientes = ordenarAlfa(lista);
  pintarClientes();
  if (!frecuentesBuscadas) buscarFrecuentes();
});

function escucharDia() {
  if (cortarVuelta) cortarVuelta();
  cortarVuelta = escucharVuelta(ctx.equipo.id, fecha, (v) => {
    vuelta = v;
    pintarSalen();
    pintarParadas();
    pintarAjustes();
    pintarClientes();
  });
}

escucharDia();
pintarAjustes();

/* ---------- Quiénes salen y a quién le toca cada parada ---------- */

// Los fleteros "solo por un día" aparecen únicamente en ese día
const fleterosEquipo = () => fleterosDelEquipo(ctx.equipo).filter((f) => !f.temporal || f.temporal === fecha);
const hayVarios = () => fleterosEquipo().length > 1;
const activos = () => activosDelDia(vuelta, fleterosEquipo());

async function guardarParadas(nuevas) {
  const lista = hayVarios() ? asignarPendientes(nuevas, activos(), vuelta).paradas : nuevas;
  await guardarVuelta(ctx.equipo.id, fecha, { paradas: lista, ordenada: false });
  avisarIncompatibles(lista);
}

/* Si una parada pide algo que ninguno de los que salen lleva, se avisa */
function avisarIncompatibles(lista) {
  if (!hayVarios()) return;
  const malas = incompatibles(lista, activos(), vuelta);
  if (malas.length) aviso(`${malas.length === 1 ? `${malas[0].nombre} pide` : `${malas.length} paradas piden`} una carga que no lleva ninguno de los que salen`);
}

function pintarSalen() {
  $('bloque-salen').classList.toggle('oculto', !ctx.organizador);
  if (!ctx.organizador) return;
  $('btn-redistribuir').classList.toggle('oculto', !hayVarios());
  $('ayuda-salen').textContent = hayVarios()
    ? 'Cada destino que agregues se asigna solo al fletero de esa zona. Tocá el nombre en una parada para cambiarlo.'
    : 'Sumá fleteros y la app reparte cada destino por zona entre los que salen.';
  const uids = activos().map((f) => f.uid);
  $('chips-salen').innerHTML =
    fleterosEquipo()
      .map((f) => {
        const sale = uids.includes(f.uid);
        const cant = paradas().filter((p) => p.fleteroUid === f.uid && !paradaHecha(p)).length;
        const no = noLlevaDelDia(vuelta, f);
        return `<button type="button" class="chip ${sale ? 'activo' : ''}" data-sale="${esc(f.uid)}" aria-pressed="${sale}" title="${no.length ? `No lleva: ${esc(no.join(', '))}` : ''}"><i class="punto" style="background:${esc(f.color)}"></i>${esc(f.nombre)}${f.externo ? ' (sin app)' : ''}${sale && cant ? ` · ${cant}` : ''}${sale && no.length ? ' · <span class="aviso-carga">no lleva ' + esc(no.join(', ')) + '</span>' : ''}</button>`;
      })
      .join('') +
    '<button type="button" class="chip punteado" id="btn-agregar-fletero"><span class="mas" aria-hidden="true">+</span>Agregar fletero</button>' +
    (hayVarios() ? '<button type="button" class="chip punteado" id="btn-que-lleva">Qué lleva cada uno</button>' : '');
}

/* ---------- Qué lleva cada uno ese día ---------- */
$('chips-salen').addEventListener('click', (e) => {
  if (!e.target.closest('#btn-que-lleva')) return;
  editarQueLleva({
    equipo: ctx.equipo,
    fleteros: activos(),
    vuelta,
    guardar: async (noLleva, habitual) => {
      const delDia = { ...((vuelta && vuelta.noLleva) || {}), ...noLleva };
      const vueltaNueva = { ...(vuelta || {}), noLleva: delDia };
      const lista = asignarPendientes(paradas(), activos(), vueltaNueva).paradas;
      await guardarVuelta(ctx.equipo.id, fecha, { noLleva: delDia, paradas: lista, ordenada: false });
      if (habitual) {
        const cambios = {};
        Object.entries(noLleva).forEach(([uid, lista2]) => {
          cambios[`miembros.${uid}.noLleva`] = lista2;
        });
        await actualizarEquipo(ctx.equipo.id, cambios);
      }
      avisarIncompatibles(lista);
    }
  });
});

/* ---------- Agregar fletero ----------
   Con el nombre alcanza. Celular y vehículo son opcionales.
   "Frecuente" lo deja guardado para los próximos días; si no, es solo para este día.
   Si además va a usar la app, se lo invita por WhatsApp. */
$('chips-salen').addEventListener('click', (e) => {
  if (!e.target.closest('#btn-agregar-fletero')) return;
  const solo = ctx.equipo.modo === 'solo';
  const noLlevaSel = selectorCargas(ctx.equipo, [], {
    id: 'af-nolleva',
    titulo: 'No lleva (opcional)',
    ayuda: 'Marcá lo que no carga. Esas paradas se le asignan a otro.'
  });
  const hoja = abrirHoja({
    titulo: 'Agregar fletero',
    html: `
      ${
        solo
          ? `<div class="campo">
        <label for="af-equipo">Nombre de tu equipo o empresa</label>
        <input id="af-equipo" placeholder="Ej.: Transportes del Sur">
        <span class="texto-tenue">Al sumar fleteros pasás a trabajar en equipo.</span>
      </div>`
          : ''
      }
      <div class="campo"><label for="af-nombre">Nombre</label><input id="af-nombre" placeholder="Nombre del fletero" autocomplete="off"></div>
      <div class="grilla-2 siempre">
        <div class="campo"><label for="af-tel">Celular (opcional)</label><input id="af-tel" type="tel" inputmode="tel" placeholder="Celular"></div>
        <div class="campo"><label for="af-vehiculo">Vehículo (opcional)</label><input id="af-vehiculo" placeholder="Ej.: Fiorino"></div>
      </div>
      ${noLlevaSel.html}
      <label class="interruptor tarjeta" for="af-frecuente">
        <span><strong>Fletero frecuente</strong><br><span class="texto-tenue">Queda guardado para los próximos días. Si no, es solo para este día.</span></span>
        <input type="checkbox" id="af-frecuente" checked>
      </label>
      <button type="button" class="btn btn-primario btn-grande" id="af-agregar">Agregar fletero</button>
      <button type="button" class="link centrado-texto" id="af-invitar">¿Va a usar la app? Invitalo por WhatsApp</button>`
  });
  const el = hoja.el;
  const elegidasNoLleva = noLlevaSel.conectar(el);
  el.querySelector('#af-nombre').focus();
  const pasarAEquipo = async () => {
    if (ctx.equipo.modo !== 'solo') return true;
    const nombre = el.querySelector('#af-equipo').value.trim();
    if (!nombre) {
      aviso('Escribí el nombre de tu equipo o empresa');
      el.querySelector('#af-equipo').focus();
      return false;
    }
    await actualizarEquipo(ctx.equipo.id, { modo: 'equipo', nombre });
    ctx.equipo.modo = 'equipo';
    ctx.equipo.nombre = nombre;
    return true;
  };

  let agregando = false;
  const agregar = async () => {
    if (agregando) return;
    const nombre = el.querySelector('#af-nombre').value.trim();
    if (!nombre) {
      aviso('Escribí el nombre del fletero');
      el.querySelector('#af-nombre').focus();
      return;
    }
    agregando = true;
    try {
      if (!(await pasarAEquipo())) {
        agregando = false;
        return;
      }
      const frecuente = el.querySelector('#af-frecuente').checked;
      const uid = await agregarFleteroSinApp(ctx.equipo, {
        nombre,
        telefono: el.querySelector('#af-tel').value.trim(),
        vehiculo: el.querySelector('#af-vehiculo').value.trim(),
        noLleva: elegidasNoLleva(),
        frecuente,
        fecha
      });
      // Sale este día junto con los que ya salían
      const uids = [...new Set([...activos().map((f) => f.uid), uid])];
      await guardarVuelta(ctx.equipo.id, fecha, { activos: uids });
      hoja.cerrar();
      aviso(frecuente ? `${nombre} quedó en tus fleteros y sale este día` : `${nombre} sale solo este día`);
    } catch (err) {
      agregando = false;
      aviso('No se pudo agregar. Revisá la conexión.');
    }
  };
  el.querySelector('#af-agregar').addEventListener('click', agregar);
  el.querySelector('#af-nombre').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') agregar();
  });

  el.querySelector('#af-invitar').addEventListener('click', async () => {
    const ventana = window.open('', '_blank');
    if (!(await pasarAEquipo())) {
      if (ventana) ventana.close();
      return;
    }
    const nombre = el.querySelector('#af-nombre').value.trim();
    const texto = `${nombre ? `Hola ${nombre.split(' ')[0]}! ` : ''}Sumate a "${ctx.equipo.nombre}" en Vueltrack para recibir tus retiros y entregas. Entrá a ${location.origin}/?codigo=${encodeURIComponent(ctx.equipo.codigo)} , creá tu cuenta y elegí "Me sumo a un equipo" (código ${ctx.equipo.codigo}).`;
    const url = linkWhatsApp(el.querySelector('#af-tel').value.trim(), texto);
    if (ventana) ventana.location.href = url;
    else location.href = url;
  });
});

$('chips-salen').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-sale]');
  if (!b) return;
  let uids = activos().map((f) => f.uid);
  if (uids.includes(b.dataset.sale)) {
    if (uids.length === 1) {
      aviso('Tiene que salir al menos un fletero');
      return;
    }
    uids = uids.filter((u) => u !== b.dataset.sale);
  } else {
    uids = [...uids, b.dataset.sale];
  }
  const nuevosActivos = fleterosEquipo().filter((f) => uids.includes(f.uid));
  // Las paradas de quien no sale pasan a la zona que corresponda
  const { paradas: lista, asignadas } = asignarPendientes(paradas(), nuevosActivos, vuelta);
  await guardarVuelta(ctx.equipo.id, fecha, { activos: uids, paradas: lista, ordenada: false });
  if (asignadas) aviso(`Reasignamos ${asignadas} ${asignadas === 1 ? 'parada' : 'paradas'}`);
});

$('btn-redistribuir').addEventListener('click', async () => {
  if (!paradas().some((p) => !paradaHecha(p))) {
    aviso('Todavía no hay paradas para dividir');
    return;
  }
  await guardarVuelta(ctx.equipo.id, fecha, { paradas: redistribuirPorZona(paradas(), activos(), vuelta), ordenada: false });
  aviso(`Dividimos las paradas en ${activos().length} zonas`);
});

function elegirFletero(paradaId) {
  const p = paradas().find((x) => x.id === paradaId);
  if (!p) return;
  const hoja = abrirHoja({
    titulo: `¿Quién va a ${p.nombre}?`,
    html: `<div class="lista">${activos()
      .map(
        (f) => `
        <button type="button" class="fila" data-uid="${esc(f.uid)}">
          <span class="fila-cuerpo"><span class="fila-titulo-texto"><i class="punto" style="background:${esc(f.color)}"></i> ${esc(f.nombre)}</span>
          <span class="fila-detalle">${paradas().filter((x) => x.fleteroUid === f.uid && !paradaHecha(x)).length} paradas${
            puedeLlevar(p, f, vuelta) ? '' : ` · <span class="aviso-carga">no lleva ${esc((p.cargas || []).join(', '))}</span>`
          }</span></span>
          ${p.fleteroUid === f.uid ? ICONOS.check : ''}
        </button>`
      )
      .join('')}</div>`
  });
  hoja.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-uid]');
    if (!b) return;
    const f = activos().find((x) => x.uid === b.dataset.uid);
    const apto = puedeLlevar(p, f, vuelta);
    if (!apto) {
      const ok = await confirmar({
        titulo: `${f.nombre} no lleva ${(p.cargas || []).join(', ')}`,
        texto: '¿Se la asignás igual? Queda fija con él aunque la app reparta de nuevo.',
        aceptar: 'Asignar igual'
      });
      if (!ok) return;
    }
    hoja.cerrar();
    const lista = paradas().map((x) => {
      if (x.id !== paradaId) return x;
      const nueva = { ...x, fleteroUid: b.dataset.uid };
      if (apto) delete nueva.fleteroFijo;
      else nueva.fleteroFijo = true;
      return nueva;
    });
    await guardarVuelta(ctx.equipo.id, fecha, { paradas: asignarPendientes(lista, activos(), vuelta).paradas, ordenada: false });
  });
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
      if (idsClientesPendientes().has(cliente.id)) {
        aviso('Ya está pendiente en la vuelta');
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

/* Un cliente ya visitado se puede volver a sumar (es otra visita);
   solo se evita duplicarlo mientras tiene una parada pendiente */
function idsClientesPendientes() {
  return new Set(
    paradas()
      .filter((p) => !paradaHecha(p))
      .map((p) => p.clienteId)
      .filter(Boolean)
  );
}

function pintarClientes() {
  const enVuelta = idsClientesEnVuelta();
  const dia = diaSemana(fecha);
  const faltan = clientes.filter((c) => (c.dias || []).includes(dia) && !enVuelta.has(c.id));
  $('btn-elegir-clientes').textContent = clientes.length ? 'Elegir clientes' : 'Cargar clientes habituales';
  $('btn-toca').classList.toggle('oculto', !faltan.length);
  $('btn-toca').textContent =
    faltan.length === 1 ? `Sumar a ${faltan[0].nombre}, que le toca este día` : `Sumar los ${faltan.length} que les toca este día`;
  $('btn-toca').onclick = async () => {
    await guardarParadas([...paradas(), ...faltan.map(paradaDesdeCliente)]);
    aviso(faltan.length === 1 ? `Sumaste a ${faltan[0].nombre}` : `Sumaste ${faltan.length} clientes`);
  };
}

/* Hoja para elegir varios clientes de una, con buscador */
$('btn-elegir-clientes').addEventListener('click', () => {
  if (!clientes.length) {
    location.href = '/pages/clientes.html';
    return;
  }
  const enVuelta = idsClientesPendientes();
  const elegidos = new Set();
  const hoja = abrirHoja({
    titulo: 'Elegir clientes',
    html: `
      <div class="campo">
        <label for="ec-buscar" class="solo-lector">Buscar cliente</label>
        <input id="ec-buscar" placeholder="Buscar por nombre o dirección" autocomplete="off">
      </div>
      <div class="lista" id="ec-lista"></div>
      <button type="button" class="btn btn-primario btn-grande" id="ec-agregar" disabled>Elegí uno o más clientes</button>`
  });
  const el = hoja.el;
  const normal = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const pintarLista = () => {
    const q = normal(el.querySelector('#ec-buscar').value.trim());
    const visibles = clientes.filter((c) => !q || normal(c.nombre).includes(q) || normal(c.direccion).includes(q));
    el.querySelector('#ec-lista').innerHTML =
      visibles
        .map((c) => {
          const ya = enVuelta.has(c.id);
          return `
          <label class="fila casilla-fila" for="ec-${esc(c.id)}">
            <input type="checkbox" id="ec-${esc(c.id)}" data-id="${esc(c.id)}" ${ya || elegidos.has(c.id) ? 'checked' : ''} ${ya ? 'disabled' : ''}>
            <span class="fila-cuerpo">
              <span class="fila-titulo-texto">${esc(String(c.nombre).toUpperCase())}</span>
              <span class="fila-detalle">${ya ? 'Ya está pendiente en la vuelta' : esc(c.direccion)}</span>
            </span>
          </label>`;
        })
        .join('') || '<p class="texto-tenue">No hay clientes con ese nombre.</p>';
  };
  const pintarBoton = () => {
    const b = el.querySelector('#ec-agregar');
    b.disabled = !elegidos.size;
    b.textContent = elegidos.size ? `Agregar ${elegidos.size} ${elegidos.size === 1 ? 'cliente' : 'clientes'}` : 'Elegí uno o más clientes';
  };
  el.querySelector('#ec-buscar').addEventListener('input', pintarLista);
  el.querySelector('#ec-lista').addEventListener('change', (e) => {
    const c = e.target.closest('[data-id]');
    if (!c) return;
    if (c.checked) elegidos.add(c.dataset.id);
    else elegidos.delete(c.dataset.id);
    pintarBoton();
  });
  let agregando = false;
  el.querySelector('#ec-agregar').addEventListener('click', async () => {
    if (agregando || !elegidos.size) return;
    agregando = true;
    const nuevos = clientes.filter((c) => elegidos.has(c.id) && !idsClientesPendientes().has(c.id));
    await guardarParadas([...paradas(), ...nuevos.map(paradaDesdeCliente)]);
    hoja.cerrar();
    aviso(nuevos.length === 1 ? `Sumaste a ${nuevos[0].nombre}` : `Sumaste ${nuevos.length} clientes`);
  });
  pintarLista();
});

/* ---------- Paradas cargadas ---------- */

function pintarParadas() {
  const lista = paradas();
  $('titulo-paradas').textContent = `Paradas cargadas · ${lista.length}`;
  $('btn-borrar-todo').classList.toggle('oculto', !lista.length);
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
        p.tipo === 'retiro' ? 'Retiro' : '',
        p.urgente ? 'Urgente' : '',
        p.direccion,
        textoHorario(p),
        Number(p.bultos) > 1 ? `${p.bultos} bultos` : '',
        (p.cargas || []).length ? p.cargas.join(', ') : '',
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
        </button>
        ${filaFletero(p)}
        <button type="button" class="btn-icono sin-borde btn-peligro" data-quitar="${esc(p.id)}" aria-label="Eliminar ${esc(p.nombre)}">${ICONOS.basura}</button>
      </div>`;
    })
    .join('');
  pintarBotones();
}

function filaFletero(p) {
  if (!hayVarios() || paradaHecha(p)) return '';
  const f = fleterosEquipo().find((x) => x.uid === p.fleteroUid);
  if (!f) return '';
  const mal = !puedeLlevar(p, f, vuelta);
  return `<button type="button" class="chip-fletero ${mal ? 'chip-fletero-mal' : ''}" data-fletero="${esc(p.id)}" aria-label="Cambiar fletero de ${esc(p.nombre)}, ahora ${esc(f.nombre)}${mal ? ', no lleva esta carga' : ''}"><i class="punto" style="background:${esc(f.color)}"></i>${esc(f.nombre.split(' ')[0])}${mal ? ' ⚠' : ''}</button>`;
}

$('lista-paradas').addEventListener('click', (e) => {
  const fletero = e.target.closest('[data-fletero]');
  if (fletero) {
    elegirFletero(fletero.dataset.fletero);
    return;
  }
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
  pintarBotones();
}


/* ---------- Borrar toda la vuelta del día ---------- */
$('btn-borrar-todo').addEventListener('click', async () => {
  const lista = paradas();
  if (!lista.length) return;
  const hechas = lista.filter(paradaHecha).length;
  const ok = await confirmar({
    titulo: '¿Borrar toda la vuelta?',
    texto: `Se borran las ${lista.length} paradas de este día${hechas ? `, incluidas ${hechas} que ya están marcadas` : ''}, y el recorrido calculado. No se puede deshacer.`,
    aceptar: 'Borrar todo',
    peligro: true
  });
  if (!ok) return;
  try {
    await borrarVuelta(ctx.equipo.id, fecha);
    aviso('Vuelta borrada');
  } catch (e) {
    aviso('No se pudo borrar. Revisá la conexión.');
  }
});

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
    location.href = fecha === fechaISO() ? '/' : `/pages/armar.html?fecha=${fecha}`;
  } catch (e) {
    aviso(mensajeError(e));
  } finally {
    botonCargando(boton, false, original);
  }
});
