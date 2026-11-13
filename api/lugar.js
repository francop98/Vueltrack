/* =========================================================
   GET /api/lugar?lat=...&lng=...
   Dirección aproximada de un punto (para "Usar mi ubicación actual").
   Prueba con Nominatim (OpenStreetMap) y, si no hay calle, con Georef.
   ========================================================= */
import { verificarUsuario, pedirGeoref, responder } from './_comun.js';

function nombrePropio(texto) {
  return String(texto || '')
    .toLowerCase()
    .replace(/(^|[\s.(-])([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase());
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return responder(res, 405, { error: 'metodo' });
  const uid = await verificarUsuario(req);
  if (!uid) return responder(res, 401, { error: 'sin-sesion' });

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return responder(res, 400, { error: 'coordenadas' });

  try {
    const q = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'jsonv2', addressdetails: '1', zoom: '18' });
    const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?${q.toString()}`, {
      headers: { 'User-Agent': 'Vueltrack/2.0 (https://vueltrack.vercel.app)', 'Accept-Language': 'es' }
    });
    if (resp.ok) {
      const d = await resp.json();
      const a = d.address || {};
      const calle = a.road || a.pedestrian || '';
      if (calle) {
        const ciudad = a.city || a.town || a.village || a.suburb || '';
        return responder(res, 200, {
          direccion: `${calle}${a.house_number ? ' ' + a.house_number : ''}`,
          detalle: ciudad
        });
      }
    }
  } catch (e) {
    console.log('[lugar] nominatim', e.message);
  }

  try {
    const datos = await pedirGeoref('ubicacion', { lat, lon: lng });
    const u = datos.ubicacion || {};
    if (u.calle && u.calle.nombre) {
      const altura = u.calle.altura != null ? ` ${u.calle.altura}` : '';
      return responder(res, 200, { direccion: nombrePropio(u.calle.nombre) + altura, detalle: (u.municipio && u.municipio.nombre) || '' });
    }
    const zona = (u.municipio && u.municipio.nombre) || (u.departamento && u.departamento.nombre) || '';
    return responder(res, 200, { direccion: zona ? `Mi ubicación (${zona})` : 'Mi ubicación', detalle: '' });
  } catch (e) {
    return responder(res, 200, { direccion: 'Mi ubicación', detalle: '' });
  }
}
