/* =========================================================
   Vueltrack — comprobante de entrega: foto y firma
   Se guardan comprimidos en Firestore (plan gratis, sin Storage):
   foto JPEG de hasta 900 px y firma PNG chica.
   ========================================================= */
import { guardarComprobante, obtenerComprobante, cambiarParada } from './datos.js';
import { abrirHoja, aviso, esc, horaDeSegundos, segundosAhora } from './ui.js';

const LADO_FOTO = 900;
const CALIDAD_FOTO = 0.6;

/* Reduce la foto para que pese poco (aprox. 60 a 150 KB) */
export function comprimirFoto(archivo) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onerror = () => rechazar(new Error('foto'));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => rechazar(new Error('foto'));
      img.onload = () => {
        const escala = Math.min(1, LADO_FOTO / Math.max(img.width, img.height));
        const lienzo = document.createElement('canvas');
        lienzo.width = Math.round(img.width * escala);
        lienzo.height = Math.round(img.height * escala);
        lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
        resolver(lienzo.toDataURL('image/jpeg', CALIDAD_FOTO));
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}

/* Hoja para firmar con el dedo. Devuelve {firma, recibio} o null */
export function pedirFirma(nombreSugerido = '') {
  return new Promise((resolver) => {
    let resuelto = false;
    const terminar = (valor) => {
      if (resuelto) return;
      resuelto = true;
      resolver(valor);
    };
    const hoja = abrirHoja({
      titulo: 'Firma de quien recibe',
      alCerrar: () => terminar(null),
      html: `
        <div class="campo">
          <label for="fi-nombre">Nombre de quien recibe</label>
          <input id="fi-nombre" value="${esc(nombreSugerido)}" placeholder="Nombre y apellido">
        </div>
        <canvas class="lienzo-firma" id="fi-lienzo" aria-label="Espacio para firmar"></canvas>
        <div class="grilla-2 siempre">
          <button type="button" class="btn" id="fi-borrar">Borrar</button>
          <button type="button" class="btn btn-primario" id="fi-listo">Guardar firma</button>
        </div>`
    });
    const lienzo = hoja.el.querySelector('#fi-lienzo');
    const proporcion = window.devicePixelRatio || 1;
    const medir = () => {
      const caja = lienzo.getBoundingClientRect();
      lienzo.width = Math.round(caja.width * proporcion);
      lienzo.height = Math.round(caja.height * proporcion);
      const c = lienzo.getContext('2d');
      c.scale(proporcion, proporcion);
      c.lineWidth = 2.5;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.strokeStyle = '#111827';
    };
    requestAnimationFrame(medir);
    let dibujando = false;
    let hayTrazo = false;
    const punto = (e) => {
      const caja = lienzo.getBoundingClientRect();
      return { x: e.clientX - caja.left, y: e.clientY - caja.top };
    };
    lienzo.addEventListener('pointerdown', (e) => {
      dibujando = true;
      lienzo.setPointerCapture(e.pointerId);
      const c = lienzo.getContext('2d');
      const { x, y } = punto(e);
      c.beginPath();
      c.moveTo(x, y);
    });
    lienzo.addEventListener('pointermove', (e) => {
      if (!dibujando) return;
      const c = lienzo.getContext('2d');
      const { x, y } = punto(e);
      c.lineTo(x, y);
      c.stroke();
      hayTrazo = true;
    });
    const soltar = () => {
      dibujando = false;
    };
    lienzo.addEventListener('pointerup', soltar);
    lienzo.addEventListener('pointercancel', soltar);
    hoja.el.querySelector('#fi-borrar').addEventListener('click', () => {
      lienzo.getContext('2d').clearRect(0, 0, lienzo.width, lienzo.height);
      hayTrazo = false;
    });
    hoja.el.querySelector('#fi-listo').addEventListener('click', () => {
      if (!hayTrazo) {
        aviso('Falta la firma');
        return;
      }
      // Firma chica: se reduce a la mitad para que pese poco
      const chico = document.createElement('canvas');
      chico.width = Math.round(lienzo.width / proporcion);
      chico.height = Math.round(lienzo.height / proporcion);
      const c = chico.getContext('2d');
      c.fillStyle = '#FFFFFF';
      c.fillRect(0, 0, chico.width, chico.height);
      c.drawImage(lienzo, 0, 0, chico.width, chico.height);
      const valor = { firma: chico.toDataURL('image/png'), recibio: hoja.el.querySelector('#fi-nombre').value.trim() };
      terminar(valor);
      hoja.cerrar();
    });
  });
}

/**
 * Pinta la sección de comprobante dentro de un contenedor.
 * puedeCargar: si el usuario puede sacar foto o pedir firma.
 */
export async function pintarComprobante(caja, { ctx, fecha, parada, puedeCargar }) {
  let datos = null;
  if (parada.comprobante) datos = await obtenerComprobante(ctx.equipo.id, fecha, parada.id).catch(() => null);
  const foto = datos && datos.foto;
  const firma = datos && datos.firma;
  if (!puedeCargar && !foto && !firma) {
    caja.classList.add('oculto');
    return;
  }
  caja.classList.remove('oculto');
  caja.innerHTML = `
    <span class="etiqueta-campo texto-tenue">Comprobante de entrega</span>
    ${
      foto || firma
        ? `<div class="comprobante-fotos">
            ${foto ? `<img src="${foto}" alt="Foto de la entrega">` : ''}
            ${firma ? `<img class="firma" src="${firma}" alt="Firma de quien recibió">` : ''}
          </div>
          ${datos.recibio ? `<span class="texto-tenue">Recibió: ${esc(datos.recibio)}${datos.hora ? ` · ${esc(datos.hora)}` : ''}</span>` : ''}`
        : '<span class="texto-tenue">Sacale una foto a lo que dejaste o pedí la firma de quien recibe.</span>'
    }
    ${
      puedeCargar
        ? `<div class="grilla-2 siempre">
            <label class="btn" for="cp-foto">${foto ? 'Cambiar foto' : 'Sacar foto'}</label>
            <button type="button" class="btn" id="cp-firma">${firma ? 'Cambiar firma' : 'Pedir firma'}</button>
          </div>
          <input type="file" id="cp-foto" accept="image/*" capture="environment" class="oculto">`
        : ''
    }`;
  if (!puedeCargar) return;

  const guardar = async (cambios) => {
    await guardarComprobante(ctx.equipo.id, fecha, parada.id, { ...cambios, hora: horaDeSegundos(segundosAhora()), por: ctx.user.uid });
    if (!parada.comprobante) {
      await cambiarParada(ctx.equipo.id, fecha, parada.id, (paradas, i) => {
        if (i >= 0) paradas[i] = { ...paradas[i], comprobante: true };
        return paradas;
      });
      parada.comprobante = true;
    }
    aviso('Comprobante guardado');
    pintarComprobante(caja, { ctx, fecha, parada, puedeCargar });
  };

  caja.querySelector('#cp-foto').addEventListener('change', async (e) => {
    const archivo = e.target.files && e.target.files[0];
    if (!archivo) return;
    try {
      aviso('Guardando foto…');
      await guardar({ foto: await comprimirFoto(archivo) });
    } catch (err) {
      aviso('No se pudo guardar la foto');
    }
  });
  caja.querySelector('#cp-firma').addEventListener('click', async () => {
    const r = await pedirFirma(datos && datos.recibio ? datos.recibio : '');
    if (!r) return;
    try {
      await guardar(r);
    } catch (err) {
      aviso('No se pudo guardar la firma');
    }
  });
}
