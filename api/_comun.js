/* =========================================================
   Vueltrack — funciones compartidas del servidor (Vercel)
   Variables de entorno:
     ORS_API_KEY       clave gratuita de OpenRouteService (cuenta en account.heigit.org)
     FIREBASE_API_KEY  la apiKey pública de Firebase (la misma de js/firebase-config.js)
   ========================================================= */

// Dirección nueva de OpenRouteService (api.openrouteservice.org se apagó en septiembre de 2026)
const ORS = 'https://api.heigit.org';

/* Solo usuarios con sesión iniciada pueden usar la clave de OpenRouteService */
export async function verificarUsuario(req) {
  const encabezado = req.headers.authorization || '';
  const token = encabezado.startsWith('Bearer ') ? encabezado.slice(7) : '';
  if (!token || !process.env.FIREBASE_API_KEY) return null;
  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(process.env.FIREBASE_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token })
      }
    );
    if (!resp.ok) return null;
    const datos = await resp.json();
    return datos.users && datos.users[0] ? datos.users[0].localId : null;
  } catch (e) {
    return null;
  }
}

/* Si OpenRouteService no respondió hace poco, no se lo espera de nuevo durante 10 minutos
   (mientras la función de Vercel siga activa) */
let orsCaidoHasta = 0;
export const orsCaido = () => Date.now() < orsCaidoHasta;

/* tiempo: milisegundos máximos de espera (si OpenRouteService se cuelga, no se espera de más) */
export async function pedirORS(ruta, { method = 'GET', body, tiempo = 8000, aunqueCaido = false } = {}) {
  if (!process.env.ORS_API_KEY) throw new Error('falta-ORS_API_KEY');
  if (!aunqueCaido && orsCaido()) {
    const error = new Error('ors');
    error.estado = 503;
    error.detalle = { error: 'OpenRouteService no respondió hace un momento' };
    throw error;
  }
  // En los GET (búsqueda de direcciones) la clave también va en la dirección
  let url = `${ORS}${ruta}`;
  if (method === 'GET') url += `${url.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(process.env.ORS_API_KEY)}`;
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), tiempo);
  let resp;
  try {
    resp = await fetch(url, {
      method,
      signal: corte.signal,
      headers: {
        Authorization: process.env.ORS_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json, application/geo+json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    clearTimeout(reloj);
    orsCaidoHasta = Date.now() + 10 * 60 * 1000;
    const error = new Error('ors');
    error.estado = 504;
    error.detalle = { error: corte.signal.aborted ? 'no respondió a tiempo' : 'sin conexión con el servicio' };
    throw error;
  }
  clearTimeout(reloj);
  const texto = await resp.text();
  let datos = null;
  try {
    datos = JSON.parse(texto);
  } catch (e) {
    datos = { error: texto };
  }
  if (!resp.ok) {
    if (resp.status >= 500) orsCaidoHasta = Date.now() + 10 * 60 * 1000;
    const error = new Error('ors');
    error.estado = resp.status;
    error.detalle = datos;
    throw error;
  }
  return datos;
}

/* ---------- OSRM (servidor público del proyecto OSRM) ----------
   Gratis y sin clave. Da tiempos y trazados por calle sobre OpenStreetMap.
   Se usa cuando OpenRouteService no responde. servicio: "table" o "route". */
const OSRM = 'https://router.project-osrm.org';

export async function pedirOSRM(servicio, puntos, parametros = {}, tiempo = 6000) {
  const coords = puntos.map((p) => `${Number(p.lng).toFixed(6)},${Number(p.lat).toFixed(6)}`).join(';');
  const q = new URLSearchParams(parametros);
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), tiempo);
  try {
    const resp = await fetch(`${OSRM}/${servicio}/v1/driving/${coords}?${q.toString()}`, {
      signal: corte.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'Vueltrack/1.0 (vueltrack.vercel.app)' }
    });
    const datos = await resp.json().catch(() => null);
    if (!resp.ok || !datos || datos.code !== 'Ok') {
      const error = new Error('osrm');
      error.estado = resp.status;
      error.detalle = datos;
      throw error;
    }
    return datos;
  } catch (e) {
    if (e.message === 'osrm') throw e;
    const error = new Error('osrm');
    error.estado = 504;
    error.detalle = { error: corte.signal.aborted ? 'no respondió a tiempo' : 'sin conexión' };
    throw error;
  } finally {
    clearTimeout(reloj);
  }
}

/* Georef (datos.gob.ar): servicio oficial de direcciones de Argentina.
   Gratis y sin clave. Entiende "calle + altura" y ubica la altura sobre la cuadra. */
export async function pedirGeoref(recurso, parametros) {
  const q = new URLSearchParams(parametros);
  const resp = await fetch(`https://apis.datos.gob.ar/georef/api/v2.0/${recurso}?${q.toString()}`, {
    headers: { Accept: 'application/json' }
  });
  if (!resp.ok) {
    const error = new Error('georef');
    error.estado = resp.status;
    throw error;
  }
  return resp.json();
}

/* Nominatim (buscador oficial de OpenStreetMap). Gratis, con uso moderado:
   máximo 1 pedido por segundo e identificando la app. */
export async function pedirNominatim(texto, foco) {
  const q = new URLSearchParams({
    q: texto,
    format: 'jsonv2',
    addressdetails: '1',
    namedetails: '1',
    countrycodes: 'ar',
    limit: '6'
  });
  if (foco) {
    q.set('viewbox', [foco.lng - 0.4, foco.lat + 0.4, foco.lng + 0.4, foco.lat - 0.4].join(','));
    q.set('bounded', '0');
  }
  const resp = await fetch(`https://nominatim.openstreetmap.org/search?${q.toString()}`, {
    headers: {
      'User-Agent': 'Vueltrack/2.2 (https://vueltrack.vercel.app)',
      'Accept-Language': 'es'
    }
  });
  if (!resp.ok) {
    const error = new Error('nominatim');
    error.estado = resp.status;
    throw error;
  }
  return resp.json();
}

/* Pedido con tiempo máximo (para no colgar la búsqueda si un servicio tarda) */
async function conTiempo(url, opciones = {}, ms = 6000) {
  const control = new AbortController();
  const corte = setTimeout(() => control.abort(), ms);
  try {
    return await fetch(url, { ...opciones, signal: control.signal });
  } finally {
    clearTimeout(corte);
  }
}

/* Photon (komoot): buscador de OpenStreetMap muy bueno para nombres de lugares.
   Gratis y sin clave, con uso moderado. */
export async function pedirPhoton(texto, foco) {
  const q = new URLSearchParams({ q: texto, limit: '8' });
  if (foco) {
    q.set('lat', String(foco.lat));
    q.set('lon', String(foco.lng));
    q.set('location_bias_scale', '0.4');
  }
  const resp = await conTiempo(`https://photon.komoot.io/api/?${q.toString()}`, {
    headers: { 'User-Agent': 'Vueltrack/2.2 (https://vueltrack.vercel.app)' }
  });
  if (!resp.ok) {
    const error = new Error('photon');
    error.estado = resp.status;
    throw error;
  }
  return resp.json();
}

/* Overpass: busca por nombre todo lo cargado en OpenStreetMap alrededor del punto de salida.
   Encuentra comercios que los buscadores a veces no indexan. */
/* Patrón para Overpass sin importar tildes ni mayúsculas: "ferreteria" encuentra "Ferretería" */
export function patronOverpass(texto) {
  const limpio = String(texto || '').replace(/[\\^$.|?*+()[\]{}"]/g, ' ').replace(/\s+/g, ' ').trim();
  const VOCALES = { a: '[aáAÁ]', e: '[eéEÉ]', i: '[iíIÍ]', o: '[oóOÓ]', u: '[uúüUÚÜ]', n: '[nñNÑ]' };
  return limpio
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split('')
    .map((c) => VOCALES[c] || c)
    .join('');
}

export async function pedirOverpass(texto, foco, radioMetros = 25000) {
  const patron = patronOverpass(texto);
  if (!patron || !foco) return { elements: [] };
  return consultarOverpass(`[out:json][timeout:8];nwr["name"~"${patron}",i](around:${radioMetros},${foco.lat},${foco.lng});out center tags 8;`);
}

/* Consulta libre a Overpass (OpenStreetMap) */
export async function consultarOverpass(consulta, tope = 9000) {
  const resp = await conTiempo(
    'https://overpass-api.de/api/interpreter',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Vueltrack/2.2 (https://vueltrack.vercel.app)' },
      body: 'data=' + encodeURIComponent(consulta)
    },
    tope
  );
  if (!resp.ok) {
    const error = new Error('overpass');
    error.estado = resp.status;
    throw error;
  }
  return resp.json();
}

export function responder(res, estado, datos) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(estado).json(datos);
}

/* ---------- Google Places (API nueva) ----------
   Solo si está la variable GOOGLE_MAPS_API_KEY en Vercel.
   Autocompletado: 10.000 pedidos gratis por mes. Detalle con ubicación y
   dirección (campos "Essentials"): 10.000 gratis por mes. */
export const hayGoogle = () => !!process.env.GOOGLE_MAPS_API_KEY;

export async function pedirGoogle(ruta, { metodo = 'GET', cuerpo = null, campos = '' } = {}) {
  const headers = { 'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY };
  if (cuerpo) headers['Content-Type'] = 'application/json';
  if (campos) headers['X-Goog-FieldMask'] = campos;
  const resp = await conTiempo(
    `https://places.googleapis.com/v1/${ruta}`,
    { method: metodo, headers, body: cuerpo ? JSON.stringify(cuerpo) : undefined },
    6000
  );
  const datos = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const error = new Error('google');
    error.estado = resp.status;
    error.detalle = datos.error || datos;
    throw error;
  }
  return datos;
}
