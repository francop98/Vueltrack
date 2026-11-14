/* =========================================================
   Vueltrack — vencimientos y service del vehículo
   Se guardan dentro de gasto (Mi vehículo):
     gasto.vencimientos  [{id, nombre, fecha}]
     gasto.service       {cadaKm, ultimoKm, tableroKm, tableroFecha}
   Los km desde la última lectura del tablero se estiman con
   las vueltas hechas en la app.
   ========================================================= */
import { vueltasEntre } from './datos.js';
import { fechaISO, fechaDesdeISO, sumarDias } from './ui.js';

export const TIPOS_VENCIMIENTO = ['Licencia de conducir', 'Matafuego', 'Patente', 'Seguro', 'VTV', 'Otro'];
const DIAS_AVISO = 15;
const KM_AVISO = 500;

export function diasHasta(iso) {
  const hoy = fechaDesdeISO(fechaISO());
  return Math.round((fechaDesdeISO(iso) - hoy) / 86400000);
}

/* Km que hizo el fletero con la app desde una fecha (sin contar hoy si todavía no terminó) */
export async function kmRecorridosDesde(equipoId, uid, desdeISO) {
  if (!desdeISO) return 0;
  const hasta = fechaISO();
  if (desdeISO > hasta) return 0;
  const vueltas = await vueltasEntre(equipoId, sumarDias(desdeISO, 1), hasta).catch(() => []);
  return vueltas.reduce((total, v) => total + ((v.rutas && v.rutas[uid] && v.rutas[uid].distancia) || 0) / 1000, 0);
}

export function tieneService(gasto) {
  const s = gasto && gasto.service;
  return !!(s && Number(s.cadaKm) > 0 && Number.isFinite(Number(s.ultimoKm)) && Number(s.tableroKm) > 0);
}

/* Km estimados del tablero y cuánto falta para el service */
export function estadoService(gasto, kmDesdeTablero) {
  if (!tieneService(gasto)) return null;
  const s = gasto.service;
  const tablero = Number(s.tableroKm) + (Number(kmDesdeTablero) || 0);
  const proximo = Number(s.ultimoKm) + Number(s.cadaKm);
  return { tablero: Math.round(tablero), proximo, faltan: Math.round(proximo - tablero) };
}

/* Avisos para mostrar en Inicio y en Mi vehículo */
export function alertasDelVehiculo(gasto, kmDesdeTablero = 0) {
  const alertas = [];
  ((gasto && gasto.vencimientos) || []).forEach((v) => {
    if (!v.fecha) return;
    const dias = diasHasta(v.fecha);
    if (dias < 0) alertas.push({ nivel: 'vencido', texto: `${v.nombre} vencido hace ${-dias} ${dias === -1 ? 'día' : 'días'}` });
    else if (dias === 0) alertas.push({ nivel: 'vencido', texto: `${v.nombre} vence hoy` });
    else if (dias <= DIAS_AVISO) alertas.push({ nivel: 'pronto', texto: `${v.nombre} vence en ${dias} ${dias === 1 ? 'día' : 'días'}` });
  });
  const s = estadoService(gasto, kmDesdeTablero);
  if (s) {
    if (s.faltan <= 0) alertas.push({ nivel: 'vencido', texto: `Service atrasado: te pasaste por unos ${Math.abs(s.faltan).toLocaleString('es-AR')} km` });
    else if (s.faltan <= KM_AVISO) alertas.push({ nivel: 'pronto', texto: `Service en unos ${s.faltan.toLocaleString('es-AR')} km` });
  }
  return alertas;
}
