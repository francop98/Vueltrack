/* =========================================================
   Vueltrack — direcciones frecuentes que todavía no son clientes
   Si una dirección suelta aparece en 3 días distintos del último
   mes, se sugiere agregarla a clientes con un toque.
   ========================================================= */
import { vueltasEntre, guardarCliente } from './datos.js';
import { fechaISO, sumarDias, sinTildes } from './ui.js';

const DIAS_MINIMOS = 3;
const CLAVE_DESCARTADAS = 'vueltrack_frecuentes_no';

const clave = (direccion) => sinTildes(direccion).replace(/[^a-z0-9]/g, '');

function cerca(a, b) {
  return Math.abs(a.lat - b.lat) < 0.0004 && Math.abs(a.lng - b.lng) < 0.0004;
}

function descartadas() {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLAVE_DESCARTADAS) || '[]'));
  } catch (e) {
    return new Set();
  }
}

export function descartarFrecuente(c) {
  const lista = descartadas();
  lista.add(c);
  try {
    localStorage.setItem(CLAVE_DESCARTADAS, JSON.stringify([...lista].slice(-200)));
  } catch (e) {
    /* sin almacenamiento */
  }
}

/* Devuelve [{clave, nombre, direccion, lat, lng, telefono, nota, veces}] */
export async function direccionesFrecuentes(equipoId, clientes) {
  const hoy = fechaISO();
  const vueltas = await vueltasEntre(equipoId, sumarDias(hoy, -30), hoy).catch(() => []);
  const grupos = new Map();
  vueltas.forEach((v) => {
    (v.paradas || []).forEach((p) => {
      if (p.clienteId || !p.direccion || !Number.isFinite(p.lat)) return;
      const k = clave(p.direccion);
      if (!k) return;
      const g = grupos.get(k) || { clave: k, dias: new Set(), ultima: null };
      g.dias.add(v.fecha);
      if (!g.ultima || v.fecha >= g.ultima.fecha) g.ultima = { ...p, fecha: v.fecha };
      grupos.set(k, g);
    });
  });
  const no = descartadas();
  return [...grupos.values()]
    .filter((g) => g.dias.size >= DIAS_MINIMOS && !no.has(g.clave))
    .filter((g) => !clientes.some((c) => clave(c.direccion) === g.clave || (Number.isFinite(c.lat) && cerca(c, g.ultima))))
    .sort((a, b) => b.dias.size - a.dias.size)
    .slice(0, 3)
    .map((g) => ({
      clave: g.clave,
      nombre: String(g.ultima.nombre || g.ultima.direccion).toUpperCase(),
      direccion: g.ultima.direccion,
      lat: g.ultima.lat,
      lng: g.ultima.lng,
      telefono: g.ultima.telefono || '',
      nota: g.ultima.nota || '',
      veces: g.dias.size
    }));
}

/* Lo agrega a clientes con lo que ya se sabe; el resto se completa en Clientes */
export async function agregarFrecuente(equipoId, f) {
  return guardarCliente(equipoId, {
    nombre: f.nombre,
    direccion: f.direccion,
    lat: f.lat,
    lng: f.lng,
    telefono: f.telefono,
    nota: f.nota,
    dias: [],
    desde: '',
    hasta: ''
  });
}
