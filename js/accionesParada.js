/* =========================================================
   Vueltrack — acciones rápidas sobre un destino (desde Inicio)
   Se abren deslizando la fila hacia la izquierda:
   - Reasignar a otro fletero (respeta lo que lleva cada uno)
   - Pasar a otro día (reprogramar)
   - Borrar (con confirmación)
   ========================================================= */
import { cambiarParada, guardarVuelta, obtenerVuelta, fleterosDelEquipo } from './datos.js';
import { paradaHecha } from './vuelta.js';
import { activosDelDia } from './asignar.js';
import { puedeLlevar } from './cargas.js';
import { reprogramar } from './estados.js';
import { reordenarFletero, mensajeError } from './ordenar.js';
import { ordenConInsercion } from './agregarDestino.js';
import { ICONOS, esc, abrirHoja, aviso, confirmar, fechaISO, fechaLarga, sumarDias } from './ui.js';

/* ---------- Borrar ---------- */

export async function borrarDestino({ ctx, fecha, parada: p }) {
  const ok = await confirmar({
    titulo: `¿Borrar ${p.nombre}?`,
    texto: 'Se saca de la vuelta de hoy. No se puede deshacer.',
    aceptar: 'Borrar',
    peligro: true
  });
  if (!ok) return false;
  try {
    await cambiarParada(ctx.equipo.id, fecha, p.id, (lista) =>
      lista.filter((x) => x.id !== p.id).map((x) => (x.entregaId === p.id ? { ...x, entregaId: null } : x))
    );
    aviso(`${p.nombre} se borró de la vuelta`);
    return true;
  } catch (err) {
    aviso('No se pudo borrar. Revisá la conexión.');
    return false;
  }
}

/* ---------- Pasar a otro día ---------- */

export function reprogramarDestino({ ctx, fecha, vuelta, parada: p }) {
  const manana = sumarDias(fecha || fechaISO(), 1);
  const pasado = sumarDias(fecha || fechaISO(), 2);
  const hoja = abrirHoja({
    titulo: `Pasar ${p.nombre} a otro día`,
    html: `
      <div class="grilla-2 siempre">
        <button type="button" class="btn" data-dia="${manana}">Mañana</button>
        <button type="button" class="btn" data-dia="${pasado}">Pasado mañana</button>
      </div>
      <div class="campo"><label for="rp-fecha">Otro día</label><input type="date" id="rp-fecha" class="input" min="${manana}" value="${manana}"></div>
      <div class="campo"><label for="rp-motivo">Motivo (opcional)</label><input id="rp-motivo" placeholder="Ej.: el cliente pidió cambiar el día" autocomplete="off"></div>
      <button type="button" class="btn btn-primario btn-grande" id="rp-pasar">Pasar al día elegido</button>`
  });
  const el = hoja.el;
  let listo = false;
  const pasar = async (dia) => {
    if (listo || !dia) return;
    listo = true;
    hoja.cerrar();
    try {
      await reprogramar(ctx, fecha, vuelta, p, dia, el.querySelector('#rp-motivo').value.trim());
      aviso(`${p.nombre} pasó al ${fechaLarga(dia).toLowerCase()}`);
    } catch (err) {
      aviso('No se pudo pasar a otro día. Revisá la conexión.');
    }
  };
  el.querySelectorAll('[data-dia]').forEach((b) => b.addEventListener('click', () => pasar(b.dataset.dia)));
  el.querySelector('#rp-pasar').addEventListener('click', () => pasar(el.querySelector('#rp-fecha').value));
}

/* ---------- Reasignar a otro fletero ---------- */

export function hayAQuienReasignar(ctx, vuelta, fecha) {
  return activosDelDia(vuelta, fleterosDelEquipo(ctx.equipo).filter((f) => !f.temporal || f.temporal === fecha)).length > 1;
}

export function reasignarDestino({ ctx, fecha, vuelta, parada: p }) {
  const activos = activosDelDia(vuelta, fleterosDelEquipo(ctx.equipo).filter((f) => !f.temporal || f.temporal === fecha));
  const hoja = abrirHoja({
    titulo: `¿Quién va a ${p.nombre}?`,
    html: `<div class="lista">${activos
      .map((f) => {
        const cant = (vuelta.paradas || []).filter((x) => x.fleteroUid === f.uid && !paradaHecha(x)).length;
        const apto = puedeLlevar(p, f, vuelta);
        return `
        <button type="button" class="fila" data-uid="${esc(f.uid)}">
          <span class="fila-cuerpo"><span class="fila-titulo-texto"><i class="punto" style="background:${esc(f.color)}"></i> ${esc(f.nombre)}</span>
          <span class="fila-detalle">${cant} pendientes${apto ? '' : ` · <span class="aviso-carga">no lleva ${esc((p.cargas || []).join(', '))}</span>`}</span></span>
          ${p.fleteroUid === f.uid ? ICONOS.check : ''}
        </button>`;
      })
      .join('')}</div>`
  });
  hoja.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-uid]');
    if (!b) return;
    const uid = b.dataset.uid;
    if (uid === p.fleteroUid) {
      hoja.cerrar();
      return;
    }
    const f = activos.find((x) => x.uid === uid);
    const apto = puedeLlevar(p, f, vuelta);
    if (!apto) {
      const ok = await confirmar({
        titulo: `${f.nombre} no lleva ${(p.cargas || []).join(', ')}`,
        texto: '¿Se la asignás igual?',
        aceptar: 'Asignar igual'
      });
      if (!ok) return;
    }
    hoja.cerrar();
    await moverAFletero({ ctx, fecha, vuelta, parada: p, uid, fijo: !apto, nombre: f.nombre });
  });
}

async function moverAFletero({ ctx, fecha, vuelta, parada: p, uid, fijo, nombre }) {
  const equipo = ctx.equipo;
  const anterior = p.fleteroUid;
  // La entrega de un retiro (y el retiro de una entrega) viajan juntos
  const juntos = new Set([p.id]);
  (vuelta.paradas || []).forEach((x) => {
    if (paradaHecha(x)) return;
    if (p.entregaId && x.id === p.entregaId) juntos.add(x.id);
    if (x.entregaId === p.id) juntos.add(x.id);
  });
  const movida = { ...p, fleteroUid: uid, llegada: null };
  if (fijo) movida.fleteroFijo = true;
  else delete movida.fleteroFijo;
  const paradas = (vuelta.paradas || []).map((x) => {
    if (x.id === p.id) return movida;
    if (juntos.has(x.id)) return { ...x, fleteroUid: uid, llegada: null };
    return x;
  });
  const vueltaNueva = { ...vuelta, paradas };
  try {
    await guardarVuelta(equipo.id, fecha, { paradas });
    if (!vuelta.ordenada) {
      aviso(`${p.nombre} ahora va con ${nombre}`);
      return;
    }
    aviso(`${p.nombre} ahora va con ${nombre}. Recalculando horarios…`);
    // Entra en la ruta del nuevo fletero donde menos desvío agrega
    let ids = ordenConInsercion(equipo, vueltaNueva, movida, uid);
    juntos.forEach((id) => {
      if (id !== p.id && !ids.includes(id)) ids = [...ids, id];
    });
    await reordenarFletero({ equipo, fecha, vuelta: vueltaNueva, uid, orden: 'manual', ordenManual: ids });
    // Y el anterior se recalcula sin esa parada, en el mismo orden
    const actual = await obtenerVuelta(equipo.id, fecha);
    if (actual && anterior && (actual.paradas || []).some((x) => x.fleteroUid === anterior && !paradaHecha(x))) {
      const orden = (actual.paradas || [])
        .filter((x) => x.fleteroUid === anterior)
        .sort((a, b) => (a.orden || 0) - (b.orden || 0))
        .map((x) => x.id);
      await reordenarFletero({ equipo, fecha, vuelta: actual, uid: anterior, orden: 'manual', ordenManual: orden });
    }
    aviso(`${p.nombre} ahora va con ${nombre}`);
  } catch (err) {
    aviso(`Quedó asignada a ${nombre}, pero no se pudieron recalcular los horarios. ${mensajeError(err)}`);
  }
}
