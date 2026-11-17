/* =========================================================
   Vueltrack — datos en Firestore
   usuarios/{uid}
   equipos/{equipoId}                 (nombre, código, modo, ajustes, miembros)
   equipos/{equipoId}/clientes/{id}   (clientes habituales)
   equipos/{equipoId}/vueltas/{fecha} (paradas del día, rutas por fletero y
                                       marcas: cómo le fue a cada parada)
   equipos/{equipoId}/ubicaciones/{uid}        (seguimiento en vivo)
   equipos/{equipoId}/comprobantes/{fecha_id}  (foto y firma de la entrega)
   codigos/{codigo}                   (para sumarse a un equipo)
   seguimiento/{token}                (lo que ve el cliente con su link)
   ========================================================= */
import { db } from './firebase.js';
import {
  doc,
  getDoc,
  getDocFromCache,
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
  deleteField,
  FieldPath
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

/* ---------- Respuesta al instante ----------
   Firebase aplica cada cambio en el celular enseguida (la pantalla se actualiza
   al momento), pero la promesa recién se cumple cuando el servidor confirma, y
   con señal floja eso tarda. Para que los botones respondan ya, se sigue a los
   350 ms; si después el servidor rechaza el cambio, se avisa igual. */
export function alInstante(promesa) {
  return new Promise((ok, mal) => {
    let siguio = false;
    const reloj = setTimeout(() => {
      siguio = true;
      ok();
    }, 350);
    promesa.then(
      (valor) => {
        clearTimeout(reloj);
        if (!siguio) ok(valor);
      },
      (error) => {
        clearTimeout(reloj);
        if (!siguio) mal(error);
        else window.dispatchEvent(new CustomEvent('vueltrack:error-guardado', { detail: error }));
      }
    );
  });
}

export async function actualizarEquipo(equipoId, cambios) {
  await alInstante(updateDoc(doc(db, 'equipos', equipoId), cambios));
}

export async function actualizarMiembro(equipoId, uid, cambios) {
  const datos = {};
  Object.entries(cambios).forEach(([k, v]) => {
    datos[`miembros.${uid}.${k}`] = v;
  });
  await alInstante(updateDoc(doc(db, 'equipos', equipoId), datos));
}

export async function quitarMiembro(equipoId, uid) {
  await alInstante(
    updateDoc(doc(db, 'equipos', equipoId), {
      [`miembros.${uid}`]: deleteField(),
      miembrosIds: arrayRemove(uid)
    })
  );
}

export async function salirDelEquipo(equipoId, uid) {
  try {
    localStorage.removeItem('vueltrack_equipo');
  } catch (e) {
    /* sin almacenamiento */
  }
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
  await alInstante(setDoc(ref, { ...datos, actualizado: serverTimestamp() }, { merge: true }));
  return ref.id;
}

export async function borrarCliente(equipoId, clienteId) {
  await alInstante(deleteDoc(doc(db, 'equipos', equipoId, 'clientes', clienteId)));
}

export async function corregirUbicacionCliente(equipoId, clienteId, lat, lng) {
  await alInstante(
    updateDoc(doc(db, 'equipos', equipoId, 'clientes', clienteId), {
      lat,
      lng,
      ubicacionVerificada: true
    })
  );
}

/* ---------- Vueltas ----------
   Cómo le fue a cada parada (entregado, retirado, no estaba…) se guarda aparte,
   en vuelta.marcas[paradaId]. Así marcar es un cambio chico, que se ve al
   instante, queda guardado en el celular aunque no haya señal y nunca pisa lo
   que otro marcó al mismo tiempo. Al leer, cada marca se aplica sobre su parada. */

export function conMarcas(v) {
  if (!v || !v.marcas) return v;
  const marcas = v.marcas;
  return { ...v, paradas: (v.paradas || []).map((p) => (marcas[p.id] ? { ...p, ...marcas[p.id] } : p)) };
}

const vueltaDe = (snap) => (snap.exists() ? conMarcas({ id: snap.id, ...snap.data() }) : null);

export function escucharVuelta(equipoId, fecha, alCambiar) {
  return onSnapshot(doc(db, 'equipos', equipoId, 'vueltas', fecha), (snap) => {
    alCambiar(vueltaDe(snap));
  });
}

/* Marca una o varias paradas: { paradaId: { estado, horaEstado, realizado, motivo, … } } */
export async function marcarParadas(equipoId, fecha, cambios) {
  const pares = [];
  Object.entries(cambios).forEach(([id, datos]) => pares.push(new FieldPath('marcas', id), datos));
  if (!pares.length) return;
  await alInstante(updateDoc(doc(db, 'equipos', equipoId, 'vueltas', fecha), ...pares, 'actualizado', serverTimestamp()));
}

/* La vuelta como está en el celular (incluye lo marcado sin señal) */
export async function vueltaGuardada(equipoId, fecha) {
  try {
    return vueltaDe(await getDocFromCache(doc(db, 'equipos', equipoId, 'vueltas', fecha)));
  } catch (e) {
    return obtenerVuelta(equipoId, fecha).catch(() => null);
  }
}

export async function guardarVuelta(equipoId, fecha, datos) {
  await alInstante(
    setDoc(doc(db, 'equipos', equipoId, 'vueltas', fecha), { fecha, ...datos, actualizado: serverTimestamp() }, { merge: true })
  );
}

/* Reemplaza la vuelta completa (al ordenar, para no dejar rutas viejas) */
export async function reemplazarVuelta(equipoId, fecha, datos) {
  await alInstante(setDoc(doc(db, 'equipos', equipoId, 'vueltas', fecha), { fecha, ...datos, actualizado: serverTimestamp() }));
}

/* ---------- Sin señal ----------
   Con señal, los cambios de una parada van en una transacción (no se pisan
   con lo que otro marcó al mismo tiempo). Sin señal, se aplican sobre la copia
   guardada en el celular y Firebase los manda solo cuando vuelve la conexión. */

export const haySenal = () => navigator.onLine !== false;

/* Escritura que no deja esperando a la pantalla si no hay señal */
function sinEsperar(promesa) {
  if (haySenal()) return promesa;
  promesa.catch(() => {});
  return Promise.resolve();
}

function conTope(promesa, ms) {
  return Promise.race([promesa, new Promise((_, mal) => setTimeout(() => mal(Object.assign(new Error('sin-senal'), { code: 'unavailable' })), ms))]);
}

async function cambiarSinSenal(ref, paradaId, cambiar) {
  let snap;
  try {
    snap = await getDocFromCache(ref);
  } catch (e) {
    throw new Error('sin-vuelta');
  }
  if (!snap.exists()) throw new Error('sin-vuelta');
  const paradas = (conMarcas(snap.data()).paradas || []).map((p) => ({ ...p }));
  const resultado = cambiar(paradas, paradas.findIndex((p) => p.id === paradaId)) || paradas;
  // Queda en la cola de Firebase: se ve al instante y se envía al volver la señal.
  // Si el servidor lo rechaza, se avisa (no se pierde en silencio).
  updateDoc(ref, { paradas: resultado, actualizado: serverTimestamp() }).catch((error) =>
    window.dispatchEvent(new CustomEvent('vueltrack:error-guardado', { detail: error }))
  );
  return resultado;
}

/* Cambia una parada sin pisar lo que otro fletero marcó al mismo tiempo */
export async function cambiarParada(equipoId, fecha, paradaId, cambiar) {
  const ref = doc(db, 'equipos', equipoId, 'vueltas', fecha);
  if (!haySenal()) return cambiarSinSenal(ref, paradaId, cambiar);
  try {
    return await conTope(
      runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('sin-vuelta');
        const paradas = (conMarcas(snap.data()).paradas || []).map((p) => ({ ...p }));
        const resultado = cambiar(paradas, paradas.findIndex((p) => p.id === paradaId)) || paradas;
        tx.update(ref, { paradas: resultado, actualizado: serverTimestamp() });
        return resultado;
      }),
      4000
    );
  } catch (e) {
    // Señal muy débil o cortada a mitad de camino: se guarda igual en el celular
    if (e.code === 'unavailable' || e.code === 'deadline-exceeded' || !haySenal()) return cambiarSinSenal(ref, paradaId, cambiar);
    throw e;
  }
}

export async function obtenerVuelta(equipoId, fecha) {
  return vueltaDe(await getDoc(doc(db, 'equipos', equipoId, 'vueltas', fecha)));
}

/* Suma paradas a la vuelta de otro día (la crea si no existe). Se usa al reprogramar. */
export async function agregarParadasADia(equipoId, fecha, nuevas) {
  const ref = doc(db, 'equipos', equipoId, 'vueltas', fecha);
  if (!haySenal()) {
    // Sin señal: se suma sobre lo que haya en el celular de ese día (o se crea)
    let previas = [];
    try {
      const snap = await getDocFromCache(ref);
      if (snap.exists()) previas = snap.data().paradas || [];
    } catch (e) {
      previas = null;
    }
    const escritura = previas
      ? setDoc(ref, { fecha, paradas: [...previas, ...nuevas], ordenada: false, actualizado: serverTimestamp() }, { merge: true })
      : setDoc(ref, { fecha, paradas: nuevas, ordenada: false, actualizado: serverTimestamp() }, { merge: true });
    escritura.catch(() => {});
    return;
  }
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
  return snap.docs.map((d) => conMarcas({ id: d.id, ...d.data() })).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/* ---------- Seguimiento para el cliente (link público) ---------- */

export async function guardarSeguimiento(token, datos) {
  await sinEsperar(setDoc(doc(db, 'seguimiento', token), { ...datos, actualizado: serverTimestamp() }, { merge: true }));
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
  await sinEsperar(
    setDoc(doc(db, 'equipos', equipoId, 'comprobantes', `${fecha}_${paradaId}`), { ...datos, fecha, paradaId, actualizado: serverTimestamp() }, { merge: true })
  );
}

export async function obtenerComprobante(equipoId, fecha, paradaId) {
  const snap = await getDoc(doc(db, 'equipos', equipoId, 'comprobantes', `${fecha}_${paradaId}`));
  return snap.exists() ? snap.data() : null;
}

/* ---------- Ubicación en vivo de los fleteros ---------- */

export async function publicarUbicacion(equipoId, uid, datos) {
  await sinEsperar(setDoc(doc(db, 'equipos', equipoId, 'ubicaciones', uid), { ...datos, actualizado: serverTimestamp() }));
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

/* ---------- Lugares conocidos del equipo ----------
   Cada vez que alguien marca un lugar en el mapa o corrige un pin,
   queda guardado: la próxima búsqueda lo encuentra al instante. */

function idDeLugar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90) || 'lugar';
}

export async function guardarLugar(equipoId, lugar) {
  const id = idDeLugar(lugar.texto || lugar.nombre || lugar.direccion);
  await setDoc(doc(db, 'equipos', equipoId, 'lugares', id), { ...lugar, actualizado: serverTimestamp() }, { merge: true });
}

export function escucharLugares(equipoId, alCambiar) {
  return onSnapshot(
    collection(db, 'equipos', equipoId, 'lugares'),
    (snap) => alCambiar(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => alCambiar([])
  );
}

/* Borra la vuelta entera de un día (paradas y recorridos) */
export async function borrarVuelta(equipoId, fecha) {
  await alInstante(deleteDoc(doc(db, 'equipos', equipoId, 'vueltas', fecha)));
}

/* Fletero que no usa la app: el organizador le asigna paradas y le manda el recorrido por WhatsApp.
   frecuente = queda guardado para los próximos días; si no, es solo para ese día (temporal: fecha). */
export async function agregarFleteroSinApp(equipo, { nombre, telefono = '', vehiculo = '', noLleva = [], frecuente = true, fecha = '', gasto = null }) {
  const uid = `ext_${idNuevo()}`;
  const usados = new Set(Object.values(equipo.miembros || {}).map((m) => m.color).filter(Boolean));
  const color = COLORES_FLETERO.find((c) => !usados.has(c)) || COLORES_FLETERO[Object.keys(equipo.miembros || {}).length % COLORES_FLETERO.length];
  const datos = { nombre, telefono, roles: ['fletero'], externo: true, vehiculo, gasto, color, noLleva };
  if (!frecuente && fecha) datos.temporal = fecha;
  await alInstante(updateDoc(doc(db, 'equipos', equipo.id), { [`miembros.${uid}`]: datos }));
  return uid;
}

/* Saca del equipo los fleteros "solo por un día" de hace más de una semana */
export async function limpiarFleterosTemporales(equipo, hoy) {
  const limite = new Date(hoy);
  limite.setDate(limite.getDate() - 7);
  const corte = limite.toISOString().slice(0, 10);
  const viejos = Object.entries(equipo.miembros || {}).filter(([, m]) => m.temporal && m.temporal < corte);
  if (!viejos.length) return;
  await updateDoc(doc(db, 'equipos', equipo.id), Object.fromEntries(viejos.map(([uid]) => [`miembros.${uid}`, deleteField()])));
}
