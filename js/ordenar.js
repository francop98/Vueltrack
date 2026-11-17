/* =========================================================
   Vueltrack — ordenar la vuelta y guardarla
   Las paradas ya hechas quedan primero; solo se reordenan
   las pendientes.
   Órdenes posibles:
     optimo  recorrido más conveniente (menos tiempo)
     cerca   de la más cercana a la más lejana del punto de salida
     lejos   de la más lejana a la más cercana
     cierre  por horario de cierre (las que no tienen horario van al final)
   ========================================================= */
import { optimizar, aplicarResultado, dividirPorZona } from './rutas.js';
import { reemplazarVuelta, guardarVuelta } from './datos.js';
import { paradaHecha, paradasDe } from './vuelta.js';
import { fechaISO, segundosDeHora, horaAhora } from './ui.js';

export const ORDENES = [
  { id: 'optimo', titulo: 'Más conveniente', texto: 'El recorrido más corto en tiempo' },
  { id: 'cerca', titulo: 'De la más cercana a la más lejana', texto: 'Respecto del punto de salida' },
  { id: 'lejos', titulo: 'De la más lejana a la más cercana', texto: 'Respecto del punto de salida' },
  { id: 'cierre', titulo: 'Por horario de cierre', texto: 'Primero las que cierran antes; las demás al final' }
];

export function nombreOrden(id) {
  if (id === 'manual') return 'A mano';
  const o = ORDENES.find((x) => x.id === id);
  return o ? o.titulo : ORDENES[0].titulo;
}

/* Hora de salida: la que se eligió para esa vuelta; si no, hoy = ahora, otro día = la última usada */
export function horaDeSalida(vuelta, equipo, fecha) {
  if (vuelta && vuelta.salida) return vuelta.salida;
  if (fecha === fechaISO()) return horaAhora();
  return (equipo.ajustes && equipo.ajustes.salida) || '08:00';
}

function pendientesParaEnviar(pendientes, modo) {
  const ids = new Set(pendientes.map((p) => p.id));
  return pendientes.map((p) => ({
    id: p.id,
    lat: p.lat,
    lng: p.lng,
    urgente: !!p.urgente,
    desde: p.desde ? segundosDeHora(p.desde) : null,
    hasta: p.hasta ? segundosDeHora(p.hasta) : null,
    tipo: p.tipo === 'retiro' ? 'retiro' : 'entrega',
    entregaId: p.tipo === 'retiro' && ids.has(p.entregaId) ? p.entregaId : null,
    bultos: Number(p.bultos) >= 0 ? Number(p.bultos) : 1,
    cargas: Array.isArray(p.cargas) ? p.cargas.slice(0, 10).map(String) : [],
    vehiculo: modo === 'grupos' ? p.fleteroUid : null
  }));
}

/* Punto de salida propio de cada fletero (si cargó uno distinto al del equipo) */
export function basesDe(equipo, vehiculos) {
  const bases = {};
  vehiculos.forEach((uid) => {
    const b = equipo.miembros && equipo.miembros[uid] && equipo.miembros[uid].base;
    if (b && Number.isFinite(b.lat) && Number.isFinite(b.lng)) bases[uid] = { lat: b.lat, lng: b.lng };
  });
  return bases;
}

/* Punto de salida de un fletero: el suyo o el del equipo */
export function baseDeFletero(equipo, uid) {
  const b = equipo.miembros && equipo.miembros[uid] && equipo.miembros[uid].base;
  return b && Number.isFinite(b.lat) ? b : equipo.base;
}

/* Capacidad (bultos) de cada fletero, si la cargó en Mi vehículo */
function capacidadesDe(equipo, vehiculos) {
  const caps = {};
  vehiculos.forEach((uid) => {
    const g = equipo.miembros && equipo.miembros[uid] && equipo.miembros[uid].gasto;
    if (g && Number(g.capacidad) > 0) caps[uid] = Number(g.capacidad);
  });
  return caps;
}

/* Pausa de la jornada (almuerzo): {desde, hasta, minutos} en segundos */
function pausaDe(ajustes) {
  const p = ajustes.pausa;
  if (!p || !p.desde || !(Number(p.minutos) > 0)) return null;
  return { desde: segundosDeHora(p.desde), hasta: segundosDeHora(p.hasta || p.desde), minutos: Number(p.minutos) };
}

/* La entrega de un retiro queda con el mismo fletero que retira */
export function unirRetiros(paradas) {
  const porId = new Map(paradas.map((p) => [p.id, p]));
  paradas.forEach((p) => {
    if (p.tipo === 'retiro' && p.entregaId && porId.has(p.entregaId) && p.fleteroUid) {
      porId.get(p.entregaId).fleteroUid = p.fleteroUid;
    }
  });
  return paradas;
}

/**
 * @param {object} op
 * @param {object} op.equipo
 * @param {string} op.fecha
 * @param {Array}  op.paradas    todas las paradas de la vuelta
 * @param {Array}  op.vehiculos  uids de los fleteros que trabajan
 * @param {string} op.modo       "grupos" (cada parada ya tiene fleteroUid) o "parejo"
 * @param {string} op.salida     "HH:MM"
 * @param {string} op.orden      optimo | cerca | lejos | cierre
 * @param {object} op.desde      {lat, lng} opcional: arrancar desde acá
 */
export async function calcularVuelta({ equipo, fecha, paradas, vehiculos, modo: modoPedido, salida, orden = 'optimo', desde = null, noLleva = {} }) {
  let modo = modoPedido;
  // Hace falta el punto de salida del equipo o el de cada fletero que sale
  if ((!equipo.base || equipo.base.lat == null) && vehiculos.some((uid) => !baseDeFletero(equipo, uid))) throw new Error('sin-base');

  const hechas = paradas.filter(paradaHecha).map((p) => ({ ...p }));
  const pendientes = paradas.filter((p) => !paradaHecha(p)).map((p) => ({ ...p }));
  const horaSalida = salida || horaDeSalida(null, equipo, fecha);
  const ajustes = equipo.ajustes || {};

  let rutas = {};
  let ordenadas = [];
  let sinAsignar = 0;
  let llegaTarde = 0;

  // El plan gratis resuelve "parejo" hasta 3 fleteros y 48 paradas; si se pasa, se reparte por zonas parejas
  if (modo === 'parejo' && (vehiculos.length > 3 || pendientes.length > 48)) {
    const zonas = dividirPorZona(pendientes, vehiculos.length);
    pendientes.forEach((p, i) => {
      p.fleteroUid = vehiculos[zonas[i]];
    });
    modo = 'grupos';
  }
  if (modo === 'grupos') unirRetiros(pendientes);

  if (pendientes.length) {
    const resultado = await optimizar({
      base: equipo.base && equipo.base.lat != null ? { lat: equipo.base.lat, lng: equipo.base.lng } : baseDeFletero(equipo, vehiculos[0]),
      desde,
      volver: ajustes.volver !== false,
      demora: Number(ajustes.demora ?? 5),
      salida: segundosDeHora(horaSalida),
      vehiculos,
      modo,
      orden,
      paradas: pendientesParaEnviar(pendientes, modo),
      capacidades: capacidadesDe(equipo, vehiculos),
      bases: basesDe(equipo, vehiculos),
      noLleva,
      pausa: pausaDe(ajustes)
    });
    const aplicado = aplicarResultado(pendientes, resultado, { salida: segundosDeHora(horaSalida) });
    rutas = aplicado.rutas;
    ordenadas = aplicado.paradas;
    sinAsignar = (resultado.sinAsignar || []).length;
    llegaTarde = (resultado.llegaTarde || []).length;
  }

  // Numeración: primero lo ya hecho de cada fletero, después lo nuevo
  const hechasPorFletero = {};
  hechas
    .sort((a, b) => (a.orden || 0) - (b.orden || 0))
    .forEach((p) => {
      hechasPorFletero[p.fleteroUid] = (hechasPorFletero[p.fleteroUid] || 0) + 1;
      p.orden = hechasPorFletero[p.fleteroUid];
    });
  ordenadas.forEach((p) => {
    if (p.orden) p.orden += hechasPorFletero[p.fleteroUid] || 0;
  });

  return { paradas: [...hechas, ...ordenadas], rutas, sinAsignar, llegaTarde, salida: horaSalida, orden };
}

export async function guardarCalculo(equipo, fecha, calculo, vueltaActual = null) {
  // Se conserva lo que no es del recorrido: quiénes salen, qué lleva cada uno, pausa y marcas
  const conservar = {};
  ['activos', 'noLleva', 'pausa', 'marcas'].forEach((k) => {
    if (vueltaActual && vueltaActual[k] != null) conservar[k] = vueltaActual[k];
  });
  await reemplazarVuelta(equipo.id, fecha, {
    ...conservar,
    paradas: calculo.paradas,
    rutas: calculo.rutas,
    salida: calculo.salida,
    orden: calculo.orden,
    ordenada: true
  });
}

export async function ordenarYGuardar(op) {
  const calculo = await calcularVuelta(op);
  await guardarCalculo(op.equipo, op.fecha, calculo);
  return calculo;
}

/**
 * Reordena solo la vuelta de un fletero (desde la pantalla Hoy),
 * opcionalmente arrancando desde donde está ahora.
 */
export async function reordenarFletero({ equipo, fecha, vuelta, uid, orden, desde, ordenManual = null }) {
  let suyas = paradasDe(vuelta, uid);
  // Orden a mano: las paradas van en la secuencia que se armó arrastrando
  if (ordenManual) {
    const posicion = new Map(ordenManual.map((id, i) => [id, i]));
    suyas = [...suyas].sort((a, b) => (posicion.get(a.id) ?? 999) - (posicion.get(b.id) ?? 999));
  }
  const pendientes = suyas.filter((p) => !paradaHecha(p));
  if (!pendientes.length) return { sinAsignar: 0, llegaTarde: 0 };
  const salida = fecha === fechaISO() ? horaAhora(1) : horaDeSalida(vuelta, equipo, fecha);
  const calculo = await calcularVuelta({
    equipo,
    fecha,
    paradas: suyas,
    vehiculos: [uid],
    modo: 'grupos',
    salida,
    orden,
    desde
  });
  const nuevas = new Map(calculo.paradas.map((p) => [p.id, p]));
  const paradas = (vuelta.paradas || []).map((p) => nuevas.get(p.id) || p);
  await guardarVuelta(equipo.id, fecha, {
    paradas,
    rutas: { ...(vuelta.rutas || {}), [uid]: calculo.rutas[uid] || null },
    orden
  });
  return calculo;
}

/* Mensaje claro según el error del servidor */
export function mensajeError(e) {
  const textos = {
    'sin-base': 'Primero elegí desde dónde salís.',
    'sin-lugar': 'Algunas paradas no entran en el horario o en la capacidad del vehículo.',
    'demasiadas-paradas': 'Un fletero no puede tener más de 48 paradas en una vuelta. Repartilas entre más fleteros o en dos días.',
    'limite-diario': 'Se alcanzó el límite gratuito de cálculos de hoy. Mañana vuelve a funcionar.',
    'sin-sesion': 'Se cerró tu sesión. Volvé a ingresar.'
  };
  return textos[e && e.message] || 'No se pudo ordenar. Revisá la conexión y probá de nuevo.';
}
