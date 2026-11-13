/* =========================================================
   Vueltrack — ordenar la vuelta y guardarla
   Las paradas ya hechas quedan primero; solo se reordenan
   las pendientes.
   ========================================================= */
import { optimizar, aplicarResultado, dividirPorZona } from './rutas.js';
import { reemplazarVuelta } from './datos.js';
import { paradaHecha } from './vuelta.js';
import { fechaISO, segundosAhora, segundosDeHora } from './ui.js';

export function salidaEnSegundos(equipo, fecha) {
  const pactada = segundosDeHora(equipo.ajustes?.salida || '08:00');
  if (fecha === fechaISO()) return Math.max(pactada, segundosAhora());
  return pactada;
}

/**
 * @param {object} op
 * @param {object} op.equipo
 * @param {string} op.fecha
 * @param {Array}  op.paradas    todas las paradas de la vuelta
 * @param {Array}  op.vehiculos  uids de los fleteros que trabajan
 * @param {string} op.modo       "grupos" (cada parada ya tiene fleteroUid) o "parejo"
 */
export async function calcularVuelta({ equipo, fecha, paradas, vehiculos, modo: modoPedido }) {
  let modo = modoPedido;
  if (!equipo.base || equipo.base.lat == null) throw new Error('sin-base');

  const hechas = paradas.filter(paradaHecha).map((p) => ({ ...p }));
  const pendientes = paradas.filter((p) => !paradaHecha(p)).map((p) => ({ ...p }));
  const salida = salidaEnSegundos(equipo, fecha);
  const ajustes = equipo.ajustes || {};

  let rutas = {};
  let ordenadas = [];
  let sinAsignar = 0;

  // El plan gratis resuelve "parejo" hasta 3 fleteros y 48 paradas; si se pasa, se reparte por zonas parejas
  if (modo === 'parejo' && (vehiculos.length > 3 || pendientes.length > 48)) {
    const zonas = dividirPorZona(pendientes, vehiculos.length);
    pendientes.forEach((p, i) => {
      p.fleteroUid = vehiculos[zonas[i]];
    });
    modo = 'grupos';
  }

  if (pendientes.length) {
    const resultado = await optimizar({
      base: { lat: equipo.base.lat, lng: equipo.base.lng },
      volver: ajustes.volver !== false,
      demora: Number(ajustes.demora ?? 5),
      salida,
      vehiculos,
      modo,
      paradas: pendientes.map((p) => ({
        id: p.id,
        lat: p.lat,
        lng: p.lng,
        urgente: !!p.urgente,
        hasta: p.hasta ? segundosDeHora(p.hasta) : null,
        vehiculo: modo === 'grupos' ? p.fleteroUid : null
      }))
    });
    const aplicado = aplicarResultado(pendientes, resultado, { salida });
    rutas = aplicado.rutas;
    ordenadas = aplicado.paradas;
    sinAsignar = (resultado.sinAsignar || []).length;
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

  return { paradas: [...hechas, ...ordenadas], rutas, sinAsignar };
}

export async function guardarCalculo(equipo, fecha, calculo) {
  await reemplazarVuelta(equipo.id, fecha, {
    paradas: calculo.paradas,
    rutas: calculo.rutas,
    ordenada: true
  });
}

export async function ordenarYGuardar(op) {
  const calculo = await calcularVuelta(op);
  await guardarCalculo(op.equipo, op.fecha, calculo);
  return calculo;
}

/* Mensaje claro según el error del servidor */
export function mensajeError(e) {
  const textos = {
    'sin-base': 'Primero elegí desde dónde salís.',
    'demasiadas-paradas': 'Un fletero no puede tener más de 48 paradas en una vuelta. Repartilas entre más fleteros o en dos días.',
    'limite-diario': 'Se alcanzó el límite gratuito de cálculos de hoy. Mañana vuelve a funcionar.',
    'sin-sesion': 'Se cerró tu sesión. Volvé a ingresar.'
  };
  return textos[e && e.message] || 'No se pudo ordenar. Revisá la conexión y probá de nuevo.';
}
