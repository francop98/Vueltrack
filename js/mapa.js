/* =========================================================
   Vueltrack — mapa propio (Leaflet + OpenStreetMap)
   Cambia solo a la versión oscura cuando la app está en modo oscuro.
   ========================================================= */
import { decodificarPolilinea } from './rutas.js';
import { esc } from './ui.js';

/* Centro por defecto si el equipo todavía no cargó su punto de salida */
export const CENTRO_DEFECTO = { lat: -38.7183, lng: -62.2663 };

const CAPAS = {
  claro: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  oscuro: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
};
const ATRIBUCION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

function temaActual() {
  return document.documentElement.getAttribute('data-tema') === 'oscuro' ? 'oscuro' : 'claro';
}

export function crearMapa(elemento, { centro = CENTRO_DEFECTO, zoom = 13 } = {}) {
  const mapa = L.map(elemento, { zoomControl: false, attributionControl: true }).setView([centro.lat, centro.lng], zoom);
  let capa = L.tileLayer(CAPAS[temaActual()], { maxZoom: 19, subdomains: 'abcd', attribution: ATRIBUCION }).addTo(mapa);

  document.addEventListener('vueltrack:tema', () => {
    const url = CAPAS[temaActual()];
    if (capa._url !== url) {
      mapa.removeLayer(capa);
      capa = L.tileLayer(url, { maxZoom: 19, subdomains: 'abcd', attribution: ATRIBUCION }).addTo(mapa);
    }
  });

  mapa.capaVuelta = L.layerGroup().addTo(mapa);
  setTimeout(() => mapa.invalidateSize(), 150);
  return mapa;
}

function iconoParada(numero, color, clase = '') {
  return L.divIcon({
    className: '',
    html: `<div class="pin ${clase}" style="background:${esc(color)}">${esc(numero)}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
}

const iconoBase = () =>
  L.divIcon({ className: '', html: '<div class="pin-base"></div>', iconSize: [24, 24], iconAnchor: [12, 12] });

/**
 * Dibuja la vuelta.
 * grupos: [{ color, geometria, paradas: [{lat, lng, numero, hecha, actual, id}] }]
 */
export function pintarVuelta(mapa, { base, grupos, alTocarParada, ajustar = true }) {
  const capa = mapa.capaVuelta;
  capa.clearLayers();
  const puntos = [];

  if (base && base.lat != null) {
    L.marker([base.lat, base.lng], { icon: iconoBase(), keyboard: false, title: 'Punto de salida' }).addTo(capa);
    puntos.push([base.lat, base.lng]);
  }

  grupos.forEach((g) => {
    const linea = decodificarPolilinea(g.geometria);
    if (linea.length) {
      L.polyline(linea, { color: g.color, weight: 5, opacity: 0.85 }).addTo(capa);
    }
    g.paradas.forEach((p) => {
      if (p.lat == null) return;
      const clase = p.actual ? 'actual' : p.hecha ? 'hecho' : '';
      const marcador = L.marker([p.lat, p.lng], {
        icon: iconoParada(p.numero ?? '•', g.color, clase),
        title: p.nombre || '',
        zIndexOffset: p.actual ? 1000 : 0
      }).addTo(capa);
      if (alTocarParada) marcador.on('click', () => alTocarParada(p));
      puntos.push([p.lat, p.lng]);
    });
  });

  if (ajustar && puntos.length) {
    if (puntos.length === 1) mapa.setView(puntos[0], 15);
    else mapa.fitBounds(puntos, { padding: [30, 30] });
  }
}

/* Mapa chico con un pin que se puede arrastrar para corregir una ubicación */
export function mapaConPin(elemento, { lat, lng }, alMover) {
  const mapa = crearMapa(elemento, { centro: { lat, lng }, zoom: 17 });
  const marcador = L.marker([lat, lng], { draggable: true, autoPan: true }).addTo(mapa);
  marcador.on('dragend', () => {
    const p = marcador.getLatLng();
    alMover(p.lat, p.lng);
  });
  mapa.on('click', (e) => {
    marcador.setLatLng(e.latlng);
    alMover(e.latlng.lat, e.latlng.lng);
  });
  return { mapa, marcador };
}
