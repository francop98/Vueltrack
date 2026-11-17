/* =========================================================
   GET /api/diagnostico
   Prueba, con un pedido mínimo en Bahía Blanca, cada servicio de
   OpenRouteService que usa la app y muestra qué responde cada uno.
   Sirve para saber por qué falla el orden óptimo (VROOM).
   No muestra la clave ni datos de nadie. Como máximo una prueba por minuto.
   ========================================================= */
import { pedirORS, responder } from './_comun.js';

let ultima = null;

const BASE = [-62.2663, -38.7183];
const A = [-62.2585, -38.7105];
const B = [-62.2801, -38.7262];
const C = [-62.2457, -38.7311];

const PRUEBAS = {
  vroom_minimo: {
    ruta: '/vroom/v0',
    cuerpo: { vehicles: [{ id: 1, profile: 'driving-car', start: BASE, end: BASE }], jobs: [{ id: 1, location: A }, { id: 2, location: B }] }
  },
  vroom_barra_final: {
    ruta: '/vroom/v0/',
    cuerpo: { vehicles: [{ id: 1, profile: 'driving-car', start: BASE, end: BASE }], jobs: [{ id: 1, location: A }, { id: 2, location: B }] }
  },
  vroom_con_trazado: {
    ruta: '/vroom/v0',
    cuerpo: {
      vehicles: [{ id: 1, profile: 'driving-car', start: BASE, end: BASE }],
      jobs: [{ id: 1, location: A }, { id: 2, location: B }],
      options: { g: true }
    }
  },
  vroom_completo: {
    ruta: '/vroom/v0',
    cuerpo: {
      vehicles: [
        {
          id: 1,
          profile: 'driving-car',
          start: BASE,
          end: BASE,
          time_window: [28800, 86399],
          capacity: [2, 100000],
          skills: [1, 2],
          breaks: [{ id: 1, time_windows: [[43200, 50400]], service: 1800 }]
        },
        { id: 2, profile: 'driving-car', start: BASE, end: BASE, time_window: [28800, 86399], capacity: [2, 100000], skills: [1] }
      ],
      jobs: [
        { id: 1, location: A, service: 300, amount: [1, 1], time_windows: [[28800, 36000]], priority: 100, skills: [2] },
        { id: 2, location: B, service: 300, amount: [1, 1] }
      ],
      shipments: [{ amount: [1, 1], pickup: { id: 3, location: C, service: 300 }, delivery: { id: 4, location: A, service: 300 } }],
      options: { g: true }
    }
  },
  trazado_directions: {
    ruta: '/openrouteservice/v2/directions/driving-car/json',
    cuerpo: { coordinates: [BASE, A, B, BASE], instructions: false }
  },
  matriz: {
    ruta: '/openrouteservice/v2/matrix/driving-car',
    cuerpo: { locations: [BASE, A, B, C], metrics: ['duration', 'distance'] }
  }
};

async function probar(nombre, { ruta, cuerpo }) {
  const t0 = Date.now();
  try {
    const datos = await pedirORS(ruta, { method: 'POST', body: cuerpo, tiempo: 9000 });
    const resumen =
      nombre.startsWith('vroom')
        ? `rutas: ${(datos.routes || []).length}, sin asignar: ${(datos.unassigned || []).length}`
        : nombre === 'matriz'
          ? `filas: ${(datos.durations || []).length}`
          : `rutas: ${(datos.routes || []).length}`;
    return { ok: true, ms: Date.now() - t0, resumen };
  } catch (e) {
    const d = e.detalle;
    let texto = e.message;
    if (d && typeof d === 'object') {
      const err = d.error;
      texto = typeof err === 'string' ? err : (err && (err.message || JSON.stringify(err))) || JSON.stringify(d);
    }
    return { ok: false, ms: Date.now() - t0, estado: e.estado || null, error: String(texto).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) };
  }
}

export default async function handler(req, res) {
  if (ultima && Date.now() - ultima.cuando < 60000) return responder(res, 200, { ...ultima.resultado, repetido: true });
  const resultado = {
    cuando: new Date().toISOString(),
    clave_ors_cargada: !!process.env.ORS_API_KEY,
    clave_firebase_cargada: !!process.env.FIREBASE_API_KEY
  };
  if (!process.env.ORS_API_KEY) return responder(res, 200, resultado);
  const nombres = Object.keys(PRUEBAS);
  const hechos = await Promise.all(nombres.map((n) => probar(n, PRUEBAS[n])));
  nombres.forEach((n, i) => {
    resultado[n] = hechos[i];
  });
  ultima = { cuando: Date.now(), resultado };
  return responder(res, 200, resultado);
}
