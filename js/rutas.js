/* =========================================================
   Vueltrack — búsqueda de direcciones, orden de la vuelta
   y reparto por zona. Los pedidos a OpenRouteService pasan
   por /api (la clave queda guardada en Vercel, no en el celular).
   ========================================================= */
import { tokenActual } from './sesion.js';

async function pedir(url, opciones = {}) {
  const token = await tokenActual();
  const resp = await fetch(url, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opciones.headers || {}) }
  });
  let datos = null;
  try {
    datos = await resp.json();
  } catch (e) {
    datos = null;
  }
  if (!resp.ok) {
    const error = new Error((datos && datos.error) || 'error-servidor');
    error.estado = resp.status;
    throw error;
  }
  return datos;
}

/* Sugerencias de direcciones, priorizando las cercanas al punto de salida */
export async function buscarDirecciones(texto, foco) {
  const q = new URLSearchParams({ texto });
  if (foco && foco.lat != null) {
    q.set('lat', foco.lat);
    q.set('lng', foco.lng);
  }
  const datos = await pedir(`/api/buscar?${q.toString()}`);
  return datos.resultados || [];
}

/**
 * Pide el orden óptimo.
 * modo "grupos": cada parada trae su fletero (vehiculo) y se ordena cada grupo.
 * modo "parejo": el servidor reparte para que todos tengan una cantidad pareja.
 */
export async function optimizar({ base, volver, demora, salida, vehiculos, paradas, modo }) {
  return pedir('/api/optimizar', {
    method: 'POST',
    body: JSON.stringify({ base, volver, demora, salida, vehiculos, paradas, modo })
  });
}

/* ---------- Reparto por zona (k-medias simple y estable) ---------- */

function distancia2(a, b) {
  const dLat = a.lat - b.lat;
  const dLng = (a.lng - b.lng) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return dLat * dLat + dLng * dLng;
}

/**
 * Divide las paradas en k zonas.
 * Devuelve un array con el índice de zona de cada parada.
 * Los centros arrancan con las paradas más separadas entre sí
 * (resultado repetible) y las zonas se mantienen parejas en cantidad.
 */
export function dividirPorZona(paradas, k) {
  const n = paradas.length;
  if (k <= 1 || n === 0) return paradas.map(() => 0);
  k = Math.min(k, n);

  const centroGeneral = {
    lat: paradas.reduce((s, p) => s + p.lat, 0) / n,
    lng: paradas.reduce((s, p) => s + p.lng, 0) / n
  };
  let primero = 0;
  paradas.forEach((p, i) => {
    if (distancia2(p, centroGeneral) > distancia2(paradas[primero], centroGeneral)) primero = i;
  });
  const centros = [{ lat: paradas[primero].lat, lng: paradas[primero].lng }];
  while (centros.length < k) {
    let mejor = -1;
    let mejorDist = -1;
    paradas.forEach((p, i) => {
      const d = Math.min(...centros.map((c) => distancia2(p, c)));
      if (d > mejorDist) {
        mejorDist = d;
        mejor = i;
      }
    });
    centros.push({ lat: paradas[mejor].lat, lng: paradas[mejor].lng });
  }

  const tope = Math.ceil(n / k) + 1;
  let asignacion = new Array(n).fill(0);

  for (let vuelta = 0; vuelta < 25; vuelta++) {
    const pares = [];
    paradas.forEach((p, i) => centros.forEach((c, j) => pares.push({ i, j, d: distancia2(p, c) })));
    pares.sort((a, b) => a.d - b.d);
    const nueva = new Array(n).fill(-1);
    const cuenta = new Array(k).fill(0);
    pares.forEach(({ i, j }) => {
      if (nueva[i] === -1 && cuenta[j] < tope) {
        nueva[i] = j;
        cuenta[j]++;
      }
    });

    const cambios = nueva.some((z, i) => z !== asignacion[i]);
    asignacion = nueva;
    for (let j = 0; j < k; j++) {
      const miembros = paradas.filter((_, i) => asignacion[i] === j);
      if (miembros.length) {
        centros[j] = {
          lat: miembros.reduce((s, p) => s + p.lat, 0) / miembros.length,
          lng: miembros.reduce((s, p) => s + p.lng, 0) / miembros.length
        };
      }
    }
    if (!cambios && vuelta > 0) break;
  }
  return asignacion;
}

/* ---------- Polilínea codificada (formato de la ruta) ---------- */

export function decodificarPolilinea(texto, precision = 5) {
  if (!texto) return [];
  const factor = Math.pow(10, precision);
  const puntos = [];
  let indice = 0;
  let lat = 0;
  let lng = 0;
  while (indice < texto.length) {
    let resultado = 0;
    let desplazamiento = 0;
    let byte;
    do {
      byte = texto.charCodeAt(indice++) - 63;
      resultado |= (byte & 0x1f) << desplazamiento;
      desplazamiento += 5;
    } while (byte >= 0x20);
    lat += resultado & 1 ? ~(resultado >> 1) : resultado >> 1;
    resultado = 0;
    desplazamiento = 0;
    do {
      byte = texto.charCodeAt(indice++) - 63;
      resultado |= (byte & 0x1f) << desplazamiento;
      desplazamiento += 5;
    } while (byte >= 0x20);
    lng += resultado & 1 ? ~(resultado >> 1) : resultado >> 1;
    puntos.push([lat / factor, lng / factor]);
  }
  return puntos;
}

/* Arma el resultado listo para guardar en la vuelta */
export function aplicarResultado(paradas, resultado, { salida }) {
  const porId = new Map(paradas.map((p) => [p.id, { ...p }]));
  const rutas = {};
  (resultado.rutas || []).forEach((r) => {
    r.paradas.forEach((pp, idx) => {
      const p = porId.get(pp.id);
      if (!p) return;
      p.fleteroUid = r.vehiculo;
      p.orden = idx + 1;
      p.llegada = pp.llegada;
      p.sinAsignar = false;
    });
    rutas[r.vehiculo] = {
      distancia: r.distancia,
      duracion: r.duracion,
      salida: salida,
      fin: r.fin,
      geometria: r.geometria || ''
    };
  });
  (resultado.sinAsignar || []).forEach((id) => {
    const p = porId.get(id);
    if (p) {
      p.fleteroUid = p.fleteroUid || null;
      p.sinAsignar = true;
    }
  });
  const lista = [...porId.values()].sort((a, b) => {
    if (a.fleteroUid !== b.fleteroUid) return String(a.fleteroUid).localeCompare(String(b.fleteroUid));
    return (a.orden || 999) - (b.orden || 999);
  });
  return { paradas: lista, rutas };
}
