/* =========================================================
   Vueltrack — ayudas para leer una vuelta (por fletero)
   Estados de parada: pendiente | entregado | noEstaba | rechazado | reprogramado
   Tipos de parada:   entrega (por defecto) | retiro (lleva entregaId)
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
    desde: c.desde || '',
    hasta: c.hasta || '',
    bultos: Number(c.bultos) || 1,
    tipo: 'entrega',
    urgente: false,
    estado: 'pendiente',
    fleteroUid: null
  };
}

export const ESTADOS = {
  pendiente: { texto: 'Pendiente', corto: 'pendiente' },
  entregado: { texto: 'Entregado', corto: 'entregado' },
  noEstaba: { texto: 'No estaba', corto: 'no estaba' },
  rechazado: { texto: 'Rechazado', corto: 'rechazado' },
  reprogramado: { texto: 'Reprogramado', corto: 'reprogramado' }
};

export function paradaHecha(p) {
  return ['entregado', 'noEstaba', 'rechazado', 'reprogramado'].includes(p.estado);
}

/* Entregada con éxito (para retiros también cuenta "entregado") */
export function paradaExitosa(p) {
  return p.estado === 'entregado';
}

/* Texto del horario en que recibe: "9:00 a 13:00", "hasta 13:00", "desde 9:00" */
export function textoHorario(p) {
  if (p.desde && p.hasta) return `recibe ${p.desde} a ${p.hasta}`;
  if (p.hasta) return `cierra ${p.hasta}`;
  if (p.desde) return `recibe desde ${p.desde}`;
  return '';
}

/* Parada nueva vacía (dirección suelta) */
export function paradaNueva(datos) {
  return {
    id: idNuevo(),
    clienteId: null,
    nombre: '',
    direccion: '',
    lat: null,
    lng: null,
    telefono: '',
    nota: '',
    desde: '',
    hasta: '',
    bultos: 1,
    tipo: 'entrega',
    urgente: false,
    estado: 'pendiente',
    fleteroUid: null,
    ...datos
  };
}

/* Copia de una parada para otro día: nueva, pendiente y sin fletero */
export function copiaParaOtroDia(p, extra = {}) {
  const limpia = { ...p };
  ['orden', 'llegada', 'horaEstado', 'marcadoPor', 'motivo', 'sinAsignar', 'token', 'comprobante', 'reprogramadaA'].forEach((k) => delete limpia[k]);
  return { ...limpia, id: idNuevo(), estado: 'pendiente', fleteroUid: null, ...extra };
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

/* ---------- Gastos del vehículo ---------- */

export const COMBUSTIBLES = {
  nafta: { nombre: 'Nafta', unidad: 'litro', rinde: 'km por litro' },
  gasoil: { nombre: 'Gasoil', unidad: 'litro', rinde: 'km por litro' },
  gnc: { nombre: 'GNC', unidad: 'm³', rinde: 'km por m³' },
  electrico: { nombre: 'Eléctrico', unidad: 'kWh', rinde: 'km por kWh' }
};

/* Gasto estimado de una ruta según los datos del vehículo del fletero */
export function costoDeRuta(distanciaMetros, gasto) {
  if (!gasto || !distanciaMetros) return null;
  const rinde = Number(gasto.rinde);
  const precio = Number(gasto.precio);
  if (!(rinde > 0) || !(precio >= 0)) return null;
  const km = distanciaMetros / 1000;
  const combustible = (km / rinde) * precio;
  const extra = km * (Number(gasto.extraKm) || 0);
  if (!Number.isFinite(combustible)) return null;
  return { km, unidades: km / rinde, combustible, extra, total: combustible + extra };
}
