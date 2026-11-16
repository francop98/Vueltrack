/* =========================================================
   Vueltrack — datos en Firestore
   usuarios/{uid}
   equipos/{equipoId}                 (nombre, código, modo, ajustes, miembros)
   equipos/{equipoId}/clientes/{id}   (clientes habituales)
   equipos/{equipoId}/vueltas/{fecha} (paradas del día y rutas por fletero)
   equipos/{equipoId}/ubicaciones/{uid}        (seguimiento en vivo)
   equipos/{equipoId}/comprobantes/{fecha_id}  (foto y firma de la entrega)
   codigos/{codigo}                   (para sumarse a un equipo)
   seguimiento/{token}                (lo que ve el cliente con su link)
   ========================================================= */
import { db } from './firebase.js';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  onSnapshot,
  query,
  where,
  getDocs,
  runTransaction,
  writeBatch,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  deleteField
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { COLORES_FLETERO, idNuevo } from './ui.js';

export const AJUSTES_INICIALES = { demora: 5, volver: true, salida: '08:00' };

/* ---------- Usuarios ---------- */

export async function obtenerUsuario(uid) {
  const snap = await getDoc(doc(db, 'usuarios', uid));
  return snap.exists() ? { id: uid, ...snap.data() } : null;
}

export async function guardarUsuario(uid, datos) {
  await setDoc(doc(db, 'usuarios', uid), { ...datos, actualizado: serverTimestamp() }, { merge: true });
}

/* ---------- Equipos ---------- */

function codigoAlAzar() {
  return 'VT-' + String(Math.floor(1000 + Math.random() * 9000));
}

async function codigoLibre() {
  for (let i = 0; i < 8; i++) {
    const codigo = codigoAlAzar();
    const snap = await getDoc(doc(db, 'codigos', codigo));
    if (!snap.exists()) return codigo;
  }
  return 'VT-' + idNuevo().slice(-6).toUpperCase();
}

export async function crearEquipo({ uid, nombre, nombreEquipo, modo, base, zona = null, ajustes = {}, telefono = '', vehiculo = '', gasto = null, reparte = true }) {
  const equipoRef = doc(collection(db, 'equipos'));
  const codigo = await codigoLibre();
  const lote = writeBatch(db);
  lote.set(equipoRef, {
    nombre: nombreEquipo || 'Mi vuelta',
    codigo,
    modo,
    creadoPor: uid,
    base: base || null,
    zona: zona || null,
    ajustes: { ...AJUSTES_INICIALES, ...ajustes },
    miembros: {
      [uid]: { nombre, telefono, roles: reparte ? ['organizador', 'fletero'] : ['organizador'], vehiculo: reparte ? vehiculo : '', gasto: reparte ? gasto : null, color: COLORES_FLETERO[0] }
    },
    miembrosIds: [uid],
    creado: serverTimestamp()
  });
  lote.set(doc(db, 'codigos', codigo), { equipoId: equipoRef.id });
  lote.set(doc(db, 'usuarios', uid), { equipoId: equipoRef.id, actualizado: serverTimestamp() }, { merge: true });
  await lote.commit();
  return equipoRef.id;
}

export function normalizarCodigo(codigo) {
  const limpio = String(codigo || '').trim().toUpperCase().replace(/\s/g, '');
  return limpio.startsWith('VT-') ? limpio : 'VT-' + limpio.replace(/^VT/, '');
}

/* Devuelve true si el código de equipo existe */
export async function codigoValido(codigo) {
  const snap = await getDoc(doc(db, 'codigos', normalizarCodigo(codigo)));
  return snap.exists();
}

export async function unirseConCodigo({ uid, nombre, codigo, telefono = '', vehiculo = '', gasto = null }) {
  const snap = await getDoc(doc(db, 'codigos', normalizarCodigo(codigo)));
  if (!snap.exists()) throw new Error('codigo-invalido');
  const equipoId = snap.data().equipoId;
  const equipoRef = doc(db, 'equipos', equipoId);
  await updateDoc(equipoRef, {
    [`miembros.${uid}`]: { nombre, telefono, roles: ['fletero'], vehiculo, gasto, color: '' },
    miembrosIds: arrayUnion(uid)
  });
  await guardarUsuario(uid, { equipoId });
  return equipoId;
}

export function escucharEquipo(equipoId, alCambiar) {
  return onSnapshot(doc(db, 'equipos', equipoId), (snap) => {
    alCambiar(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export async function obtenerEquipo(equipoId) {
  const snap = await getDoc(doc(db, 'equipos', equipoId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function actualizarEquipo(equipoId, cambios) {
  await updateDoc(doc(db, 'equipos', equipoId), cambios);
}

export async function actualizarMiembro(equipoId, uid, cambios) {
  const datos = {};
  Object.entries(cambios).forEach(([k, v]) => {
    datos[`miembros.${uid}.${k}`] = v;
  });
  await updateDoc(doc(db, 'equipos', equipoId), datos);
}

export async function quitarMiembro(equipoId, uid) {
  await updateDoc(doc(db, 'equipos', equipoId), {
    [`miembros.${uid}`]: deleteField(),
    miembrosIds: arrayRemove(uid)
  });
}

export async function salirDelEquipo(equipoId, uid) {
  await quitarMiembro(equipoId, uid);
  await guardarUsuario(uid, { equipoId: null });
}

/* Colores fijos por fletero (si no tiene, se asigna por orden) */
export function fleterosDelEquipo(equipo) {
  const lista = Object.entries(equipo?.miembros || {})
    .filter(([, m]) => (m.roles || []).includes('fletero'))
    .map(([uid, m]) => ({ uid, ...m }))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es', { sensitivity: 'base' }));
  const usados = new Set(lista.map((f) => f.color).filter(Boolean));
  let i = 0;
  lista.forEach((f) => {
    if (!f.color) {
      while (usados.has(COLORES_FLETERO[i % COLORES_FLETERO.length]) && i < COLORES_FLETERO.length) i++;
      f.color = COLORES_FLETERO[i % COLORES_FLETERO.length];
      usados.add(f.color);
      i++;
    }
  });
  return lista;
}

/* ---------- Clientes ---------- */

export function escucharClientes(equipoId, alCambiar) {
  return onSnapshot(collection(db, 'equipos', equipoId, 'clientes'), (snap) => {
    alCambiar(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function guardarCliente(equipoId, cliente) {
  const { id, ...datos } = cliente;
  const ref = id ? doc(db, 'equipos', equipoId, 'clientes', id) : doc(collection(db, 'equipos', equipoId, 'clientes'));
  await setDoc(ref, { ...datos, actualizado: serverTimestamp() }, { merge: true });
  return ref.id;
}

export async function borrarCliente(equipoId, clienteId) {
  await deleteDoc(doc(db, 'equipos', equipoId, 'clientes', clienteId));
}

export async function corregirUbicacionCliente(equipoId, clienteId, lat, lng) {
  await updateDoc(doc(db, 'equipos', equipoId, 'clientes', clienteId), {
    lat,
    lng,
    ubicacionVerificada: true
  });
}

/* ---------- Vueltas ---------- */

export function escucharVuelta(equipoId, fecha, alCambiar) {
  return onSnapshot(doc(db, 'equipos', equipoId, 'vueltas', fecha), (snap) => {
    alCambiar(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export async function guardarVuelta(equipoId, fecha, datos) {
  await setDoc(
    doc(db, 'equipos', equipoId, 'vueltas', fecha),
    { fecha, ...datos, actualizado: serverTimestamp() },
    { merge: true }
  );
}

/* Reemplaza la vuelta completa (al ordenar, para no dejar rutas viejas) */
export async function reemplazarVuelta(equipoId, fecha, datos) {
  await setDoc(doc(db, 'equipos', equipoId, 'vueltas', fecha), { fecha, ...datos, actualizado: serverTimestamp() });
}

/* Cambia una parada sin pisar lo que otro fletero marcó al mismo tiempo */
export async function cambiarParada(equipoId, fecha, paradaId, cambiar) {
  const ref = doc(db, 'equipos', equipoId, 'vueltas', fecha);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('sin-vuelta');
    const paradas = (snap.data().paradas || []).map((p) => ({ ...p }));
    const resultado = cambiar(paradas, paradas.findIndex((p) => p.id === paradaId)) || paradas;
    tx.update(ref, { paradas: resultado, actualizado: serverTimestamp() });
    return resultado;
  });
}

export async function obtenerVuelta(equipoId, fecha) {
  const snap = await getDoc(doc(db, 'equipos', equipoId, 'vueltas', fecha));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/* Suma paradas a la vuelta de otro día (la crea si no existe). Se usa al reprogramar. */
export async function agregarParadasADia(equipoId, fecha, nuevas) {
  const ref = doc(db, 'equipos', equipoId, 'vueltas', fecha);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) {
      tx.update(ref, { paradas: [...(snap.data().paradas || []), ...nuevas], ordenada: false, actualizado: serverTimestamp() });
    } else {
      tx.set(ref, { fecha, paradas: nuevas, ordenada: false, actualizado: serverTimestamp() });
    }
  });
}

/* Vueltas entre dos fechas (YYYY-MM-DD), para el historial */
export async function vueltasEntre(equipoId, desde, hasta) {
  const q = query(collection(db, 'equipos', equipoId, 'vueltas'), where('fecha', '>=', desde), where('fecha', '<=', hasta));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/* ---------- Seguimiento para el cliente (link público) ---------- */

export async function guardarSeguimiento(token, datos) {
  await setDoc(doc(db, 'seguimiento', token), { ...datos, actualizado: serverTimestamp() }, { merge: true });
}

export function escucharSeguimiento(token, alCambiar, alFallar) {
  return onSnapshot(
    doc(db, 'seguimiento', token),
    (snap) => alCambiar(snap.exists() ? snap.data() : null),
    alFallar
  );
}

/* ---------- Comprobantes de entrega ---------- */

export async function guardarComprobante(equipoId, fecha, paradaId, datos) {
  await setDoc(doc(db, 'equipos', equipoId, 'comprobantes', `${fecha}_${paradaId}`), { ...datos, fecha, paradaId, actualizado: serverTimestamp() }, { merge: true });
}

export async function obtenerComprobante(equipoId, fecha, paradaId) {
  const snap = await getDoc(doc(db, 'equipos', equipoId, 'comprobantes', `${fecha}_${paradaId}`));
  return snap.exists() ? snap.data() : null;
}

/* ---------- Ubicación en vivo de los fleteros ---------- */

export async function publicarUbicacion(equipoId, uid, datos) {
  await setDoc(doc(db, 'equipos', equipoId, 'ubicaciones', uid), { ...datos, actualizado: serverTimestamp() });
}

export async function dejarDeCompartir(equipoId, uid) {
  await deleteDoc(doc(db, 'equipos', equipoId, 'ubicaciones', uid));
}

export function escucharUbicaciones(equipoId, alCambiar) {
  return onSnapshot(
    collection(db, 'equipos', equipoId, 'ubicaciones'),
    (snap) => alCambiar(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))),
    () => alCambiar([])
  );
}
