/* =========================================================
   Vueltrack — buscador de direcciones con sugerencias
   ========================================================= */
import { buscarDirecciones } from './rutas.js';
import { esc, debounce } from './ui.js';

/**
 * @param {HTMLInputElement} input
 * @param {object} op
 * @param {function} op.foco      devuelve {lat,lng} para priorizar resultados cercanos
 * @param {function} op.alElegir  recibe {direccion, detalle, lat, lng}
 */
export function crearBuscador(input, { foco = () => null, alElegir }) {
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

  function mostrar(resultados, mensaje) {
    if (mensaje) {
      lista.innerHTML = `<button type="button" disabled><span class="sug-sec">${esc(mensaje)}</span></button>`;
      lista.classList.remove('oculto');
      return;
    }
    ultimos = resultados;
    if (!resultados.length) {
      mostrar([], 'No encontramos esa dirección. Probá con calle y altura.');
      return;
    }
    lista.innerHTML = resultados
      .map(
        (r, i) =>
          `<button type="button" role="option" data-i="${i}">${esc(r.direccion)}<span class="sug-sec">${esc(r.detalle || '')}</span></button>`
      )
      .join('');
    lista.classList.remove('oculto');
  }

  const buscar = debounce(async () => {
    const texto = input.value.trim();
    if (texto.length < 3) {
      cerrar();
      return;
    }
    const mio = ++pedido;
    mostrar([], 'Buscando…');
    try {
      const resultados = await buscarDirecciones(texto, foco());
      if (mio === pedido) mostrar(resultados);
    } catch (e) {
      if (mio === pedido) mostrar([], 'No se pudo buscar. Revisá la conexión.');
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
