/* =========================================================
   POST /api/optimizar
   Ordena la vuelta con OpenRouteService (motor VROOM).
   Cuerpo:
     base       {lat, lng}       punto de salida
     volver     boolean          termina en el punto de salida
     demora     minutos por parada
     salida     segundos desde las 00:00
     vehiculos  [uid]            fleteros que salen
     paradas    [{id, lat, lng, urgente, hasta (segundos|null), vehiculo}]
     modo       "grupos" (cada parada ya tiene fletero) | "parejo"
   Respuesta:
     rutas      [{vehiculo, paradas:[{id, llegada}], distancia, duracion, fin, geometria}]
     sinAsignar [id]
   Límites del plan gratis: 50 ubicaciones y 3 vehículos por pedido.
   ========================================================= */
import { verificarUsuario, pedirORS, responder } from './_comun.js';

const MAX_PARADAS_POR_PEDIDO = 48;
const MAX_VEHICULOS_POR_PEDIDO = 3;
const FIN_DEL_DIA = 86399;
const VENTANA_URGENTE = 90 * 60;

function validar(cuerpo) {
  const { base, paradas, vehiculos } = cuerpo || {};
  if (!base || !Number.isFinite(base.lat) || !Number.isFinite(base.lng)) return 'base';
  if (!Array.isArray(paradas) || !paradas.length) return 'paradas';
  if (!Array.isArray(vehiculos) || !vehiculos.length) return 'vehiculos';
  if (paradas.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || !p.id)) return 'paradas';
  return null;
}

/* Un pedido a VROOM con uno o más vehículos */
async function resolver({ base, volver, demora, salida, paradas, vehiculos, parejo, conUrgentes = true }) {
  const inicio = [base.lng, base.lat];
  const capacidad = Math.ceil(paradas.length / vehiculos.length);

  const jobs = paradas.map((p, i) => {
    const job = {
      id: i + 1,
      location: [p.lng, p.lat],
      service: Math.round(Math.max(0, demora) * 60)
    };
    let hasta = Number.isFinite(p.hasta) ? p.hasta : FIN_DEL_DIA;
    if (conUrgentes && p.urgente) {
      job.priority = 100;
      hasta = Math.min(hasta, salida + VENTANA_URGENTE);
    }
    if (hasta < FIN_DEL_DIA) job.time_windows = [[0, Math.max(0, hasta)]];
    if (parejo) job.amount = [1];
    return job;
  });

  const vehicles = vehiculos.map((uid, i) => {
    const v = {
      id: i + 1,
      profile: 'driving-car',
      start: inicio,
      time_window: [salida, FIN_DEL_DIA]
    };
    if (volver) v.end = inicio;
    if (parejo) v.capacity = [capacidad];
    return v;
  });

  const datos = await pedirORS('/vroom/v0', {
    method: 'POST',
    body: { jobs, vehicles, options: { g: true } }
  });

  // Si las urgentes no entraron en la primera hora y media, se reintenta sin esa exigencia
  if (conUrgentes && paradas.some((p) => p.urgente) && (datos.unassigned || []).length) {
    const urgenteSinLugar = (datos.unassigned || []).some((u) => paradas[u.id - 1] && paradas[u.id - 1].urgente);
    if (urgenteSinLugar) {
      return resolver({ base, volver, demora, salida, paradas, vehiculos, parejo, conUrgentes: false });
    }
  }

  const rutas = (datos.routes || []).map((r) => {
    const pasos = r.steps || [];
    const deParadas = pasos.filter((s) => s.type === 'job');
    const ultimo = pasos[pasos.length - 1];
    let fin = ultimo ? ultimo.arrival : salida;
    if (ultimo && ultimo.type === 'job') fin += ultimo.service || 0;
    const arranque = pasos[0] ? pasos[0].arrival : salida;
    return {
      vehiculo: vehiculos[r.vehicle - 1],
      paradas: deParadas.map((s) => ({ id: paradas[s.job - 1].id, llegada: s.arrival })),
      distancia: r.distance ?? null,
      duracion: fin - arranque,
      fin,
      geometria: r.geometry || ''
    };
  });

  const sinAsignar = (datos.unassigned || []).map((u) => paradas[u.id - 1] && paradas[u.id - 1].id).filter(Boolean);
  return { rutas, sinAsignar };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { error: 'metodo' });
  const uid = await verificarUsuario(req);
  if (!uid) return responder(res, 401, { error: 'sin-sesion' });

  const cuerpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  const problema = validar(cuerpo);
  if (problema) return responder(res, 400, { error: `datos-${problema}` });

  const base = cuerpo.base;
  const volver = cuerpo.volver !== false;
  const demora = Number.isFinite(cuerpo.demora) ? cuerpo.demora : 5;
  const salida = Number.isFinite(cuerpo.salida) ? Math.max(0, Math.min(cuerpo.salida, FIN_DEL_DIA - 60)) : 8 * 3600;
  const vehiculos = cuerpo.vehiculos.map(String);
  const paradas = cuerpo.paradas;

  try {
    const parejo =
      cuerpo.modo === 'parejo' &&
      vehiculos.length > 1 &&
      vehiculos.length <= MAX_VEHICULOS_POR_PEDIDO &&
      paradas.length <= MAX_PARADAS_POR_PEDIDO;

    if (parejo) {
      const r = await resolver({ base, volver, demora, salida, paradas, vehiculos, parejo: true });
      return responder(res, 200, r);
    }

    // Un pedido por fletero con sus paradas
    const porVehiculo = new Map();
    paradas.forEach((p) => {
      const v = vehiculos.includes(String(p.vehiculo)) ? String(p.vehiculo) : vehiculos[0];
      if (!porVehiculo.has(v)) porVehiculo.set(v, []);
      porVehiculo.get(v).push(p);
    });

    const rutas = [];
    const sinAsignar = [];
    for (const [vehiculo, suyas] of porVehiculo) {
      if (suyas.length > MAX_PARADAS_POR_PEDIDO) {
        return responder(res, 400, { error: 'demasiadas-paradas', maximo: MAX_PARADAS_POR_PEDIDO });
      }
      const r = await resolver({ base, volver, demora, salida, paradas: suyas, vehiculos: [vehiculo], parejo: false });
      rutas.push(...r.rutas);
      sinAsignar.push(...r.sinAsignar);
    }
    return responder(res, 200, { rutas, sinAsignar });
  } catch (e) {
    const limite = e.estado === 429;
    return responder(res, limite ? 429 : 502, { error: limite ? 'limite-diario' : 'optimizacion' });
  }
}
