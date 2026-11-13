/* =========================================================
   Vueltrack — ayudas para leer una vuelta (por fletero)
   Estados de parada: pendiente | entregado | noEstaba
   ========================================================= */
import { idNuevo } from './ui.js';

/* Arma una parada a partir de un cliente habitual */
export function paradaDesdeCliente(c) {
  return {
    id: idNuevo(),
    clienteId: c.id,
    nombre: c.nombre,
    direccion: c.direccion,
    lat: c.lat,
    lng: c.lng,
    telefono: c.telefono || '',
    nota: c.nota || '',
    hasta: c.hasta || '',
    urgente: false,
    estado: 'pendiente',
    fleteroUid: null
  };
}

export function paradaHecha(p) {
  return p.estado === 'entregado' || p.estado === 'noEstaba';
}

/* Paradas de un fletero, en el orden de su vuelta */
export function paradasDe(vuelta, uid) {
  return (vuelta?.paradas || [])
    .filter((p) => p.fleteroUid === uid)
    .sort((a, b) => (a.orden || 999) - (b.orden || 999));
}

/* Grupos para el mapa y las tarjetas, uno por fletero con paradas */
export function gruposDeVuelta(vuelta, fleteros, { soloUid = null } = {}) {
  const lista = soloUid ? fleteros.filter((f) => f.uid === soloUid) : fleteros;
  return lista
    .map((f) => {
      const paradas = paradasDe(vuelta, f.uid);
      const proxima = paradas.find((p) => !paradaHecha(p));
      return {
        uid: f.uid,
        nombre: f.nombre,
        color: f.color,
        ruta: vuelta?.rutas?.[f.uid] || null,
        geometria: vuelta?.rutas?.[f.uid]?.geometria || '',
        paradas: paradas.map((p, i) => ({
          ...p,
          numero: i + 1,
          hecha: paradaHecha(p),
          actual: proxima ? p.id === proxima.id : false
        }))
      };
    })
    .filter((g) => g.paradas.length);
}

export function proximaParada(vuelta, uid) {
  return paradasDe(vuelta, uid).find((p) => !paradaHecha(p)) || null;
}

/* Paradas cargadas que todavía no tienen fletero (vuelta sin ordenar) */
export function paradasSinOrdenar(vuelta) {
  return (vuelta?.paradas || []).filter((p) => !p.fleteroUid);
}

export function resumen(grupos) {
  let paradas = 0;
  let distancia = 0;
  let duracion = 0;
  let fin = null;
  let hechas = 0;
  grupos.forEach((g) => {
    paradas += g.paradas.length;
    hechas += g.paradas.filter((p) => p.hecha).length;
    if (g.ruta) {
      distancia += g.ruta.distancia || 0;
      duracion = Math.max(duracion, g.ruta.duracion || 0);
      if (g.ruta.fin != null) fin = Math.max(fin ?? 0, g.ruta.fin);
    }
  });
  return { paradas, hechas, distancia, duracion, fin };
}
