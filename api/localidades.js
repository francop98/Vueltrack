/* =========================================================
   GET /api/localidades?nombre=...&provincia=...
   Sugerencias de localidades de Argentina (Georef, datos.gob.ar).
   ========================================================= */
import { verificarUsuario, pedirGeoref, responder } from './_comun.js';

function nombrePropio(texto) {
  return String(texto || '')
    .toLowerCase()
    .replace(/(^|[\s.(-])([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\b(De|Del|La|Las|Los|Y)\b/g, (m) => m.toLowerCase())
    .replace(/^./, (c) => c.toUpperCase());
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return responder(res, 405, { error: 'metodo' });
  const uid = await verificarUsuario(req);
  if (!uid) return responder(res, 401, { error: 'sin-sesion' });

  const nombre = String(req.query.nombre || '').trim().slice(0, 80);
  const provincia = String(req.query.provincia || '').trim().slice(0, 80);
  if (nombre.length < 2) return responder(res, 200, { localidades: [] });

  try {
    const parametros = { nombre, max: '8', campos: 'completo' };
    if (provincia) parametros.provincia = provincia;
    const datos = await pedirGeoref('localidades', parametros);
    const vistos = new Set();
    const localidades = (datos.localidades || [])
      .filter((l) => l.centroide && Number.isFinite(l.centroide.lat))
      .map((l) => ({
        localidad: nombrePropio(l.nombre),
        partido: (l.departamento && l.departamento.nombre) || '',
        provincia: (l.provincia && l.provincia.nombre) || provincia,
        lat: l.centroide.lat,
        lng: l.centroide.lon
      }))
      .filter((l) => {
        const clave = `${l.localidad}|${l.partido}|${l.provincia}`;
        if (vistos.has(clave)) return false;
        vistos.add(clave);
        return true;
      });
    return responder(res, 200, { localidades });
  } catch (e) {
    return responder(res, 502, { error: 'localidades' });
  }
}
