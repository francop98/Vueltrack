/* =========================================================
   Vueltrack — buscador de direcciones y lugares con sugerencias
   Orden de las sugerencias:
     1. Tus clientes habituales y los lugares que ya marcaron en el equipo
     2. Coordenadas o links de Google Maps pegados
     3. Lo que encuentran los buscadores (direcciones y comercios)
     4. Siempre: "Marcar en el mapa" y "Estoy acá"
   ========================================================= */
import { buscarDirecciones, ubicarSugerencia } from './rutas.js';
import { lugaresConocidos, coincidePorPalabras, coordenadasDe, esLinkDeMapas, recordarLugar } from './lugares.js';
import { marcarEnMapa } from './marcarEnMapa.js';
import { esc, debounce, aviso } from './ui.js';

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
  // Sesión de búsqueda (Google cobra menos si el escribir y el elegir van juntos)
  let sesion = '';
  const nuevaSesion = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

  function cerrar() {
    lista.classList.add('oculto');
    lista.innerHTML = '';
  }

  function locales(texto) {
    if (texto.trim().length < 2) return [];
    const deClientes = (clientes() || [])
      .filter((c) => c.lat != null && coincidePorPalabras(texto, `${c.nombre} ${c.direccion}`))
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
    const deLugares = lugaresConocidos()
      .filter((l) => Number.isFinite(l.lat) && coincidePorPalabras(texto, `${l.texto} ${l.nombre} ${l.direccion}`))
      .filter((l) => !deClientes.some((c) => Math.abs(c.lat - l.lat) < 0.0003 && Math.abs(c.lng - l.lng) < 0.0003))
      .slice(0, 3)
      .map((l) => ({
        tipo: 'guardado',
        nombre: l.nombre && l.nombre !== l.direccion ? l.nombre : '',
        direccion: l.direccion || l.texto,
        detalle: 'Lugar guardado del equipo',
        lat: l.lat,
        lng: l.lng
      }));
    const pegado = coordenadasDe(texto);
    const deCoordenadas = pegado
      ? [
          {
            tipo: 'pegado',
            nombre: pegado.nombre,
            direccion: pegado.nombre ? 'Punto de Google Maps' : `${pegado.lat.toFixed(5)}, ${pegado.lng.toFixed(5)}`,
            detalle: 'Ubicación exacta',
            lat: pegado.lat,
            lng: pegado.lng
          }
        ]
      : [];
    return [...deCoordenadas, ...deClientes, ...deLugares];
  }

  const BUSCAR_MAS = '<button type="button" class="sug-accion" data-accion="buscar"><span class="sug-titulo">Buscar en el mapa</span><span class="sug-sec">Si no es ninguno de los tuyos</span></button>';
  const ACCIONES =
    '<button type="button" class="sug-accion" data-accion="mapa"><span class="sug-titulo">Marcar en el mapa</span><span class="sug-sec">Ubicá el pin a mano y queda guardado</span></button>' +
    '<button type="button" class="sug-accion" data-accion="aca"><span class="sug-titulo">Estoy acá</span><span class="sug-sec">Usar la ubicación del celular</span></button>';

  function fila(r, i) {
    const titulo = r.nombre || r.direccion;
    const secundaria = [r.nombre ? r.direccion : '', r.detalle].filter(Boolean).join(' · ');
    // Solo se marca lo que es tuyo; el resto se ve igual venga de donde venga
    const etiqueta =
      r.tipo === 'cliente'
        ? '<span class="etiqueta etiqueta-ok">Cliente</span>'
        : r.tipo === 'guardado'
          ? '<span class="etiqueta etiqueta-ok">Guardado</span>'
          : '';
    return `<button type="button" role="option" data-i="${i}"><span class="sug-titulo">${esc(titulo)}${etiqueta}</span><span class="sug-sec">${esc(secundaria)}</span></button>`;
  }

  function mostrar(resultados, mensaje, propios = [], conAcciones = true, ofrecerBuscar = false) {
    ultimos = [...propios, ...resultados];
    // Google exige nombrarlo cuando se muestran sus resultados (va chiquito, abajo)
    const deGoogle = resultados.some((r) => r.fuente === 'google' || r.tipo === 'google') ? '<span class="sug-fuente">Google Maps</span>' : '';
    const filas = ultimos.map(fila).join('') + deGoogle + (ofrecerBuscar ? BUSCAR_MAS : '');
    const nota = mensaje
      ? `<button type="button" disabled><span class="sug-sec">${esc(mensaje)}</span></button>`
      : !ultimos.length
        ? '<button type="button" disabled><span class="sug-sec">No lo encontramos en los mapas. Marcalo vos y queda guardado para la próxima, o pegá un link de Google Maps.</span></button>'
        : '';
    lista.innerHTML = filas + nota + (conAcciones ? ACCIONES : '');
    lista.classList.remove('oculto');
  }

  async function buscarAfuera(texto, propios) {
    if (!sesion) sesion = nuevaSesion();
    const mio = ++pedido;
    mostrar([], esLinkDeMapas(texto) ? 'Leyendo el link de Google Maps…' : 'Buscando…', propios);
    try {
      const resultados = await buscarDirecciones(texto, foco(), undefined, { sesion });
      if (mio === pedido) mostrar(resultados, '', propios);
    } catch (e) {
      if (mio === pedido) mostrar([], 'No se pudo buscar. Revisá la conexión.', propios);
    }
  }

  const buscar = debounce(async () => {
    const texto = input.value.trim();
    const propios = locales(texto);
    if (texto.length < 3) {
      if (propios.length) mostrar([], '', propios, false);
      else cerrar();
      return;
    }
    // Coordenadas o link con coordenadas: no hace falta buscar afuera
    if (propios.some((r) => r.tipo === 'pegado')) {
      mostrar([], '', propios);
      return;
    }
    // Si ya está entre tus clientes o lugares guardados, no se gasta una búsqueda:
    // se ofrece "Buscar en el mapa" por si es otro
    if (propios.length && !esLinkDeMapas(texto)) {
      pedido++;
      mostrar([], '', propios, true, true);
      return;
    }
    buscarAfuera(texto, propios);
  }, 400);

  input.addEventListener('input', buscar);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrar();
  });
  lista.addEventListener('click', async (e) => {
    const accion = e.target.closest('[data-accion]');
    if (accion && accion.dataset.accion === 'buscar') {
      const texto = input.value.trim();
      buscarAfuera(texto, locales(texto));
      return;
    }
    if (accion) {
      const texto = input.value.trim();
      cerrar();
      sesion = '';
      const r = await marcarEnMapa({ texto, centro: foco(), desdeAca: accion.dataset.accion === 'aca' });
      if (r) alElegir(r);
      return;
    }
    const b = e.target.closest('[data-i]');
    if (!b) return;
    let r = ultimos[Number(b.dataset.i)];
    const escrito = input.value.trim();
    cerrar();
    // Sugerencia de Google: se pide la ubicación recién ahora
    if (r.tipo === 'google') {
      try {
        const u = await ubicarSugerencia(r.placeId, sesion);
        r = { ...r, lat: u.lat, lng: u.lng, direccion: r.esLugar ? u.direccion || r.direccion : r.direccion || u.direccion };
        // Queda guardado: la próxima vez sale de tus lugares, sin gastar otra búsqueda
        recordarLugar({ texto: escrito || r.nombre || r.direccion, nombre: r.nombre, direccion: r.direccion, lat: r.lat, lng: r.lng });
      } catch (err) {
        aviso('No se pudo ubicar ese lugar. Probá de nuevo o marcalo en el mapa.');
        return;
      } finally {
        sesion = '';
      }
    }
    // Lo encontrado en Google queda guardado: la próxima vez no gasta otra búsqueda
    if (r.fuente === 'google') {
      recordarLugar({ texto: escrito || r.nombre || r.direccion, nombre: r.nombre, direccion: r.direccion, lat: r.lat, lng: r.lng });
    }
    // Lo pegado desde Google Maps se recuerda con lo que se escribió
    if (r.tipo === 'pegado' || r.tipo === 'link') {
      recordarLugar({ texto: r.nombre || r.direccion, nombre: r.nombre, direccion: r.nombre || r.direccion, lat: r.lat, lng: r.lng });
    }
    alElegir(r);
  });
  document.addEventListener('click', (e) => {
    if (!caja.contains(e.target)) cerrar();
  });

  return { cerrar, limpiar: () => { input.value = ''; cerrar(); } };
}

/* Markup del buscador (para hojas que se arman con JS) */
export function htmlBuscador(id, etiqueta, placeholder = 'Dirección o nombre del lugar', valor = '') {
  return `
    <div class="campo buscador">
      <label for="${id}">${esc(etiqueta)}</label>
      <div class="buscador-caja">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input id="${id}" placeholder="${esc(placeholder)}" value="${esc(valor)}">
      </div>
    </div>`;
}
