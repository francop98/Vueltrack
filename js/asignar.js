/* =========================================================
   Vueltrack — a qué fletero le toca cada parada
   El organizador elige quiénes salen ese día (vuelta.activos).
   Cada parada nueva se sugiere al fletero cuya zona queda más
   cerca, cuidando que nadie quede muy cargado. Si hay alguien
   sin paradas y la nueva queda lejos de todos, va para él:
   así la vuelta se divide sola por radios.
   ========================================================= */
import { dividirPorZona } from './rutas.js';
import { paradaHecha } from './vuelta.js';
import { puedeLlevar } from './cargas.js';

/* Distancia libre (km) a partir de la cual conviene abrir una zona nueva */
const RADIO_ZONA_KM = 2.5;
/* Cuántos km "pesa" cada parada de más que tenga un fletero respecto del menos cargado */
const PESO_CARGA_KM = 0.6;

function km(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const conUbicacion = (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng);

/* Fleteros que salen ese día. Si no se eligió, salen todos menos quien organiza
   (el organizador que también reparte se suma a mano; si es el único, sale él). */
export function activosDelDia(vuelta, fleteros) {
  const elegidos = vuelta && Array.isArray(vuelta.activos) ? vuelta.activos : null;
  if (elegidos) {
    const lista = fleteros.filter((f) => elegidos.includes(f.uid));
    if (lista.length) return lista;
  }
  // Quien organiza solo cuenta si ya tiene paradas asignadas ese día
  const conParadas = new Set(((vuelta && vuelta.paradas) || []).map((p) => p.fleteroUid).filter(Boolean));
  const sinOrganizar = fleteros.filter((f) => !(f.roles || []).includes('organizador') || conParadas.has(f.uid));
  return sinOrganizar.length ? sinOrganizar : fleteros;
}

/* Sugiere el fletero para una parada según las que ya tiene cada uno */
export function sugerirFletero(parada, paradas, todos, vuelta = null) {
  if (!todos.length) return null;
  // Solo los que pueden llevar lo que pide la parada (si nadie puede, se avisa en pantalla)
  const aptos = todos.filter((f) => puedeLlevar(parada, f, vuelta));
  const activos = aptos.length ? aptos : todos;
  if (activos.length === 1 || !conUbicacion(parada)) return activos[0].uid;
  const zonas = activos.map((f) => {
    const suyas = paradas.filter((p) => p.id !== parada.id && p.fleteroUid === f.uid && !paradaHecha(p) && conUbicacion(p));
    const centro = suyas.length
      ? { lat: suyas.reduce((s, p) => s + p.lat, 0) / suyas.length, lng: suyas.reduce((s, p) => s + p.lng, 0) / suyas.length }
      : null;
    return { uid: f.uid, cantidad: suyas.length, centro };
  });
  const minimo = Math.min(...zonas.map((z) => z.cantidad));
  let mejor = null;
  zonas.forEach((z) => {
    const costo = z.centro ? km(parada, z.centro) + PESO_CARGA_KM * (z.cantidad - minimo) : RADIO_ZONA_KM;
    if (!mejor || costo < mejor.costo) mejor = { uid: z.uid, costo };
  });
  return mejor.uid;
}

/**
 * Asigna fletero a las paradas pendientes que no tienen uno de los que salen.
 * Devuelve la lista nueva y cuántas se asignaron.
 */
export function asignarPendientes(paradas, activos, vuelta = null) {
  if (!activos.length) return { paradas, asignadas: 0 };
  const porUid = new Map(activos.map((f) => [f.uid, f]));
  const lista = paradas.map((p) => ({ ...p }));
  let asignadas = 0;
  lista.forEach((p) => {
    if (paradaHecha(p)) return;
    const actual = p.fleteroUid && porUid.get(p.fleteroUid);
    // Se queda con quien la tiene, salvo que ese fletero no pueda llevarla
    if (actual && (puedeLlevar(p, actual, vuelta) || p.fleteroFijo)) return;
    p.fleteroUid = sugerirFletero(p, lista, activos, vuelta);
    asignadas++;
  });
  // La entrega de un retiro va con el mismo fletero que retira
  const porId = new Map(lista.map((p) => [p.id, p]));
  lista.forEach((p) => {
    if (p.tipo === 'retiro' && p.entregaId && porId.has(p.entregaId) && !paradaHecha(porId.get(p.entregaId))) {
      porId.get(p.entregaId).fleteroUid = p.fleteroUid;
    }
  });
  return { paradas: lista, asignadas };
}

/* Vuelve a dividir todas las pendientes por zonas, una por fletero */
export function redistribuirPorZona(paradas, activos, vuelta = null) {
  const lista = paradas.map((p) => ({ ...p }));
  const pendientes = lista.filter((p) => !paradaHecha(p) && conUbicacion(p));
  const zonas = dividirPorZona(pendientes, activos.length);
  pendientes.forEach((p, i) => {
    p.fleteroUid = (activos[zonas[i]] || activos[0]).uid;
  });
  lista.forEach((p) => {
    delete p.fleteroFijo;
  });
  return asignarPendientes(lista, activos, vuelta).paradas;
}

/* Paradas pendientes que quedaron con alguien que no las puede llevar */
export function incompatibles(paradas, activos, vuelta) {
  const porUid = new Map(activos.map((f) => [f.uid, f]));
  return paradas.filter((p) => !paradaHecha(p) && p.fleteroUid && porUid.has(p.fleteroUid) && !puedeLlevar(p, porUid.get(p.fleteroUid), vuelta));
}
