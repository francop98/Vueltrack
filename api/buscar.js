/* =========================================================
   GET /api/buscar?texto=...&lat=...&lng=...
   Sugerencias de direcciones. Prueba en este orden y se queda
   con lo primero que encuentre con altura:
     1. OpenRouteService · autocompletar
     2. OpenRouteService · búsqueda completa
     3. Nominatim (OpenStreetMap), que entiende mejor "calle + altura"
   Si solo aparece la calle sin la altura, devuelve la calle con la
   altura que escribió el usuario y la marca como aproximada
   (después se ajusta el pin en el mapa).
   ========================================================= */
import { verificarUsuario, pedirORS, pedirNominatim, responder } from './_comun.js';

const MAX = 6;

function separarAltura(texto) {
  // Toma el último número como altura ("Av. 9 de Julio 1200" → calle "Av. 9 de Julio", altura 1200)
  const m = texto.match(/^(.*\D)\s+(?:n[°º]?\s*)?(\d{1,5})\b\s*,?\s*(.*)$/i);
  if (!m || !m[1].trim()) return { calle: texto, numero: null, resto: '' };
  return { calle: m[1].replace(/,\s*$/, '').trim(), numero: m[2], resto: m[3].trim() };
}

function desdePelias(datos) {
  return (datos.features || []).map((f) => {
    const p = f.properties || {};
    const [lng, lat] = f.geometry.coordinates;
    const conAltura = p.layer === 'address' || !!p.housenumber;
    return {
      calle: p.street || p.name || '',
      direccion: p.name || p.label,
      ciudad: p.locality || p.localadmin || p.county || '',
      provincia: p.region || '',
      lat,
      lng,
      conAltura
    };
  });
}

function desdeNominatim(lista) {
  return (lista || []).map((n) => {
    const a = n.address || {};
    const calle = a.road || a.pedestrian || a.footway || '';
    const conAltura = !!a.house_number;
    return {
      calle,
      direccion: calle ? `${calle}${conAltura ? ' ' + a.house_number : ''}` : (n.display_name || '').split(',')[0],
      ciudad: a.city || a.town || a.village || a.suburb || a.municipality || '',
      provincia: a.state || '',
      lat: Number(n.lat),
      lng: Number(n.lon),
      conAltura
    };
  });
}

function parametrosPelias(texto, foco) {
  const q = new URLSearchParams({ text: texto, 'boundary.country': 'AR', layers: 'address,street,venue', size: String(MAX) });
  if (foco) {
    q.set('focus.point.lat', String(foco.lat));
    q.set('focus.point.lon', String(foco.lng));
  }
  return q.toString();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return responder(res, 405, { error: 'metodo' });
  const uid = await verificarUsuario(req);
  if (!uid) return responder(res, 401, { error: 'sin-sesion' });

  const texto = String(req.query.texto || '').trim().slice(0, 120);
  if (texto.length < 3) return responder(res, 200, { resultados: [] });

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const foco = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  const { calle, numero } = separarAltura(texto);

  let encontrados = [];
  let fallas = 0;
  const hayConAltura = () => encontrados.some((r) => r.conAltura);

  const intentos = [
    async () => desdePelias(await pedirORS(`/pelias/v1/autocomplete?${parametrosPelias(texto, foco)}`)),
    async () => desdePelias(await pedirORS(`/pelias/v1/search?${parametrosPelias(texto, foco)}`)),
    async () => desdeNominatim(await pedirNominatim(texto, foco))
  ];

  for (const intento of intentos) {
    if (hayConAltura()) break;
    try {
      encontrados = encontrados.concat(await intento());
    } catch (e) {
      fallas++;
      console.log('[buscar] falló un intento', e.message, e.estado || '', JSON.stringify(e.detalle || '').slice(0, 300));
    }
  }

  // Sin resultados y con altura escrita: buscar solo la calle
  if (!encontrados.length && numero && calle.length >= 3) {
    try {
      encontrados = desdePelias(await pedirORS(`/pelias/v1/search?${parametrosPelias(calle, foco)}`));
      if (!encontrados.length) encontrados = desdeNominatim(await pedirNominatim(calle, foco));
    } catch (e) {
      fallas++;
    }
  }

  if (!encontrados.length && fallas >= intentos.length) {
    return responder(res, 502, { error: 'busqueda' });
  }

  const vistos = new Set();
  const resultados = encontrados
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng) && r.direccion)
    .map((r) => {
      const nombreCalle = String(r.calle || r.direccion);
      const yaTieneNumero = numero && new RegExp(`\\b${numero}$`).test(nombreCalle.trim());
      const aproximada = !r.conAltura && !!numero && !yaTieneNumero;
      const direccion = aproximada ? `${nombreCalle} ${numero}` : r.direccion;
      const lugar = [r.ciudad, r.provincia].filter(Boolean).join(', ');
      return {
        direccion,
        detalle: lugar + (aproximada ? ' · altura aproximada, ajustá el pin' : !r.conAltura && !yaTieneNumero ? ' · sin altura' : ''),
        lat: r.lat,
        lng: r.lng,
        aproximada,
        conAltura: r.conAltura
      };
    })
    .sort((a, b) => Number(b.conAltura) - Number(a.conAltura))
    // Si hay direcciones con altura exacta, no se muestran las aproximadas
    .filter((r, _, todas) => !(r.aproximada && todas.some((x) => x.conAltura)))
    .filter((r) => {
      const clave = `${r.direccion.toLowerCase()}|${r.lat.toFixed(4)}|${r.lng.toFixed(4)}`;
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    })
    .slice(0, MAX)
    .map(({ conAltura, ...r }) => r);

  console.log('[buscar]', JSON.stringify({ texto, resultados: resultados.length, conAltura: hayConAltura() }));
  return responder(res, 200, { resultados });
}
