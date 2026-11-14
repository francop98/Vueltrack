/* =========================================================
   Vueltrack — mapa propio (Leaflet + OpenStreetMap)
   Mapa en versión oscura, igual que la app.
   ========================================================= */
import { decodificarPolilinea } from './rutas.js';
import { esc } from './ui.js';

/* Centro por defecto si el equipo todavía no cargó su punto de salida */
export const CENTRO_DEFECTO = { lat: -38.7183, lng: -62.2663 };

/* Mapa de OpenStreetMap: gratis y sin clave. Se oscurece con CSS (.capa-oscura) */
const CAPA = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATRIBUCION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function crearMapa(elemento, { centro = CENTRO_DEFECTO, zoom = 13 } = {}) {
  const mapa = L.map(elemento, { zoomControl: false, attributionControl: true }).setView([centro.lat, centro.lng], zoom);
  L.tileLayer(CAPA, { maxZoom: 19, className: 'capa-oscura', attribution: ATRIBUCION }).addTo(mapa);

  mapa.capaVuelta = L.layerGroup().addTo(mapa);
  mapa.capaFleteros = L.layerGroup().addTo(mapa);
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
      const clase = [p.actual ? 'actual' : p.hecha ? 'hecho' : '', p.tipo === 'retiro' ? 'retiro' : ''].join(' ');
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

/* Fleteros en vivo: [{lat, lng, color, nombre, detalle}] */
export function pintarFleteros(mapa, lista) {
  const capa = mapa.capaFleteros;
  if (!capa) return;
  capa.clearLayers();
  lista.forEach((f) => {
    const icono = L.divIcon({
      className: '',
      html: `<div class="pin-fletero" style="background:${esc(f.color)}">${esc(String(f.nombre || '?').charAt(0).toUpperCase())}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
    L.marker([f.lat, f.lng], { icon: icono, zIndexOffset: 2000, title: `${f.nombre} · ${f.detalle || ''}` })
      .bindTooltip(`${esc(f.nombre)} · ${esc(f.detalle || '')}`)
      .addTo(capa);
  });
}

/* Mapa chico con un pin que se puede arrastrar para corregir una ubicación */
export function mapaConPin(elemento, { lat, lng }, alMover) {
  const mapa = crearMapa(elemento, { centro: { lat, lng }, zoom: 17 });
  const icono = L.divIcon({ className: '', html: '<div class="pin-editar"></div>', iconSize: [28, 28], iconAnchor: [14, 28] });
  const marcador = L.marker([lat, lng], { draggable: true, autoPan: true, icon: icono, title: 'Arrastrá el pin' }).addTo(mapa);
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
