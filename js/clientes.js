/* =========================================================
   Vueltrack — Clientes habituales (orden alfabético)
   ========================================================= */
import { iniciarPantalla } from './sesion.js';
import { escucharClientes, escucharVuelta, guardarVuelta, guardarCliente, borrarCliente } from './datos.js';
import { selectorCargas } from './cargas.js';
import { crearBuscador, htmlBuscador } from './buscador.js';
import { mapaConPin } from './mapa.js';
import { paradaDesdeCliente, textoHorario, paradaHecha } from './vuelta.js';
import {
  ICONOS,
  esc,
  fechaISO,
  diaSemana,
  DIAS_CORTOS,
  iniciales,
  primeraLetra,
  sinTildes,
  ordenarAlfa,
  aviso,
  confirmar,
  abrirHoja
} from './ui.js';

const $ = (id) => document.getElementById(id);
const hoy = fechaISO();
const diaHoy = diaSemana(hoy);
let ctx;
let clientes = [];
let vueltaHoy = null;
let filtro = 'todos';
let texto = '';

ctx = await iniciarPantalla({ pagina: 'clientes', soloOrganizador: true, alCambiarEquipo: () => pintar() });

escucharClientes(ctx.equipo.id, (lista) => {
  clientes = ordenarAlfa(lista);
  $('cargando').classList.add('oculto');
  pintar();
});

escucharVuelta(ctx.equipo.id, hoy, (v) => {
  vueltaHoy = v;
  pintar();
});

const enVueltaHoy = () => new Set(((vueltaHoy && vueltaHoy.paradas) || []).map((p) => p.clienteId).filter(Boolean));
// Pendiente hoy: un cliente ya visitado se puede volver a sumar (otra visita)
const pendientesHoy = () =>
  new Set(((vueltaHoy && vueltaHoy.paradas) || []).filter((p) => !paradaHecha(p)).map((p) => p.clienteId).filter(Boolean));
const lesTocaHoy = (c) => (c.dias || []).includes(diaHoy);

function textoDias(dias) {
  if (!dias || !dias.length) return '';
  if (dias.length === 7) return 'todos los días';
  const orden = [1, 2, 3, 4, 5, 6, 0];
  const lista = orden.filter((d) => dias.includes(d)).map((d) => DIAS_CORTOS[d]);
  if (lista.length === 1) return lista[0];
  return lista.slice(0, -1).join(', ') + ' y ' + lista[lista.length - 1];
}

function pintar() {
  $('cantidad').textContent = `${clientes.length} ${clientes.length === 1 ? 'cliente guardado' : 'clientes guardados'}`;
  const tocaHoy = clientes.filter(lesTocaHoy);
  $('chip-hoy').textContent = `Les toca hoy · ${tocaHoy.length}`;

  const yaEstan = enVueltaHoy();
  const pendientesYa = pendientesHoy();
  const faltan = tocaHoy.filter((c) => !yaEstan.has(c.id));
  $('btn-sumar-hoy').classList.toggle('oculto', !faltan.length);
  $('btn-sumar-hoy').textContent =
    faltan.length === 1
      ? `Sumar a ${faltan[0].nombre} a la vuelta de hoy`
      : `Sumar a la vuelta de hoy los ${faltan.length} que les toca`;
  $('btn-sumar-hoy').onclick = () => sumarAHoy(faltan);

  const busqueda = sinTildes(texto);
  const visibles = clientes.filter((c) => {
    if (filtro === 'hoy' && !lesTocaHoy(c)) return false;
    if (!busqueda) return true;
    return sinTildes(`${c.nombre} ${c.direccion}`).includes(busqueda);
  });

  const vacio = !visibles.length;
  $('vacio').classList.toggle('oculto', !vacio);
  if (vacio) {
    $('vacio-titulo').textContent = clientes.length ? 'No hay clientes con ese filtro' : 'Todavía no cargaste clientes';
    $('vacio-texto').textContent = clientes.length
      ? 'Probá con otra búsqueda.'
      : 'Guardá a los que visitás seguido y sumalos a la vuelta con un toque.';
  }

  const grupos = {};
  visibles.forEach((c) => {
    const letra = primeraLetra(c.nombre);
    (grupos[letra] = grupos[letra] || []).push(c);
  });

  $('listado').innerHTML = Object.keys(grupos)
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map(
      (letra) => `
      <span class="letra-grupo">${esc(letra)}</span>
      <div class="lista">
        ${grupos[letra]
          .map((c) => {
            const detalle = [c.direccion, textoDias(c.dias), textoHorario(c), c.nota ? 'con nota' : ''].filter(Boolean).join(' · ');
            const esta = pendientesYa.has(c.id);
            return `
            <div class="fila">
              <button type="button" class="fila enlace-plano sin-padding" data-editar="${esc(c.id)}">
                <span class="iniciales">${esc(iniciales(c.nombre))}</span>
                <span class="fila-cuerpo">
                  <span class="fila-titulo-texto">${esc(String(c.nombre).toUpperCase())}</span>
                  <span class="fila-detalle">${esc(detalle)}</span>
                </span>
              </button>
              ${
                esta
                  ? `<span class="btn-icono activo-oscuro" role="img" aria-label="Pendiente en la vuelta de hoy">${ICONOS.check}</span>`
                  : `<button type="button" class="btn-icono mas-acento" data-sumar="${esc(c.id)}" aria-label="Sumar ${esc(c.nombre)} a la vuelta de hoy">${ICONOS.mas}</button>`
              }
            </div>`;
          })
          .join('')}
      </div>`
    )
    .join('');
}

$('filtro-texto').addEventListener('input', (e) => {
  texto = e.target.value;
  pintar();
});

document.querySelectorAll('[data-filtro]').forEach((b) =>
  b.addEventListener('click', () => {
    filtro = b.dataset.filtro;
    document.querySelectorAll('[data-filtro]').forEach((x) => {
      x.classList.toggle('activo', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
    pintar();
  })
);

$('listado').addEventListener('click', (e) => {
  const sumar = e.target.closest('[data-sumar]');
  if (sumar) {
    const c = clientes.find((x) => x.id === sumar.dataset.sumar);
    if (c) sumarAHoy([c]);
    return;
  }
  const editar = e.target.closest('[data-editar]');
  if (editar) abrirEditor(clientes.find((x) => x.id === editar.dataset.editar));
});

async function sumarAHoy(lista) {
  const paradas = (vueltaHoy && vueltaHoy.paradas) || [];
  await guardarVuelta(ctx.equipo.id, hoy, { paradas: [...paradas, ...lista.map(paradaDesdeCliente)], ordenada: false });
  aviso(lista.length === 1 ? `${lista[0].nombre} sumado a la vuelta de hoy` : `Sumaste ${lista.length} clientes a la vuelta de hoy`);
}

$('btn-nuevo').addEventListener('click', () => abrirEditor(null));

/* ---------- Alta y edición ---------- */

function abrirEditor(cliente) {
  const c = cliente || { nombre: '', direccion: '', telefono: '', dias: [], desde: '', hasta: '', nota: '' };
  let ubicacion = cliente ? { direccion: c.direccion, lat: c.lat, lng: c.lng } : null;
  let pin = null;
  const orden = [1, 2, 3, 4, 5, 6, 0];
  // Carga habitual: se copia a la parada al sumarlo (y se puede cambiar ese día)
  const cargasSel =
    ctx.equipo.modo === 'equipo'
      ? selectorCargas(ctx.equipo, c.cargas || [], { id: 'c-cargas', titulo: 'Carga habitual', ayuda: 'Se puede cambiar en cada vuelta.' })
      : null;

  const hoja = abrirHoja({
    titulo: cliente ? 'Editar cliente' : 'Nuevo cliente',
    html: `
      <div class="campo"><label for="c-nombre">Nombre</label><input id="c-nombre" class="mayusculas" value="${esc(String(c.nombre || '').toUpperCase())}" placeholder="NOMBRE DEL CLIENTE" autocapitalize="characters" autocomplete="off"></div>
      ${htmlBuscador('c-direccion', 'Dirección', 'Dirección o nombre del lugar', c.direccion)}
      <div class="mapa chico ${ubicacion ? '' : 'oculto'}" id="c-mapa-caja"><div class="mapa-lienzo" id="c-mapa"></div></div>
      <span class="texto-tenue ${ubicacion ? '' : 'oculto'}" id="c-ayuda-pin">Si el pin quedó corrido, arrastralo a la puerta.</span>
      <div class="campo"><label for="c-tel">Teléfono</label><input id="c-tel" type="tel" inputmode="tel" value="${esc(c.telefono)}" placeholder="Celular"></div>
      <div class="grilla-2 siempre">
        <div class="campo"><label for="c-desde">Recibe desde</label><input id="c-desde" type="time" value="${esc(c.desde || '')}"></div>
        <div class="campo"><label for="c-hasta">Recibe hasta</label><input id="c-hasta" type="time" value="${esc(c.hasta)}"></div>
      </div>
      <fieldset class="campo sin-borde">
        <legend class="etiqueta-campo">Días que le toca</legend>
        <div class="casillas">
          ${orden
            .map(
              (d) =>
                `<label class="casilla"><input type="checkbox" value="${d}" ${(c.dias || []).includes(d) ? 'checked' : ''}><span>${DIAS_CORTOS[d]}</span></label>`
            )
            .join('')}
        </div>
      </fieldset>
      ${cargasSel ? cargasSel.html : ''}
      <div class="campo"><label for="c-nota">Nota fija para el fletero</label><textarea id="c-nota" placeholder="Ej.: timbre 2B, dejar en portería, entrar por el portón lateral">${esc(c.nota)}</textarea></div>
      <p class="error-texto oculto" id="c-error" role="alert"></p>
      <button type="button" class="btn btn-primario btn-grande" id="c-guardar">Guardar cliente</button>
      ${cliente ? `<button type="button" class="btn btn-peligro" id="c-borrar">${ICONOS.basura}Eliminar cliente</button>` : ''}`
  });
  const el = hoja.el;
  const cargasElegidas = cargasSel ? cargasSel.conectar(el) : () => c.cargas || [];

  // El nombre se escribe siempre en mayúsculas
  const campoNombre = el.querySelector('#c-nombre');
  campoNombre.addEventListener('input', () => {
    const pos = campoNombre.selectionStart;
    campoNombre.value = campoNombre.value.toUpperCase();
    campoNombre.setSelectionRange(pos, pos);
  });

  function ponerPin() {
    el.querySelector('#c-mapa-caja').classList.remove('oculto');
    el.querySelector('#c-ayuda-pin').classList.remove('oculto');
    if (!pin) {
      pin = mapaConPin(el.querySelector('#c-mapa'), ubicacion, (lat, lng) => {
        ubicacion = { ...ubicacion, lat, lng };
      });
    } else {
      pin.marcador.setLatLng([ubicacion.lat, ubicacion.lng]);
      pin.mapa.setView([ubicacion.lat, ubicacion.lng], 17);
    }
  }
  if (ubicacion && ubicacion.lat != null) ponerPin();

  crearBuscador(el.querySelector('#c-direccion'), {
    foco: () => ctx.equipo.base,
    alElegir: (r) => {
      const direccion = r.direccion || r.nombre;
      ubicacion = { direccion, lat: r.lat, lng: r.lng };
      el.querySelector('#c-direccion').value = direccion;
      if (r.nombre && !campoNombre.value.trim()) campoNombre.value = r.nombre.toUpperCase();
      ponerPin();
    }
  });

  let guardando = false;
  const boton = el.querySelector('#c-guardar');
  boton.addEventListener('click', async () => {
    if (guardando) return;
    const nombre = campoNombre.value.trim().replace(/\s+/g, ' ').toUpperCase();
    const error = el.querySelector('#c-error');
    const repetido = clientes.find((x) => (!cliente || x.id !== cliente.id) && sinTildes(x.nombre).trim() === sinTildes(nombre));
    if (repetido) {
      error.textContent = 'Ya tenés un cliente con ese nombre. Si es otra sucursal, agregale algo al nombre (ej.: “COOPERATIVA OBRERA CENTRO”).';
      error.classList.remove('oculto');
      return;
    }
    const desdeH = el.querySelector('#c-desde').value;
    const hastaH = el.querySelector('#c-hasta').value;
    if (!nombre || !ubicacion || (desdeH && hastaH && desdeH >= hastaH)) {
      error.textContent = !nombre
        ? 'Falta el nombre.'
        : !ubicacion
          ? 'Elegí la dirección de la lista de sugerencias.'
          : 'El horario “desde” tiene que ser antes que el “hasta”.';
      error.classList.remove('oculto');
      return;
    }
    const dias = [...el.querySelectorAll('.casillas input:checked')].map((i) => Number(i.value));
    const cargas = cargasElegidas();
    guardando = true;
    boton.disabled = true;
    error.classList.add('oculto');
    // Se cierra enseguida: un segundo toque ya no puede volver a guardar
    hoja.cerrar();
    await guardarCliente(ctx.equipo.id, {
      id: cliente ? cliente.id : undefined,
      nombre,
      direccion: ubicacion.direccion,
      lat: ubicacion.lat,
      lng: ubicacion.lng,
      telefono: el.querySelector('#c-tel').value.trim(),
      desde: el.querySelector('#c-desde').value,
      hasta: el.querySelector('#c-hasta').value,
      nota: el.querySelector('#c-nota').value.trim(),
      cargas,
      dias
    }).then(
      () => aviso(cliente ? 'Cliente actualizado' : 'Cliente guardado'),
      () => aviso('No se pudo guardar el cliente. Revisá la conexión.')
    );
  });

  const borrar = el.querySelector('#c-borrar');
  if (borrar) {
    borrar.addEventListener('click', async () => {
      const ok = await confirmar({
        titulo: '¿Eliminar este cliente?',
        texto: `${c.nombre} deja de estar en tus clientes habituales. Las vueltas ya armadas no cambian.`,
        aceptar: 'Eliminar',
        peligro: true
      });
      if (!ok) return;
      hoja.cerrar();
      await borrarCliente(ctx.equipo.id, cliente.id);
      aviso('Cliente eliminado');
    });
  }
}
