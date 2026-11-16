/* =========================================================
   POST /api/optimizar
   Ordena la vuelta con OpenRouteService (motor VROOM).
   Cuerpo:
     base       {lat, lng}       punto de salida
     volver     boolean          termina en el punto de salida
     demora     minutos por parada
     salida     segundos desde las 00:00
     vehiculos  [uid]            fleteros que salen
     paradas    [{id, lat, lng, urgente, desde, hasta (segundos|null), vehiculo,
                  tipo ("entrega"|"retiro"), entregaId (si es retiro), bultos}]
     capacidades {uid: bultos} opcional
     pausa      {desde, hasta (segundos), minutos} opcional
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
const ORDENES = ['optimo', 'cerca', 'lejos', 'cierre', 'manual'];
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

const SIN_LIMITE = 100000;

function ventana(p) {
  const desde = Number.isFinite(p.desde) ? Math.max(0, p.desde) : 0;
  const hasta = Number.isFinite(p.hasta) ? p.hasta : FIN_DEL_DIA;
  return { desde, hasta };
}

/* Retiros con su entrega en la misma vuelta: van como "envío" (primero se retira, después se entrega) */
function armarPares(paradas) {
  const indice = new Map(paradas.map((p, i) => [p.id, i]));
  const pares = [];
  const enPar = new Set();
  paradas.forEach((p, i) => {
    if (p.tipo !== 'retiro' || !p.entregaId || !indice.has(p.entregaId)) return;
    const j = indice.get(p.entregaId);
    if (enPar.has(i) || enPar.has(j) || i === j) return;
    pares.push([i, j]);
    enPar.add(i);
    enPar.add(j);
  });
  return { pares, enPar };
}

function pasoDe(p, i, demora, salida, conUrgentes) {
  const paso = { id: i + 1, location: [p.lng, p.lat], service: Math.round(Math.max(0, demora) * 60) };
  let { desde, hasta } = ventana(p);
  if (conUrgentes && p.urgente) hasta = Math.min(hasta, salida + VENTANA_URGENTE);
  if (desde > 0 || hasta < FIN_DEL_DIA) paso.time_windows = [[Math.min(desde, Math.max(0, hasta)), Math.max(0, hasta)]];
  return paso;
}

/* Un pedido a VROOM con uno o más vehículos */
async function resolver({ base, desde, volver, demora, salida, paradas, vehiculos, parejo, capacidades = {}, pausa = null, conUrgentes = true, noLleva = {} }) {
  // Tipos de carga (solo al repartir entre varios): cada parada pide sus cargas
  // y cada vehículo tiene todas menos las que ese fletero no lleva
  const tipos = parejo ? [...new Set(paradas.flatMap((p) => (Array.isArray(p.cargas) ? p.cargas : [])))] : [];
  const idTipo = new Map(tipos.map((t, i) => [t, i + 1]));
  const pide = (p) => (Array.isArray(p.cargas) ? p.cargas.map((t) => idTipo.get(t)).filter(Boolean) : []);
  const inicio = desde ? [desde.lng, desde.lat] : [base.lng, base.lat];
  const fin = [base.lng, base.lat];
  const cupo = Math.ceil(paradas.length / vehiculos.length);
  const { pares, enPar } = armarPares(paradas);
  const bultos = (p) => Math.max(0, Math.round(Number(p.bultos) || 0));

  // Dos medidas: [cantidad de paradas (para repartir parejo), bultos (capacidad del vehículo)]
  const jobs = [];
  paradas.forEach((p, i) => {
    if (enPar.has(i)) return;
    const job = pasoDe(p, i, demora, salida, conUrgentes);
    if (conUrgentes && p.urgente) job.priority = 100;
    if (tipos.length && pide(p).length) job.skills = pide(p);
    const carga = [parejo ? 1 : 0, bultos(p)];
    if (p.tipo === 'retiro') job.pickup = carga;
    else job.delivery = carga;
    jobs.push(job);
  });

  const shipments = pares.map(([i, j]) => {
    const envio = {
      amount: [parejo ? 1 : 0, bultos(paradas[i]) || bultos(paradas[j])],
      pickup: pasoDe(paradas[i], i, demora, salida, conUrgentes),
      delivery: pasoDe(paradas[j], j, demora, salida, conUrgentes)
    };
    if (conUrgentes && (paradas[i].urgente || paradas[j].urgente)) envio.priority = 100;
    const habilidad = [...new Set([...pide(paradas[i]), ...pide(paradas[j])])];
    if (tipos.length && habilidad.length) envio.skills = habilidad;
    return envio;
  });

  const vehicles = vehiculos.map((uid, i) => {
    const v = {
      id: i + 1,
      profile: 'driving-car',
      start: inicio,
      time_window: [salida, FIN_DEL_DIA],
      capacity: [parejo ? cupo : SIN_LIMITE, Number(capacidades[uid]) > 0 ? Math.round(capacidades[uid]) : SIN_LIMITE]
    };
    if (volver) v.end = fin;
    if (tipos.length) {
      const no = Array.isArray(noLleva[uid]) ? noLleva[uid] : [];
      v.skills = tipos.filter((t) => !no.includes(t)).map((t) => idTipo.get(t));
    }
    if (pausa && pausa.hasta > salida && pausa.minutos > 0) {
      v.breaks = [{ id: 1, time_windows: [[Math.max(pausa.desde, salida), pausa.hasta]], service: Math.round(pausa.minutos * 60) }];
    }
    return v;
  });

  const cuerpo = { jobs, vehicles, options: { g: true } };
  if (shipments.length) cuerpo.shipments = shipments;
  const datos = await pedirORS('/vroom/v0', { method: 'POST', body: cuerpo });

  const idDePaso = (s) => s.id ?? s.job;

  // Si las urgentes no entraron en la primera hora y media, se reintenta sin esa exigencia
  if (conUrgentes && paradas.some((p) => p.urgente) && (datos.unassigned || []).length) {
    const urgenteSinLugar = (datos.unassigned || []).some((u) => paradas[idDePaso(u) - 1] && paradas[idDePaso(u) - 1].urgente);
    if (urgenteSinLugar) {
      return resolver({ base, desde, volver, demora, salida, paradas, vehiculos, parejo, capacidades, pausa, conUrgentes: false, noLleva });
    }
  }

  const TIPOS_PARADA = ['job', 'pickup', 'delivery'];
  const rutas = (datos.routes || []).map((r) => {
    const pasos = r.steps || [];
    const deParadas = pasos.filter((s) => TIPOS_PARADA.includes(s.type));
    const ultimo = pasos[pasos.length - 1];
    let fin = ultimo ? ultimo.arrival : salida;
    if (ultimo && TIPOS_PARADA.includes(ultimo.type)) fin += (ultimo.waiting_time || 0) + (ultimo.service || 0);
    const arranque = pasos[0] ? pasos[0].arrival : salida;
    return {
      vehiculo: vehiculos[r.vehicle - 1],
      paradas: deParadas.map((s) => ({ id: paradas[idDePaso(s) - 1].id, llegada: s.arrival + (s.waiting_time || 0) })),
      distancia: r.distance ?? null,
      duracion: fin - arranque,
      fin,
      geometria: r.geometry || ''
    };
  });

  const sinAsignar = [...new Set((datos.unassigned || []).map((u) => paradas[idDePaso(u) - 1] && paradas[idDePaso(u) - 1].id).filter(Boolean))];
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
  // A mano: se respeta el orden en que llegan (solo se cuida que el retiro vaya antes que su entrega)
  if (orden === 'manual') return retiroAntesQueEntrega(paradas);
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
  return retiroAntesQueEntrega([...porCercania(urgentes, inicio), ...lista]);
}

/* Si una entrega quedó antes que su retiro, pasa a ir justo después del retiro */
function retiroAntesQueEntrega(lista) {
  const resultado = [...lista];
  resultado
    .filter((p) => p.tipo === 'retiro' && p.entregaId)
    .forEach((retiro) => {
      const iR = resultado.indexOf(retiro);
      const iE = resultado.findIndex((p) => p.id === retiro.entregaId);
      if (iE >= 0 && iE < iR) {
        const [entrega] = resultado.splice(iE, 1);
        resultado.splice(resultado.indexOf(retiro) + 1, 0, entrega);
      }
    });
  return resultado;
}

/* Ruta en un orden fijo: pide a OpenRouteService el trazado y los tiempos de cada tramo */
async function rutaFija({ base, desde, volver, demora, salida, paradas, vehiculo, orden, pausa = null }) {
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
  let pausaHecha = !pausa || !(pausa.minutos > 0) || pausa.hasta <= salida;
  const tomarPausa = () => {
    if (!pausaHecha && t >= pausa.desde) {
      t += pausa.minutos * 60;
      pausaHecha = true;
    }
  };
  const lista = ordenadas.map((p, i) => {
    tomarPausa();
    t += tramos[i] ? tramos[i].duration : 0;
    // Si llega antes de que abra, espera
    if (Number.isFinite(p.desde) && t < p.desde) t = p.desde;
    const llegada = Math.round(t);
    t += Math.max(0, demora) * 60;
    return { id: p.id, llegada };
  });
  tomarPausa();
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
  const capacidades = cuerpo.capacidades && typeof cuerpo.capacidades === 'object' ? cuerpo.capacidades : {};
  const noLleva = cuerpo.noLleva && typeof cuerpo.noLleva === 'object' ? cuerpo.noLleva : {};
  const pausa =
    cuerpo.pausa && Number.isFinite(cuerpo.pausa.desde) && Number.isFinite(cuerpo.pausa.hasta) && Number(cuerpo.pausa.minutos) > 0
      ? { desde: cuerpo.pausa.desde, hasta: Math.max(cuerpo.pausa.desde, cuerpo.pausa.hasta), minutos: Number(cuerpo.pausa.minutos) }
      : null;

  // La entrega de un retiro la hace el mismo fletero que retira
  const porIdParada = new Map(paradas.map((p) => [p.id, p]));
  paradas.forEach((p) => {
    if (p.tipo === 'retiro' && p.entregaId && porIdParada.has(p.entregaId)) porIdParada.get(p.entregaId).vehiculo = p.vehiculo;
  });

  try {
    const parejo =
      cuerpo.modo === 'parejo' &&
      vehiculos.length > 1 &&
      vehiculos.length <= MAX_VEHICULOS_POR_PEDIDO &&
      paradas.length <= MAX_PARADAS_POR_PEDIDO;

    if (parejo) {
      const r = await resolver({ base, desde, volver, demora, salida, paradas, vehiculos, parejo: true, capacidades, pausa, noLleva });
      if (orden === 'optimo') return responder(res, 200, r);
      // Reparto parejo, pero cada fletero recorre sus paradas en el orden elegido
      const porId = new Map(paradas.map((p) => [p.id, p]));
      const rutas = [];
      const llegaTarde = [];
      for (const ruta of r.rutas) {
        const suyas = ruta.paradas.map((x) => porId.get(x.id)).filter(Boolean);
        if (!suyas.length) continue;
        const fija = await rutaFija({ base, desde, volver, demora, salida, paradas: suyas, vehiculo: ruta.vehiculo, orden, pausa });
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
        const r = await resolver({ base, desde, volver, demora, salida, paradas: suyas, vehiculos: [vehiculo], parejo: false, capacidades, pausa });
        rutas.push(...r.rutas);
        sinAsignar.push(...r.sinAsignar);
      } else {
        const fija = await rutaFija({ base, desde, volver, demora, salida, paradas: suyas, vehiculo, orden, pausa });
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
