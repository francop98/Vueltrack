/* =========================================================
   Vueltrack — marcar un lugar en el mapa o con tu ubicación
   Para lo que los buscadores no encuentran (ej.: "Ruta 3 km 696").
   El punto queda guardado como lugar conocido del equipo.
   ========================================================= */
import { mapaConPin } from './mapa.js';
import { miUbicacion } from './rutas.js';
import { recordarLugar } from './lugares.js';
import { abrirHoja, aviso, esc } from './ui.js';

/**
 * Abre una hoja con un mapa para ubicar el pin.
 * @param {object} op
 * @param {string} op.texto        lo que se buscó (queda como nombre del lugar)
 * @param {object} op.centro       {lat,lng} donde arranca el mapa
 * @param {boolean} op.desdeAca    si arranca en la ubicación actual del celular
 * @returns {Promise<{nombre, direccion, lat, lng, tipo}|null>}
 */
/* Algunas pantallas no traen el mapa: se carga recién cuando hace falta */
function cargarMapa() {
  if (window.L) return Promise.resolve();
  if (!document.querySelector('link[href="/css/mapa.css"]')) {
    ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', '/css/mapa.css'].forEach((href) => {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      document.head.appendChild(l);
    });
  }
  return new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = ok;
    s.onerror = mal;
    document.head.appendChild(s);
  });
}

export async function marcarEnMapa({ texto = '', centro = null, desdeAca = false } = {}) {
  try {
    await cargarMapa();
  } catch (e) {
    aviso('No se pudo cargar el mapa. Revisá la conexión.');
    return null;
  }
  let punto = centro && Number.isFinite(centro.lat) ? { lat: centro.lat, lng: centro.lng } : { lat: -38.7183, lng: -62.2663 };
  if (desdeAca) {
    try {
      aviso('Buscando tu ubicación…');
      punto = await miUbicacion();
    } catch (e) {
      aviso('No se pudo obtener tu ubicación. Ubicá el pin a mano.');
    }
  }
  return new Promise((resolver) => {
    let listo = false;
    const terminar = (valor) => {
      if (listo) return;
      listo = true;
      resolver(valor);
    };
    const hoja = abrirHoja({
      titulo: desdeAca ? 'Estoy acá' : 'Marcar en el mapa',
      alCerrar: () => terminar(null),
      html: `
        <div class="campo">
          <label for="mm-nombre">Nombre o referencia</label>
          <input id="mm-nombre" value="${esc(texto)}" placeholder="Ej.: Ruta 3 km 696, galpón">
        </div>
        <div class="mapa medio"><div class="mapa-lienzo" id="mm-mapa"></div></div>
        <span class="texto-tenue">Tocá el mapa o arrastrá el pin hasta el lugar exacto. Queda guardado para la próxima.</span>
        <button type="button" class="btn btn-primario btn-grande" id="mm-usar">Usar este punto</button>`
    });
    const el = hoja.el;
    requestAnimationFrame(() => {
      const pin = mapaConPin(el.querySelector('#mm-mapa'), punto, (lat, lng) => {
        punto = { lat, lng };
      });
      setTimeout(() => pin.mapa.invalidateSize(), 250);
    });
    el.querySelector('#mm-usar').addEventListener('click', () => {
      const nombre = el.querySelector('#mm-nombre').value.trim() || texto || 'Lugar marcado';
      recordarLugar({ texto: nombre, nombre, direccion: nombre, lat: punto.lat, lng: punto.lng });
      terminar({ tipo: 'direccion', nombre: '', direccion: nombre, lat: punto.lat, lng: punto.lng });
      hoja.cerrar();
    });
  });
}
