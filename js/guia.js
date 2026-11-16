/* =========================================================
   Vueltrack — guía para quienes recién empiezan
   Se muestra sola la primera vez y queda en el menú.
   ========================================================= */
import { guardarUsuario } from './datos.js';
import { ICONOS, esc } from './ui.js';

const CLAVE = 'vueltrack_guia_vista';

function pasos(ctx) {
  const lista = [];
  if (ctx.organizador) {
    lista.push(
      {
        icono: ICONOS.armar,
        titulo: '1. Armá la vuelta',
        texto: 'En Armar escribí una dirección o el nombre de un comercio. Tus clientes habituales se suman con un toque.'
      },
      {
        icono: ICONOS.ordenar,
        titulo: '2. Elegí el orden',
        texto:
          'Vueltrack ordena los destinos por el recorrido más conveniente. También podés ordenar por cercanía o por horario de cierre.'
      }
    );
    if (ctx.equipo.modo !== 'solo') {
      lista.push({
        icono: ICONOS.equipo,
        titulo: '3. Repartí entre fleteros',
        texto: 'Si trabajan varios, dividí la vuelta por zona o en partes parejas. Cada fletero ve solo la suya.'
      });
    }
  }
  lista.push(
    {
      icono: ICONOS.navegar,
      titulo: `${lista.length + 1}. Salí a la calle`,
      texto:
        'En Inicio tocá “Toda la vuelta” para navegar con Google Maps, o “Solo esta” para ir a un destino. El Modo manejo te muestra una parada por vez con botones grandes. Con “Avisar” le mandás al cliente un WhatsApp con un link para seguir su entrega.'
    },
    {
      icono: ICONOS.check,
      titulo: `${lista.length + 2}. Marcá cada entrega`,
      texto: 'Al llegar tocá Entregado o “No se pudo entregar” (no estaba, rechazado) y pasala a otro día si hace falta. Podés sacar una foto o pedir la firma como comprobante.'
    }
  );
  if (ctx.fletero) {
    lista.push({
      icono: ICONOS.auto,
      titulo: `${lista.length + 1}. Tu vehículo al día`,
      texto: 'Cargá tu vehículo en el menú ☰ y te avisamos cuando se acerque la VTV, el seguro, la patente o el service.'
    });
  }
  lista.push({
    icono: ICONOS.menu,
    titulo: 'El menú',
    texto: 'Con ☰ arriba a la izquierda llegás a tus datos, seguridad, vehículo, equipo, esta guía e instalar la app. Con la flecha volvés a la pantalla anterior.'
  });
  return lista;
}

export function guiaVista(ctx) {
  try {
    if (localStorage.getItem(CLAVE) === 'si') return true;
  } catch (e) {
    /* sin almacenamiento */
  }
  return !!(ctx.usuario && ctx.usuario.guiaVista);
}

async function marcarVista(ctx) {
  try {
    localStorage.setItem(CLAVE, 'si');
  } catch (e) {
    /* sin almacenamiento */
  }
  if (!ctx.usuario.guiaVista) {
    ctx.usuario.guiaVista = true;
    await guardarUsuario(ctx.user.uid, { guiaVista: true }).catch(() => {});
  }
}

export function abrirGuia(ctx) {
  const lista = pasos(ctx);
  let actual = 0;
  const velo = document.createElement('div');
  velo.className = 'velo centrado';
  velo.innerHTML = `<div class="dialogo guia" role="dialog" aria-modal="true" aria-labelledby="guia-titulo"></div>`;
  const caja = velo.querySelector('.guia');

  const cerrar = async () => {
    velo.remove();
    await marcarVista(ctx);
  };

  function pintar() {
    const p = lista[actual];
    const ultimo = actual === lista.length - 1;
    caja.innerHTML = `
      <span class="guia-icono">${p.icono}</span>
      <h2 id="guia-titulo">${esc(p.titulo)}</h2>
      <p>${esc(p.texto)}</p>
      <div class="guia-puntos" aria-hidden="true">${lista.map((_, i) => `<span class="${i === actual ? 'activo' : ''}"></span>`).join('')}</div>
      <div class="botonera">
        ${actual > 0 ? '<button type="button" class="btn" data-g="atras">Anterior</button>' : '<button type="button" class="btn" data-g="saltar">Saltar</button>'}
        <button type="button" class="btn btn-primario" data-g="${ultimo ? 'fin' : 'siguiente'}">${ultimo ? 'Empezar' : 'Siguiente'}</button>
      </div>
      <span class="texto-tenue centrado-texto">${actual + 1} de ${lista.length}</span>`;
    caja.querySelector('[data-g="siguiente"], [data-g="fin"]').focus();
  }

  velo.addEventListener('click', (e) => {
    const b = e.target.closest('[data-g]');
    if (!b) return;
    const g = b.dataset.g;
    if (g === 'siguiente') actual++;
    if (g === 'atras') actual--;
    if (g === 'saltar' || g === 'fin') {
      cerrar();
      return;
    }
    pintar();
  });

  document.body.appendChild(velo);
  pintar();
}
