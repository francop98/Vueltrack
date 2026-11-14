/* =========================================================
   Vueltrack — seguimiento en vivo de los fleteros
   Cada fletero elige compartir su ubicación con el equipo.
   Se publica con la app abierta, cada 2 minutos o al moverse
   más de 200 m, para cuidar la batería y el plan gratis.
   ========================================================= */
import { publicarUbicacion, dejarDeCompartir } from './datos.js';

const CLAVE = 'vueltrack_compartir';
const CADA_MS = 2 * 60 * 1000;
const METROS = 200;

let vigilancia = null;
let ultima = null;

export function estaCompartiendo() {
  try {
    return localStorage.getItem(CLAVE) === 'si';
  } catch (e) {
    return false;
  }
}

/* Solo tiene sentido en equipos con más de una persona */
export function puedeCompartir(ctx) {
  return ctx.fletero && ctx.equipo.modo === 'equipo' && (ctx.equipo.miembrosIds || []).length > 1;
}

function distanciaM(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
}

function empezar(ctx) {
  if (vigilancia != null || !navigator.geolocation) return;
  vigilancia = navigator.geolocation.watchPosition(
    (pos) => {
      const punto = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const ahora = Date.now();
      if (ultima && ahora - ultima.ts < CADA_MS && distanciaM(ultima, punto) < METROS) return;
      ultima = { ...punto, ts: ahora };
      publicarUbicacion(ctx.equipo.id, ctx.user.uid, { ...punto, nombre: ctx.yo.nombre || '', ts: ahora }).catch(() => {});
    },
    () => {},
    { enableHighAccuracy: false, maximumAge: 60000, timeout: 30000 }
  );
}

function parar() {
  if (vigilancia != null && navigator.geolocation) navigator.geolocation.clearWatch(vigilancia);
  vigilancia = null;
  ultima = null;
}

/* Se llama al abrir las pantallas de la calle (Hoy, Parada, Modo manejo) */
export function compartirSiCorresponde(ctx) {
  if (puedeCompartir(ctx) && estaCompartiendo()) empezar(ctx);
}

export async function cambiarCompartir(ctx, activar) {
  try {
    localStorage.setItem(CLAVE, activar ? 'si' : 'no');
  } catch (e) {
    /* sin almacenamiento */
  }
  if (activar) {
    empezar(ctx);
  } else {
    parar();
    await dejarDeCompartir(ctx.equipo.id, ctx.user.uid).catch(() => {});
  }
}

/* "hace 3 min" a partir de un ts en milisegundos */
export function haceCuanto(ts) {
  const min = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return `hace ${h} h`;
}

/* Ubicaciones de hoy y de menos de 3 horas */
export function ubicacionesRecientes(lista) {
  const limite = Date.now() - 3 * 60 * 60 * 1000;
  return lista.filter((u) => Number(u.ts) > limite && Number.isFinite(u.lat) && Number.isFinite(u.lng));
}
