/* =========================================================
   GET /api/buscar?texto=...&lat=...&lng=...
   Sugerencias de direcciones (OpenRouteService / OpenStreetMap)
   ========================================================= */
import { verificarUsuario, pedirORS, responder } from './_comun.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return responder(res, 405, { error: 'metodo' });
  const uid = await verificarUsuario(req);
  if (!uid) return responder(res, 401, { error: 'sin-sesion' });

  const texto = String(req.query.texto || '').trim().slice(0, 120);
  if (texto.length < 3) return responder(res, 200, { resultados: [] });

  const q = new URLSearchParams({
    text: texto,
    'boundary.country': 'AR',
    layers: 'address,street,venue',
    size: '6'
  });
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    q.set('focus.point.lat', String(lat));
    q.set('focus.point.lon', String(lng));
  }

  try {
    const datos = await pedirORS(`/pelias/v1/autocomplete?${q.toString()}`);
    const vistos = new Set();
    const resultados = (datos.features || [])
      .map((f) => {
        const p = f.properties || {};
        const [lngR, latR] = f.geometry.coordinates;
        const ciudad = p.locality || p.localadmin || p.county || '';
        const provincia = p.region || '';
        const sinAltura = p.layer === 'street';
        return {
          direccion: p.name || p.label,
          detalle: [ciudad, provincia].filter(Boolean).join(', ') + (sinAltura ? ' · sin altura exacta' : ''),
          lat: latR,
          lng: lngR
        };
      })
      .filter((r) => {
        const clave = `${r.direccion}|${r.detalle}`;
        if (vistos.has(clave)) return false;
        vistos.add(clave);
        return true;
      });
    return responder(res, 200, { resultados });
  } catch (e) {
    return responder(res, 502, { error: 'busqueda' });
  }
}
