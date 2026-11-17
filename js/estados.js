/* =========================================================
   Vueltrack — resultado de cada parada
   Entregado, no estaba, rechazado o reprogramado; aviso al
   cliente por WhatsApp con link de seguimiento.
   Lo usan la pantalla de la parada y el modo manejo.
   ========================================================= */
import { cambiarParada, agregarParadasADia, guardarSeguimiento, fleterosDelEquipo, marcarParadas, vueltaGuardada } from './datos.js';
import { paradaHecha, copiaParaOtroDia, queSeHizo } from './vuelta.js';
import {
  fechaISO,
  fechaLarga,
  sumarDias,
  horaDeSegundos,
  segundosAhora,
  tokenAlAzar,
  linkWhatsApp,
  abrirHoja,
  aviso,
  ICONOS
} from './ui.js';

const horaAhoraTexto = () => horaDeSegundos(segundosAhora());

/* ---------- Seguimiento para el cliente ---------- */

function datosSeguimiento(ctx, fecha, paradas, p) {
  const suyas = paradas.filter((x) => x.fleteroUid === p.fleteroUid).sort((a, b) => (a.orden || 999) - (b.orden || 999));
  const pendientes = suyas.filter((x) => !paradaHecha(x));
  const antes = pendientes.findIndex((x) => x.id === p.id);
  const fletero = fleterosDelEquipo(ctx.equipo).find((f) => f.uid === p.fleteroUid);
  return {
    equipoId: ctx.equipo.id,
    equipo: ctx.equipo.nombre || '',
    fletero: fletero ? fletero.nombre : '',
    cliente: p.nombre || '',
    tipo: p.tipo === 'retiro' ? 'retiro' : 'entrega',
    fecha,
    estado: p.estado || 'pendiente',
    horaEstado: p.horaEstado || '',
    llegada: p.llegada ?? null,
    antes: antes >= 0 ? antes : 0
  };
}

/* Actualiza el link de cada parada pendiente del fletero (cuántas faltan antes y hora estimada) */
export async function actualizarSeguimientos(ctx, fecha, paradas, uid) {
  const conLink = paradas.filter((x) => x.fleteroUid === uid && x.token);
  await Promise.all(conLink.map((x) => guardarSeguimiento(x.token, datosSeguimiento(ctx, fecha, paradas, x)).catch(() => {})));
}

export function urlSeguimiento(token) {
  return `${location.origin}/pages/seguimiento.html?t=${encodeURIComponent(token)}`;
}

/**
 * Prepara el aviso al cliente. Es sincrónico (para que el link de WhatsApp se abra sin bloqueos);
 * el guardado del link de seguimiento sigue en segundo plano.
 */
export function prepararAviso(ctx, fecha, vuelta, p) {
  let token = p.token;
  if (!token) {
    token = tokenAlAzar();
    p.token = token;
    cambiarParada(ctx.equipo.id, fecha, p.id, (paradas, i) => {
      if (i >= 0 && !paradas[i].token) paradas[i] = { ...paradas[i], token };
      return paradas;
    })
      .then((paradas) => {
        const actual = paradas.find((x) => x.id === p.id);
        return guardarSeguimiento(actual.token, datosSeguimiento(ctx, fecha, paradas, actual));
      })
      .catch(() => {});
  } else {
    guardarSeguimiento(token, datosSeguimiento(ctx, fecha, (vuelta && vuelta.paradas) || [p], p)).catch(() => {});
  }
  const faltan = p.llegada != null && fecha === fechaISO() ? Math.max(0, Math.round((p.llegada - segundosAhora()) / 60)) : null;
  const quien = ctx.yo.nombre ? `Soy ${ctx.yo.nombre.split(' ')[0]}${ctx.equipo.nombre && ctx.equipo.modo !== 'solo' ? ` de ${ctx.equipo.nombre}` : ''}` : 'Te escribo';
  const que = p.tipo === 'retiro' ? 'a retirar' : 'con tu entrega';
  const cuando = faltan == null ? '' : faltan <= 5 ? ' en unos minutos' : ` en unos ${faltan} minutos (aprox. ${horaDeSegundos(p.llegada)})`;
  const texto = `¡Hola! ${quien}. Voy ${que}${cuando}. Podés seguir tu ${p.tipo === 'retiro' ? 'retiro' : 'entrega'} acá: ${urlSeguimiento(token)}`;
  return linkWhatsApp(p.telefono || '', texto);
}

/* Enlace <a> que abre WhatsApp con el aviso armado en el momento del toque */
export function conectarAviso(enlace, ctx, fecha, obtenerVuelta, obtenerParada) {
  enlace.addEventListener('click', () => {
    const p = obtenerParada();
    if (!p) return;
    enlace.href = prepararAviso(ctx, fecha, obtenerVuelta(), p);
  });
}

/* ---------- Marcar estado ---------- */

export async function marcarEstado(ctx, fecha, paradaId, estado, extra = {}) {
  const datos = {
    estado,
    horaEstado: estado === 'pendiente' ? '' : horaAhoraTexto(),
    marcadoPor: ctx.user.uid,
    ...extra
  };
  await marcarParadas(ctx.equipo.id, fecha, { [paradaId]: datos });
  // Link de seguimiento de los clientes de ese fletero (sin hacer esperar)
  vueltaGuardada(ctx.equipo.id, fecha)
    .then((v) => {
      const paradas = (v && v.paradas) || [];
      const p = paradas.find((x) => x.id === paradaId);
      if (p) actualizarSeguimientos(ctx, fecha, paradas, p.fleteroUid);
    })
    .catch(() => {});
}

/* Pasa la parada (y su par retiro/entrega, si está pendiente) a otro día */
export async function reprogramar(ctx, fecha, vuelta, p, nuevaFecha, motivo = '') {
  const todas = (vuelta && vuelta.paradas) || [];
  const grupo = [p];
  if (p.tipo === 'retiro' && p.entregaId) {
    const entrega = todas.find((x) => x.id === p.entregaId && !paradaHecha(x));
    if (entrega) grupo.push(entrega);
  } else {
    const retiro = todas.find((x) => x.tipo === 'retiro' && x.entregaId === p.id && !paradaHecha(x));
    if (retiro) grupo.unshift(retiro);
  }
  // Ids nuevos, manteniendo el vínculo retiro → entrega
  const nuevosIds = new Map();
  const copias = grupo.map((x) => {
    const copia = copiaParaOtroDia(x, { reprogramadaDe: fecha });
    nuevosIds.set(x.id, copia.id);
    return copia;
  });
  copias.forEach((c) => {
    if (c.entregaId && nuevosIds.has(c.entregaId)) c.entregaId = nuevosIds.get(c.entregaId);
  });
  await agregarParadasADia(ctx.equipo.id, nuevaFecha, copias);

  const hora = horaAhoraTexto();
  const cambios = {};
  grupo.forEach((x) => {
    cambios[x.id] = { estado: 'reprogramado', horaEstado: hora, marcadoPor: ctx.user.uid, reprogramadaA: nuevaFecha, motivo: motivo || x.motivo || '' };
  });
  await marcarParadas(ctx.equipo.id, fecha, cambios);
  vueltaGuardada(ctx.equipo.id, fecha)
    .then((v) => v && actualizarSeguimientos(ctx, fecha, v.paradas || [], p.fleteroUid))
    .catch(() => {});
  return copias.length;
}

/* Pasar la parada para el final de la vuelta del fletero */
export async function pasarAlFinal(ctx, fecha, paradaId) {
  await cambiarParada(ctx.equipo.id, fecha, paradaId, (paradas, i) => {
    if (i < 0) return paradas;
    const uid = paradas[i].fleteroUid;
    const suyas = paradas.filter((x) => x.fleteroUid === uid).sort((a, c) => (a.orden || 0) - (c.orden || 0));
    const movida = suyas.splice(suyas.findIndex((x) => x.id === paradaId), 1)[0];
    suyas.push({ ...movida, llegada: null });
    const nuevoOrden = new Map(suyas.map((x, n) => [x.id, n + 1]));
    return paradas.map((x) => (x.fleteroUid === uid ? { ...(x.id === paradaId ? { ...x, llegada: null } : x), orden: nuevoOrden.get(x.id) } : x));
  });
}

/**
 * Hoja "No se pudo entregar": no estaba / rechazado / reprogramar, con motivo
 * y opción de pasarla a otro día. Llama a alTerminar() al guardar.
 */
export function elegirNoEntregado(ctx, fecha, vuelta, p, alTerminar) {
  const manana = sumarDias(fecha, 1);
  // El fletero de equipo avisa qué pasó; pasarla a otro día lo decide quien organiza
  const puedePasar = !ctx.fleteroDeEquipo;
  const hoja = abrirHoja({
    titulo: p.tipo === 'retiro' ? 'No se pudo retirar' : 'No se pudo entregar',
    html: `
      <fieldset class="campo sin-borde">
        <legend class="etiqueta-campo">Qué pasó</legend>
        <div class="casillas">
          <label class="casilla"><input type="radio" name="ne-que" value="noEstaba" checked><span>No estaba</span></label>
          <label class="casilla"><input type="radio" name="ne-que" value="rechazado"><span>Rechazado</span></label>
          <label class="casilla"><input type="radio" name="ne-que" value="otro"><span>Otro motivo</span></label>
        </div>
      </fieldset>
      <div class="campo">
        <label for="ne-motivo">Detalle (opcional)</label>
        <input id="ne-motivo" placeholder="Ej.: local cerrado, dirección incorrecta">
      </div>
      ${
        puedePasar
          ? ''
          : '<p class="texto-tenue">Queda avisado con el motivo. Quien organiza decide si la pasa a otro día.</p>'
      }
      <label class="interruptor tarjeta ${puedePasar ? '' : 'oculto'}" for="ne-pasar">
        <span><strong>Pasarla a otro día</strong><br><span class="texto-tenue">Se suma pendiente a esa vuelta</span></span>
        <input type="checkbox" id="ne-pasar" ${puedePasar ? 'checked' : ''}>
      </label>
      <div class="campo ${puedePasar ? '' : 'oculto'}" id="ne-fecha-caja">
        <label for="ne-fecha">Día</label>
        <input type="date" id="ne-fecha" class="input" value="${manana}" min="${manana}">
      </div>
      <button type="button" class="btn btn-primario btn-grande" id="ne-guardar">Guardar</button>`
  });
  const el = hoja.el;
  const pasar = el.querySelector('#ne-pasar');
  pasar.addEventListener('change', () => el.querySelector('#ne-fecha-caja').classList.toggle('oculto', !pasar.checked));
  el.querySelector('#ne-guardar').addEventListener('click', async (e) => {
    const boton = e.currentTarget;
    boton.disabled = true;
    const que = el.querySelector('input[name="ne-que"]:checked').value;
    const detalle = el.querySelector('#ne-motivo').value.trim();
    const motivo = [que === 'noEstaba' ? 'No estaba' : que === 'rechazado' ? 'Rechazado' : '', detalle].filter(Boolean).join(': ');
    const nuevaFecha = el.querySelector('#ne-fecha').value || manana;
    try {
      if (pasar.checked) {
        await reprogramar(ctx, fecha, vuelta, p, nuevaFecha, motivo);
        aviso(`Pasada al ${fechaLarga(nuevaFecha).toLowerCase()}`);
      } else {
        await marcarEstado(ctx, fecha, p.id, que === 'rechazado' ? 'rechazado' : 'noEstaba', { motivo });
        aviso('Guardado');
      }
      hoja.cerrar();
      if (alTerminar) alTerminar();
    } catch (err) {
      boton.disabled = false;
      aviso('No se pudo guardar. Revisá la conexión.');
    }
  });
  return hoja;
}

/* Texto corto del resultado para listas */
export function textoResultado(p) {
  if (p.estado === 'entregado') return `${queSeHizo(p)}${p.horaEstado ? ` ${p.horaEstado}` : ''}`;
  if (p.estado === 'noEstaba') return 'no estaba';
  if (p.estado === 'rechazado') return 'rechazado';
  if (p.estado === 'reprogramado') return p.reprogramadaA ? `pasada al ${fechaLarga(p.reprogramadaA).toLowerCase()}` : 'reprogramada';
  return '';
}

/* Botones "Entregado" y "Retirado", uno al lado del otro (primero el que corresponde al tipo) */
export function htmlBotonesHecho(p, clase = 'btn-grande') {
  const entregado = `<button type="button" class="btn btn-ok ${clase}" data-accion="entregado">${ICONOS.check}Entregado</button>`;
  const retirado = `<button type="button" class="btn btn-ok ${clase}" data-accion="retirado">${ICONOS.check}Retirado</button>`;
  return `<div class="botones-hecho">${p.tipo === 'retiro' ? retirado + entregado : entregado + retirado}</div>`;
}

/* Marca la parada como hecha con éxito: entregado o retirado */
export function marcarHecho(ctx, fecha, paradaId, realizado) {
  return marcarEstado(ctx, fecha, paradaId, 'entregado', { motivo: '', realizado });
}
