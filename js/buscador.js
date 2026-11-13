/* =========================================================
   Vueltrack — buscador de direcciones y lugares con sugerencias
   Primero muestra tus clientes habituales que coinciden; después
   lo que encuentran los buscadores (direcciones y comercios).
   ========================================================= */
import { buscarDirecciones } from './rutas.js';
import { esc, debounce, sinTildes } from './ui.js';

/**
 * @param {HTMLInputElement} input
 * @param {object} op
 * @param {function} op.foco      devuelve {lat,lng} para priorizar resultados cercanos
 * @param {function} op.alElegir  recibe {nombre, direccion, detalle, lat, lng, tipo, clienteId?}
 * @param {function} op.clientes  devuelve la lista de clientes habituales (opcional)
 */
export function crearBuscador(input, { foco = () => null, alElegir, clientes = () => [] }) {
  const caja = input.closest('.buscador');
  const lista = document.createElement('div');
  lista.className = 'sugerencias oculto';
  lista.setAttribute('role', 'listbox');
  caja.appendChild(lista);
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('aria-autocomplete', 'list');

  let ultimos = [];
  let pedido = 0;

  function cerrar() {
    lista.classList.add('oculto');
    lista.innerHTML = '';
  }

  function deMisClientes(texto) {
    const t = sinTildes(texto);
    if (t.length < 2) return [];
    return (clientes() || [])
      .filter((c) => c.lat != null && sinTildes(`${c.nombre} ${c.direccion}`).includes(t))
      .slice(0, 4)
      .map((c) => ({
        tipo: 'cliente',
        clienteId: c.id,
        nombre: c.nombre,
        direccion: c.direccion,
        detalle: 'Tu cliente habitual',
        lat: c.lat,
        lng: c.lng
      }));
  }

  function fila(r, i) {
    const titulo = r.nombre || r.direccion;
    const secundaria = [r.nombre ? r.direccion : '', r.detalle].filter(Boolean).join(' · ');
    const etiqueta =
      r.tipo === 'cliente'
        ? '<span class="etiqueta etiqueta-ok">Cliente</span>'
        : r.tipo === 'lugar'
          ? '<span class="etiqueta etiqueta-aviso">Lugar</span>'
          : '';
    return `<button type="button" role="option" data-i="${i}"><span class="sug-titulo">${esc(titulo)}${etiqueta}</span><span class="sug-sec">${esc(secundaria)}</span></button>`;
  }

  function mostrar(resultados, mensaje, locales = []) {
    ultimos = [...locales, ...resultados];
    if (mensaje) {
      lista.innerHTML =
        locales.map((r, i) => fila(r, i)).join('') + `<button type="button" disabled><span class="sug-sec">${esc(mensaje)}</span></button>`;
      lista.classList.remove('oculto');
      return;
    }
    if (!ultimos.length) {
      mostrar([], 'No encontramos nada con ese nombre. Probá con calle y altura, o guardalo como cliente.');
      return;
    }
    lista.innerHTML = ultimos.map(fila).join('');
    lista.classList.remove('oculto');
  }

  const buscar = debounce(async () => {
    const texto = input.value.trim();
    const locales = deMisClientes(texto);
    if (texto.length < 3) {
      if (locales.length) mostrar([], '', locales);
      else cerrar();
      return;
    }
    const mio = ++pedido;
    mostrar([], 'Buscando…', locales);
    try {
      const resultados = await buscarDirecciones(texto, foco());
      if (mio === pedido) mostrar(resultados, '', locales);
    } catch (e) {
      if (mio === pedido) mostrar([], 'No se pudo buscar. Revisá la conexión.', locales);
    }
  }, 350);

  input.addEventListener('input', buscar);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrar();
  });
  lista.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const r = ultimos[Number(b.dataset.i)];
    cerrar();
    alElegir(r);
  });
  document.addEventListener('click', (e) => {
    if (!caja.contains(e.target)) cerrar();
  });

  return { cerrar, limpiar: () => { input.value = ''; cerrar(); } };
}

/* Markup del buscador (para hojas que se arman con JS) */
export function htmlBuscador(id, etiqueta, placeholder = 'Calle y altura, ej. Estomba 410', valor = '') {
  return `
    <div class="campo buscador">
      <label for="${id}">${esc(etiqueta)}</label>
      <div class="buscador-caja">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input id="${id}" placeholder="${esc(placeholder)}" value="${esc(valor)}">
      </div>
    </div>`;
}
