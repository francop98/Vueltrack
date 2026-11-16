/* =========================================================
   Vueltrack — lugares conocidos del equipo
   La app aprende: lo que se marca en el mapa, se pega desde
   Google Maps o se corrige con el pin queda guardado y aparece
   primero en el buscador la próxima vez.
   ========================================================= */
import { escucharLugares, guardarLugar } from './datos.js';
import { sinTildes } from './ui.js';

let equipoId = null;
let lista = [];

export function iniciarLugares(id) {
  if (!id || id === equipoId) return;
  equipoId = id;
  escucharLugares(id, (l) => {
    lista = l;
  });
}

export function lugaresConocidos() {
  return lista;
}

export async function recordarLugar({ texto, nombre = '', direccion = '', lat, lng }) {
  if (!equipoId || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const clave = String(texto || nombre || direccion || '').trim();
  if (!clave) return;
  try {
    await guardarLugar(equipoId, { texto: clave, nombre, direccion: direccion || clave, lat, lng });
  } catch (e) {
    /* si no se puede guardar, la búsqueda sigue funcionando igual */
  }
}

/* ---------- Coincidencia por palabras ----------
   "ruta 3 km 696" encuentra "Ruta Nacional 3 Km 696":
   cada palabra buscada tiene que estar (los números, exactos). */
const DE_RELLENO = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'calle', 'av', 'avenida', 'nacional', 'provincial', 'km', 'n', 'nro', 'numero']);

export function palabras(texto) {
  return sinTildes(texto)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((p) => p && !DE_RELLENO.has(p))
    .map((p) => (p === 'rn' || p === 'rp' ? 'ruta' : p));
}

export function coincidePorPalabras(busqueda, texto) {
  const buscadas = palabras(busqueda);
  if (!buscadas.length) return false;
  const disponibles = palabras(texto);
  return buscadas.every((b) => disponibles.some((d) => (/^\d+$/.test(b) ? d === b : d.startsWith(b))));
}

/* ---------- Coordenadas y links de Google Maps ---------- */

const PATRONES = [
  /^\s*(-?\d{1,2}\.\d{3,})\s*[,;\s]\s*(-?\d{1,3}\.\d{3,})\s*$/,
  /@(-?\d{1,2}\.\d{3,}),(-?\d{1,3}\.\d{3,})/,
  /!3d(-?\d{1,2}\.\d{3,})!4d(-?\d{1,3}\.\d{3,})/,
  /[?&](?:q|query|ll|destination|daddr)=(-?\d{1,2}\.\d{3,}),\s*(-?\d{1,3}\.\d{3,})/
];

/* Devuelve {lat, lng, nombre} si el texto es una coordenada o un link de Google Maps con coordenadas */
export function coordenadasDe(texto) {
  const t = decodeURIComponent(String(texto || '').trim());
  for (const p of PATRONES) {
    const m = t.match(p);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        const lugar = t.match(/\/place\/([^/@]+)/);
        return { lat, lng, nombre: lugar ? lugar[1].replace(/\+/g, ' ').trim() : '' };
      }
    }
  }
  return null;
}

export function esLinkDeMapas(texto) {
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps|maps\.google\.)/i.test(String(texto || '').trim());
}
