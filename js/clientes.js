/* =========================================================
   Vueltrack — Clientes habituales (orden alfabético)
   ========================================================= */
import { iniciarPantalla } from './sesion.js';
import { escucharClientes, escucharVuelta, guardarVuelta, guardarCliente, borrarCliente } from './datos.js';
import { crearBuscador, htmlBuscador } from './buscador.js';
import { mapaConPin } from './mapa.js';
import { paradaDesdeCliente } from './vuelta.js';
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

ctx = await iniciarPantalla({ pagina: 'clientes', soloOrganizador: true });

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
            const detalle = [c.direccion, textoDias(c.dias), c.hasta ? `hasta ${c.hasta} hs` : ''].filter(Boolean).join(' · ');
            const esta = yaEstan.has(c.id);
            return `
            <div class="fila">
              <button type="button" class="fila enlace-plano sin-padding" data-editar="${esc(c.id)}">
                <span class="iniciales">${esc(iniciales(c.nombre))}</span>
                <span class="fila-cuerpo">
                  <span class="fila-titulo-texto">${esc(c.nombre)}</span>
                  <span class="fila-detalle">${esc(detalle)}</span>
                </span>
              </button>
              ${
                esta
                  ? `<span class="btn-icono activo-oscuro" role="img" aria-label="Ya está en la vuelta de hoy">${ICONOS.check}</span>`
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
  const c = cliente || { nombre: '', direccion: '', telefono: '', dias: [], hasta: '', nota: '' };
  let ubicacion = cliente ? { direccion: c.direccion, lat: c.lat, lng: c.lng } : null;
  let pin = null;
  const orden = [1, 2, 3, 4, 5, 6, 0];

  const hoja = abrirHoja({
    titulo: cliente ? 'Editar cliente' : 'Nuevo cliente',
    html: `
      <div class="campo"><label for="c-nombre">Nombre</label><input id="c-nombre" value="${esc(c.nombre)}" placeholder="Ej. Ferretería Don Luis"></div>
      ${htmlBuscador('c-direccion', 'Dirección', 'Calle y altura', c.direccion)}
      <div class="mapa chico ${ubicacion ? '' : 'oculto'}" id="c-mapa-caja"><div class="mapa-lienzo" id="c-mapa"></div></div>
      <span class="texto-tenue ${ubicacion ? '' : 'oculto'}" id="c-ayuda-pin">Si el pin quedó corrido, arrastralo a la puerta.</span>
      <div class="grilla-2">
        <div class="campo"><label for="c-tel">Teléfono</label><input id="c-tel" type="tel" inputmode="tel" value="${esc(c.telefono)}"></div>
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
      <div class="campo"><label for="c-nota">Nota para el fletero</label><textarea id="c-nota" placeholder="Ej. Entrar por el portón de al lado">${esc(c.nota)}</textarea></div>
      <p class="error-texto oculto" id="c-error" role="alert"></p>
      <button type="button" class="btn btn-primario btn-grande" id="c-guardar">Guardar cliente</button>
      ${cliente ? `<button type="button" class="btn btn-peligro" id="c-borrar">${ICONOS.basura}Eliminar cliente</button>` : ''}`
  });
  const el = hoja.el;

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
      ubicacion = { direccion: r.direccion, lat: r.lat, lng: r.lng };
      el.querySelector('#c-direccion').value = r.direccion;
      ponerPin();
    }
  });

  el.querySelector('#c-guardar').addEventListener('click', async () => {
    const nombre = el.querySelector('#c-nombre').value.trim();
    const error = el.querySelector('#c-error');
    if (!nombre || !ubicacion) {
      error.textContent = !nombre ? 'Falta el nombre.' : 'Elegí la dirección de la lista de sugerencias.';
      error.classList.remove('oculto');
      return;
    }
    const dias = [...el.querySelectorAll('.casillas input:checked')].map((i) => Number(i.value));
    await guardarCliente(ctx.equipo.id, {
      id: cliente ? cliente.id : undefined,
      nombre,
      direccion: ubicacion.direccion,
      lat: ubicacion.lat,
      lng: ubicacion.lng,
      telefono: el.querySelector('#c-tel').value.trim(),
      hasta: el.querySelector('#c-hasta').value,
      nota: el.querySelector('#c-nota').value.trim(),
      dias
    });
    hoja.cerrar();
    aviso(cliente ? 'Cliente actualizado' : 'Cliente guardado');
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
      await borrarCliente(ctx.equipo.id, cliente.id);
      hoja.cerrar();
      aviso('Cliente eliminado');
    });
  }
}
