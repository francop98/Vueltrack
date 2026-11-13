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
     orden      "optimo" (recorrido más conveniente) | "cerca" (de la más cercana
                a la más lejana) | "lejos" (al revés) | "cierre" (por horario de cierre)
     desde      {lat, lng} opcional: arranca desde acá (ej. ubicación actual)
                en vez del punto de salida
   Respuesta:
     rutas      [{vehiculo, paradas:[{id, llegada}], distancia, duracion, fin, geometria}]
     sinAsignar [id]
   Límites del plan gratis: 50 ubicaciones y 3 vehículos por pedido.
   ========================================================= */
import { verificarUsuario, pedirORS, responder } from './_comun.js';

const MAX_PARADAS_POR_PEDIDO = 48;
const ORDENES = ['optimo', 'cerca', 'lejos', 'cierre'];
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
async function resolver({ base, desde, volver, demora, salida, paradas, vehiculos, parejo, conUrgentes = true }) {
  const inicio = desde ? [desde.lng, desde.lat] : [base.lng, base.lat];
  const fin = [base.lng, base.lat];
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
    if (volver) v.end = fin;
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
      return resolver({ base, desde, volver, demora, salida, paradas, vehiculos, parejo, conUrgentes: false });
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

/* ---------- Orden elegido por el usuario (cercanía u horario de cierre) ---------- */

function distanciaKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/* Recorre siempre a la parada más cercana a la anterior */
function porCercania(paradas, desde) {
  const quedan = [...paradas];
  const orden = [];
  let actual = desde;
  while (quedan.length) {
    let mejor = 0;
    quedan.forEach((p, i) => {
      if (distanciaKm(actual, p) < distanciaKm(actual, quedan[mejor])) mejor = i;
    });
    actual = quedan.splice(mejor, 1)[0];
    orden.push(actual);
  }
  return orden;
}

function ordenarFijo(paradas, orden, base, inicio) {
  const urgentes = paradas.filter((p) => p.urgente);
  const resto = paradas.filter((p) => !p.urgente);
  const deBase = (p) => distanciaKm(base, p);
  let lista;
  if (orden === 'cerca') lista = [...resto].sort((a, b) => deBase(a) - deBase(b));
  else if (orden === 'lejos') lista = [...resto].sort((a, b) => deBase(b) - deBase(a));
  else {
    // Por horario de cierre: primero las que cierran antes; las que no tienen horario, al final por cercanía
    const conHorario = resto.filter((p) => Number.isFinite(p.hasta)).sort((a, b) => a.hasta - b.hasta || deBase(a) - deBase(b));
    const sinHorario = resto.filter((p) => !Number.isFinite(p.hasta));
    const ultima = conHorario.length ? conHorario[conHorario.length - 1] : inicio;
    lista = [...conHorario, ...porCercania(sinHorario, ultima)];
  }
  // Las urgentes siempre van primero
  return [...porCercania(urgentes, inicio), ...lista];
}

/* Ruta en un orden fijo: pide a OpenRouteService el trazado y los tiempos de cada tramo */
async function rutaFija({ base, desde, volver, demora, salida, paradas, vehiculo, orden }) {
  const inicio = desde || base;
  const ordenadas = ordenarFijo(paradas, orden, base, inicio);
  const puntos = [inicio, ...ordenadas];
  if (volver) puntos.push(base);
  if (puntos.length < 2) puntos.push(inicio);

  const datos = await pedirORS('/openrouteservice/v2/directions/driving-car/json', {
    method: 'POST',
    body: { coordinates: puntos.map((p) => [p.lng, p.lat]), instructions: false }
  });
  const ruta = (datos.routes || [])[0];
  if (!ruta) throw new Error('sin-ruta');
  const tramos = ruta.segments || [];

  let t = salida;
  const lista = ordenadas.map((p, i) => {
    t += tramos[i] ? tramos[i].duration : 0;
    const llegada = Math.round(t);
    t += Math.max(0, demora) * 60;
    return { id: p.id, llegada };
  });
  if (volver && tramos[ordenadas.length]) t += tramos[ordenadas.length].duration;

  const sinAsignar = ordenadas.filter((p, i) => Number.isFinite(p.hasta) && lista[i].llegada > p.hasta).map((p) => p.id);
  return {
    ruta: {
      vehiculo,
      paradas: lista,
      distancia: ruta.summary ? ruta.summary.distance : null,
      duracion: Math.round(t - salida),
      fin: Math.round(t),
      geometria: ruta.geometry || ''
    },
    llegaTarde: sinAsignar
  };
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
  const orden = ORDENES.includes(cuerpo.orden) ? cuerpo.orden : 'optimo';
  const desde =
    cuerpo.desde && Number.isFinite(cuerpo.desde.lat) && Number.isFinite(cuerpo.desde.lng)
      ? { lat: cuerpo.desde.lat, lng: cuerpo.desde.lng }
      : null;

  try {
    const parejo =
      cuerpo.modo === 'parejo' &&
      vehiculos.length > 1 &&
      vehiculos.length <= MAX_VEHICULOS_POR_PEDIDO &&
      paradas.length <= MAX_PARADAS_POR_PEDIDO;

    if (parejo) {
      const r = await resolver({ base, desde, volver, demora, salida, paradas, vehiculos, parejo: true });
      if (orden === 'optimo') return responder(res, 200, r);
      // Reparto parejo, pero cada fletero recorre sus paradas en el orden elegido
      const porId = new Map(paradas.map((p) => [p.id, p]));
      const rutas = [];
      const llegaTarde = [];
      for (const ruta of r.rutas) {
        const suyas = ruta.paradas.map((x) => porId.get(x.id)).filter(Boolean);
        if (!suyas.length) continue;
        const fija = await rutaFija({ base, desde, volver, demora, salida, paradas: suyas, vehiculo: ruta.vehiculo, orden });
        rutas.push(fija.ruta);
        llegaTarde.push(...fija.llegaTarde);
      }
      return responder(res, 200, { rutas, sinAsignar: r.sinAsignar, llegaTarde });
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
    const llegaTarde = [];
    for (const [vehiculo, suyas] of porVehiculo) {
      if (suyas.length > MAX_PARADAS_POR_PEDIDO) {
        return responder(res, 400, { error: 'demasiadas-paradas', maximo: MAX_PARADAS_POR_PEDIDO });
      }
      if (orden === 'optimo') {
        const r = await resolver({ base, desde, volver, demora, salida, paradas: suyas, vehiculos: [vehiculo], parejo: false });
        rutas.push(...r.rutas);
        sinAsignar.push(...r.sinAsignar);
      } else {
        const fija = await rutaFija({ base, desde, volver, demora, salida, paradas: suyas, vehiculo, orden });
        rutas.push(fija.ruta);
        llegaTarde.push(...fija.llegaTarde);
      }
    }
    return responder(res, 200, { rutas, sinAsignar, llegaTarde });
  } catch (e) {
    console.log('[optimizar] error', e.message, e.estado || '', JSON.stringify(e.detalle || '').slice(0, 300));
    const limite = e.estado === 429;
    return responder(res, limite ? 429 : 502, { error: limite ? 'limite-diario' : 'optimizacion' });
  }
}
