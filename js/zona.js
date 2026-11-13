/* =========================================================
   Vueltrack — zona de trabajo (localidad y provincia)
   Se usa para que las búsquedas prioricen tu localidad
   y después tu provincia.
   ========================================================= */
import { actualizarEquipo } from './datos.js';
import { buscarLocalidades } from './rutas.js';
import { esc, debounce, abrirHoja, aviso } from './ui.js';

export const PROVINCIAS = [
  'Buenos Aires',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Ciudad Autónoma de Buenos Aires',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucumán'
];

export function textoZona(zona) {
  if (!zona) return 'Sin cargar';
  return [zona.localidad, zona.provincia].filter(Boolean).join(', ');
}

/* Campos de provincia + localidad (para el onboarding y la hoja de edición) */
export function htmlZona(prefijo, zona = null) {
  return `
    <div class="campo">
      <label for="${prefijo}-provincia">Provincia</label>
      <select id="${prefijo}-provincia">
        <option value="">Elegí tu provincia</option>
        ${PROVINCIAS.map((p) => `<option ${zona && zona.provincia === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}
      </select>
    </div>
    <div class="campo buscador">
      <label for="${prefijo}-localidad">Localidad</label>
      <div class="buscador-caja">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input id="${prefijo}-localidad" placeholder="Nombre de la localidad" autocomplete="off" value="${esc(zona ? zona.localidad : '')}">
      </div>
    </div>`;
}

/**
 * Conecta los campos de zona. alElegir recibe {localidad, partido, provincia, lat, lng}.
 */
export function conectarZona(raiz, prefijo, alElegir) {
  const provincia = raiz.querySelector(`#${prefijo}-provincia`);
  const input = raiz.querySelector(`#${prefijo}-localidad`);
  const caja = input.closest('.buscador');
  const lista = document.createElement('div');
  lista.className = 'sugerencias oculto';
  lista.setAttribute('role', 'listbox');
  caja.appendChild(lista);
  let ultimos = [];

  const buscar = debounce(async () => {
    const texto = input.value.trim();
    if (texto.length < 2) {
      lista.classList.add('oculto');
      return;
    }
    try {
      ultimos = await buscarLocalidades(texto, provincia.value);
    } catch (e) {
      ultimos = [];
    }
    lista.innerHTML = ultimos.length
      ? ultimos
          .map(
            (l, i) =>
              `<button type="button" role="option" data-i="${i}"><span class="sug-titulo">${esc(l.localidad)}</span><span class="sug-sec">${esc(
                [l.partido, l.provincia].filter(Boolean).join(', ')
              )}</span></button>`
          )
          .join('')
      : '<button type="button" disabled><span class="sug-sec">No encontramos esa localidad. Revisá la provincia.</span></button>';
    lista.classList.remove('oculto');
  }, 300);

  input.addEventListener('input', buscar);
  provincia.addEventListener('change', () => {
    if (input.value.trim()) buscar();
  });
  lista.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const l = ultimos[Number(b.dataset.i)];
    input.value = l.localidad;
    if (l.provincia && PROVINCIAS.includes(l.provincia)) provincia.value = l.provincia;
    lista.classList.add('oculto');
    alElegir(l);
  });
  document.addEventListener('click', (e) => {
    if (!caja.contains(e.target)) lista.classList.add('oculto');
  });
}

/* Hoja para cambiar la zona de trabajo del equipo */
export function elegirZona(equipo) {
  const hoja = abrirHoja({
    titulo: 'Zona de trabajo',
    html: `
      <p class="texto-tenue">Las búsquedas de direcciones y comercios priorizan esta localidad y después la provincia.</p>
      ${htmlZona('z', equipo.zona)}`
  });
  conectarZona(hoja.el, 'z', async (l) => {
    await actualizarEquipo(equipo.id, {
      zona: { localidad: l.localidad, partido: l.partido, provincia: l.provincia, lat: l.lat, lng: l.lng }
    });
    hoja.cerrar();
    aviso(`Zona de trabajo: ${l.localidad}`);
  });
}
