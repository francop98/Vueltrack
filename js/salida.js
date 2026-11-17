/* =========================================================
   Vueltrack — elegir el punto de salida
   (buscando una dirección o con la ubicación actual del celular)
   ========================================================= */
import { actualizarEquipo, actualizarMiembro } from './datos.js';
import { crearBuscador, htmlBuscador } from './buscador.js';
import { miUbicacion, direccionDe } from './rutas.js';
import { ICONOS, abrirHoja, aviso } from './ui.js';

/**
 * Punto de salida del equipo o, con fletero, el propio de ese fletero
 * (si no tiene uno propio, sale del punto del equipo).
 */
export function elegirPuntoDeSalida(equipo, fletero = null) {
  const propio = fletero && equipo.miembros && equipo.miembros[fletero.uid] && equipo.miembros[fletero.uid].base;
  const hoja = abrirHoja({
    titulo: fletero ? `Punto de salida de ${fletero.nombre}` : 'Punto de salida',
    html: `
      <button type="button" class="btn btn-primario btn-grande" id="base-aca">${ICONOS.ubicacion}Usar mi ubicación actual</button>
      <div class="separador">o buscá una dirección</div>
      ${htmlBuscador('nueva-base', 'Dirección del punto de salida')}
      <p class="texto-tenue">${
        fletero
          ? `Su vuelta arranca acá y, si elegiste volver, termina acá. Ahora: ${propio ? propio.direccion : `el del equipo${equipo.base ? ` (${equipo.base.direccion})` : ''}`}.`
          : 'La vuelta arranca acá y, si elegiste volver, termina acá. Cada fletero puede tener el suyo desde Equipo.'
      }</p>
      ${fletero && propio ? '<button type="button" class="btn" id="base-equipo">Usar el punto de salida del equipo</button>' : ''}`
  });

  async function guardar(base) {
    if (fletero) await actualizarMiembro(equipo.id, fletero.uid, { base });
    else await actualizarEquipo(equipo.id, { base });
    hoja.cerrar();
    aviso(base ? 'Punto de salida guardado' : 'Sale del punto del equipo');
  }

  const delEquipo = hoja.el.querySelector('#base-equipo');
  if (delEquipo) delEquipo.addEventListener('click', () => guardar(null));

  hoja.el.querySelector('#base-aca').addEventListener('click', async (e) => {
    const boton = e.currentTarget;
    boton.disabled = true;
    boton.textContent = 'Buscando tu ubicación…';
    try {
      const { lat, lng } = await miUbicacion();
      const direccion = await direccionDe(lat, lng);
      await guardar({ direccion, lat, lng });
    } catch (err) {
      aviso('No se pudo obtener tu ubicación. Revisá el permiso de ubicación del navegador.');
      boton.disabled = false;
      boton.innerHTML = `${ICONOS.ubicacion}Usar mi ubicación actual`;
    }
  });

  crearBuscador(hoja.el.querySelector('#nueva-base'), {
    foco: () => equipo.base,
    alElegir: (r) =>
      guardar({ direccion: r.nombre ? [r.nombre, r.direccion].filter(Boolean).join(' · ') : r.direccion, lat: r.lat, lng: r.lng })
  });
}

/* Hoja para elegir el orden de las paradas */
export function elegirOrden({ actual, ordenes, titulo = 'Orden de las paradas', extra = '', alElegir }) {
  const hoja = abrirHoja({
    titulo,
    html: `
      ${extra}
      ${ordenes
        .map(
          (o) => `
        <button type="button" class="opcion-lista ${o.id === actual ? 'activo' : ''}" data-orden="${o.id}" aria-pressed="${o.id === actual}">
          ${ICONOS.ordenar}<span><strong>${o.titulo}</strong><span>${o.texto}</span></span>
        </button>`
        )
        .join('')}
      <p class="texto-tenue">Las urgentes siempre van primero. Para ordenar por horario de cierre, cargá el horario de cierre en los destinos que lo sepas; las demás quedan al final.</p>`
  });
  hoja.el.querySelectorAll('[data-orden]').forEach((b) =>
    b.addEventListener('click', () => {
      hoja.cerrar();
      alElegir(b.dataset.orden, hoja.el);
    })
  );
  return hoja;
}
