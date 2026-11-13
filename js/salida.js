/* =========================================================
   Vueltrack — elegir el punto de salida
   (buscando una dirección o con la ubicación actual del celular)
   ========================================================= */
import { actualizarEquipo } from './datos.js';
import { crearBuscador, htmlBuscador } from './buscador.js';
import { miUbicacion, direccionDe } from './rutas.js';
import { ICONOS, abrirHoja, aviso } from './ui.js';

export function elegirPuntoDeSalida(equipo) {
  const hoja = abrirHoja({
    titulo: 'Punto de salida',
    html: `
      <button type="button" class="btn btn-primario btn-grande" id="base-aca">${ICONOS.ubicacion}Usar mi ubicación actual</button>
      <div class="separador">o buscá una dirección</div>
      ${htmlBuscador('nueva-base', 'Depósito, casa o local')}
      <p class="texto-tenue">La vuelta arranca acá y, si elegiste volver, termina acá.</p>`
  });

  async function guardar(base) {
    await actualizarEquipo(equipo.id, { base });
    hoja.cerrar();
    aviso('Punto de salida guardado');
  }

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
    alElegir: (r) => guardar({ direccion: r.direccion, lat: r.lat, lng: r.lng })
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
      <p class="texto-tenue">Las urgentes siempre van primero. Para ordenar por horario de cierre, cargá “Recibe hasta” en las paradas que lo sepas; las demás quedan al final.</p>`
  });
  hoja.el.querySelectorAll('[data-orden]').forEach((b) =>
    b.addEventListener('click', () => {
      hoja.cerrar();
      alElegir(b.dataset.orden, hoja.el);
    })
  );
  return hoja;
}
