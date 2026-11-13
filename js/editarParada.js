/* =========================================================
   Vueltrack — editar o quitar un destino de la vuelta
   Se usa desde Armar y desde la pantalla de la parada.
   ========================================================= */
import { crearBuscador, htmlBuscador } from './buscador.js';
import { mapaConPin } from './mapa.js';
import { corregirUbicacionCliente } from './datos.js';
import { ICONOS, esc, abrirHoja, aviso, confirmar } from './ui.js';

/* Confirmación antes de quitar un destino */
export async function confirmarQuitar(parada) {
  return confirmar({
    titulo: '¿Eliminar este destino?',
    texto: `${parada.nombre} se quita de la vuelta. Esta acción no se puede deshacer.`,
    aceptar: 'Eliminar',
    peligro: true
  });
}

/**
 * @param {object} op
 * @param {object} op.parada     destino a editar
 * @param {object} op.equipo
 * @param {function} op.guardar  recibe los cambios y los guarda
 * @param {function} op.quitar   quita el destino de la vuelta
 * @param {boolean} op.ordenada  si la vuelta ya estaba ordenada (para avisar que hay que reordenar)
 */
export function editarParada({ parada: p, equipo, guardar, quitar, ordenada = false }) {
  let ubicacion = { direccion: p.direccion, lat: p.lat, lng: p.lng };
  const hoja = abrirHoja({
    titulo: 'Editar destino',
    html: `
      <div class="campo"><label for="ep-nombre">Nombre</label><input id="ep-nombre" value="${esc(p.nombre)}" placeholder="Nombre del destino"></div>
      ${htmlBuscador('ep-direccion', 'Dirección', 'Dirección o nombre del lugar', p.direccion)}
      <div class="mapa chico"><div class="mapa-lienzo" id="ep-mapa"></div></div>
      <span class="texto-tenue">Si el pin no está en la puerta, arrastralo o tocá el lugar correcto en el mapa.</span>
      <div class="grilla-2">
        <div class="campo"><label for="ep-tel">Teléfono</label><input id="ep-tel" type="tel" inputmode="tel" value="${esc(p.telefono)}" placeholder="Teléfono"></div>
        <div class="campo"><label for="ep-hasta">Horario de cierre</label><input id="ep-hasta" type="time" value="${esc(p.hasta)}"></div>
      </div>
      <div class="campo"><label for="ep-nota">Nota para el fletero</label><textarea id="ep-nota" placeholder="Indicaciones para la entrega">${esc(p.nota)}</textarea></div>
      <label class="interruptor tarjeta" for="ep-urgente"><span class="etiqueta-campo">Urgente (va primero)</span><input type="checkbox" id="ep-urgente" ${p.urgente ? 'checked' : ''}></label>
      <button type="button" class="btn btn-primario btn-grande" id="ep-guardar">Guardar cambios</button>
      <button type="button" class="btn btn-peligro" id="ep-quitar">${ICONOS.basura}Eliminar destino</button>`
  });
  const el = hoja.el;

  const pin = mapaConPin(el.querySelector('#ep-mapa'), { lat: p.lat, lng: p.lng }, (lat, lng) => {
    ubicacion = { ...ubicacion, lat, lng };
  });

  crearBuscador(el.querySelector('#ep-direccion'), {
    foco: () => equipo.base,
    alElegir: (r) => {
      const direccion = r.direccion || r.nombre;
      ubicacion = { direccion, lat: r.lat, lng: r.lng };
      el.querySelector('#ep-direccion').value = direccion;
      const nombre = el.querySelector('#ep-nombre');
      if (r.nombre && (!nombre.value.trim() || nombre.value.trim() === p.direccion)) nombre.value = r.nombre;
      pin.marcador.setLatLng([r.lat, r.lng]);
      pin.mapa.setView([r.lat, r.lng], 17);
    }
  });

  el.querySelector('#ep-guardar').addEventListener('click', async () => {
    const movida = ubicacion.lat !== p.lat || ubicacion.lng !== p.lng;
    const cambios = {
      nombre: el.querySelector('#ep-nombre').value.trim() || ubicacion.direccion,
      direccion: ubicacion.direccion,
      lat: ubicacion.lat,
      lng: ubicacion.lng,
      telefono: el.querySelector('#ep-tel').value.trim(),
      hasta: el.querySelector('#ep-hasta').value,
      nota: el.querySelector('#ep-nota').value.trim(),
      urgente: el.querySelector('#ep-urgente').checked
    };
    await guardar(cambios);
    // Si es un cliente habitual y solo se corrigió el pin (misma dirección), se guarda para la próxima
    if (movida && p.clienteId && ubicacion.direccion === p.direccion) {
      await corregirUbicacionCliente(equipo.id, p.clienteId, ubicacion.lat, ubicacion.lng).catch(() => {});
    }
    hoja.cerrar();
    aviso(movida && ordenada ? 'Guardado. Reordená la vuelta para actualizar el recorrido.' : 'Destino guardado');
  });

  el.querySelector('#ep-quitar').addEventListener('click', async () => {
    if (!(await confirmarQuitar(p))) return;
    await quitar();
    hoja.cerrar();
    aviso('Destino eliminado');
  });

  return hoja;
}
