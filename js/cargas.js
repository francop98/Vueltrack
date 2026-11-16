/* =========================================================
   Vueltrack — tipos de carga
   Para que cada parada vaya con un fletero que la pueda llevar.

   equipo.ajustes.cargas   lista del equipo (ej.: "Tubos de GNC", "Vehículo grande")
   parada.cargas           lo que pide esa parada (cambia día a día)
   cliente.cargas          lo que suele pedir ese cliente (se copia al sumarlo, editable)
   miembro.noLleva         lo que ese fletero no lleva habitualmente
   vuelta.noLleva[uid]     lo que no lleva ESE día (ej.: hoy sale en la Fiorino)
   ========================================================= */
import { actualizarEquipo } from './datos.js';
import { esc, ordenarAlfa, abrirHoja, aviso, ICONOS } from './ui.js';

export function catalogoCargas(equipo) {
  return [...new Set(((equipo.ajustes || {}).cargas || []).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'es', { sensitivity: 'base' })
  );
}

/* Lo que un fletero no lleva ese día (lo del día manda sobre lo habitual) */
export function noLlevaDelDia(vuelta, fletero) {
  const delDia = vuelta && vuelta.noLleva && vuelta.noLleva[fletero.uid];
  return Array.isArray(delDia) ? delDia : fletero.noLleva || [];
}

export function puedeLlevar(parada, fletero, vuelta) {
  const pide = parada.cargas || [];
  if (!pide.length || !fletero) return true;
  const no = noLlevaDelDia(vuelta, fletero);
  return !pide.some((c) => no.includes(c));
}

/* Lo que sí puede llevar (para el optimizador) */
export function habilidades(equipo, vuelta, fleteros) {
  const todas = catalogoCargas(equipo);
  const resultado = {};
  fleteros.forEach((f) => {
    const no = noLlevaDelDia(vuelta, f);
    resultado[f.uid] = todas.filter((c) => !no.includes(c));
  });
  return resultado;
}

export async function sumarAlCatalogo(equipo, nombre) {
  const limpio = String(nombre || '').trim().replace(/\s+/g, ' ');
  if (!limpio) return null;
  const actual = catalogoCargas(equipo);
  const existente = actual.find((c) => c.toLowerCase() === limpio.toLowerCase());
  if (existente) return existente;
  const nueva = [...actual, limpio];
  equipo.ajustes = { ...(equipo.ajustes || {}), cargas: nueva };
  await actualizarEquipo(equipo.id, { 'ajustes.cargas': nueva });
  return limpio;
}

/**
 * Selector de tipos de carga con chips y "+ Nuevo tipo".
 * Devuelve { html, conectar(contenedor) → () => elegidas }
 */
export function selectorCargas(equipo, elegidas = [], { id = 'cargas', titulo = 'Tipo de carga', ayuda = '' } = {}) {
  const pintarChips = (lista, marcadas) =>
    lista
      .map(
        (c) =>
          `<button type="button" class="chip ${marcadas.includes(c) ? 'activo' : ''}" data-carga="${esc(c)}" aria-pressed="${marcadas.includes(c)}">${esc(c)}</button>`
      )
      .join('') + `<button type="button" class="chip punteado" data-nueva-carga><span class="mas" aria-hidden="true">+</span>Nuevo tipo</button>`;

  const html = `
    <div class="campo" id="${id}-caja">
      <span class="etiqueta-campo">${esc(titulo)}</span>
      <div class="chips" id="${id}-chips">${pintarChips(catalogoCargas(equipo), elegidas)}</div>
      <div class="fila-nueva-carga oculto" id="${id}-nueva">
        <input id="${id}-texto" placeholder="Ej.: Tubos de GNC, Vehículo grande">
        <button type="button" class="btn btn-primario" id="${id}-sumar">Agregar</button>
      </div>
      ${ayuda ? `<span class="texto-tenue">${esc(ayuda)}</span>` : ''}
    </div>`;

  const conectar = (raiz) => {
    let marcadas = [...elegidas];
    const chips = raiz.querySelector(`#${id}-chips`);
    const nueva = raiz.querySelector(`#${id}-nueva`);
    const texto = raiz.querySelector(`#${id}-texto`);
    const repintar = () => {
      chips.innerHTML = pintarChips(catalogoCargas(equipo), marcadas);
    };
    chips.addEventListener('click', (e) => {
      const b = e.target.closest('[data-carga]');
      if (b) {
        const c = b.dataset.carga;
        marcadas = marcadas.includes(c) ? marcadas.filter((x) => x !== c) : [...marcadas, c];
        repintar();
        return;
      }
      if (e.target.closest('[data-nueva-carga]')) {
        nueva.classList.remove('oculto');
        texto.focus();
      }
    });
    const sumar = async () => {
      const nombre = await sumarAlCatalogo(equipo, texto.value);
      if (!nombre) return;
      if (!marcadas.includes(nombre)) marcadas.push(nombre);
      texto.value = '';
      nueva.classList.add('oculto');
      repintar();
    };
    raiz.querySelector(`#${id}-sumar`).addEventListener('click', sumar);
    texto.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sumar();
      }
    });
    return () => ordenarAlfa(marcadas.map((nombre) => ({ nombre }))).map((x) => x.nombre);
  };
  return { html, conectar };
}

/**
 * Hoja "Qué lleva cada uno": por fletero que sale, marcar lo que NO lleva ese día.
 * guardar(noLlevaPorUid, habituales) recibe lo del día y, si se pidió, qué guardar como habitual.
 */
export function editarQueLleva({ equipo, fleteros, vuelta, guardar }) {
  const tipos = catalogoCargas(equipo);
  const hoja = abrirHoja({
    titulo: 'Qué lleva cada uno',
    html: `
      <p class="texto-tenue">Destildá lo que cada fletero <strong>no</strong> lleva este día (por ejemplo, si sale en un vehículo más chico). Las paradas que lo pidan se le asignan a otro.</p>
      <div id="ql-tipos">${
        tipos.length
          ? ''
          : '<p class="texto-tenue">Todavía no hay tipos de carga. Creá el primero acá abajo.</p>'
      }</div>
      <div class="fila-nueva-carga">
        <input id="ql-nuevo" placeholder="Nuevo tipo: ej. Tubos de GNC">
        <button type="button" class="btn" id="ql-sumar">Agregar</button>
      </div>
      <div class="lista" id="ql-lista"></div>
      <label class="interruptor tarjeta" for="ql-habitual">
        <span><strong>Guardar como habitual</strong><br><span class="texto-tenue">Se usa también los próximos días</span></span>
        <input type="checkbox" id="ql-habitual">
      </label>
      <button type="button" class="btn btn-primario btn-grande" id="ql-guardar">Guardar</button>`
  });
  const el = hoja.el;
  const estado = new Map(fleteros.map((f) => [f.uid, [...noLlevaDelDia(vuelta, f)]]));
  const pintar = () => {
    const lista = catalogoCargas(equipo);
    el.querySelector('#ql-lista').innerHTML = fleteros
      .map(
        (f) => `
        <div class="fila fila-que-lleva">
          <span class="fila-cuerpo">
            <span class="fila-titulo-texto"><i class="punto" style="background:${esc(f.color)}"></i> ${esc(f.nombre)}</span>
            <span class="chips">${
              lista
                .map((c) => {
                  const lleva = !estado.get(f.uid).includes(c);
                  return `<button type="button" class="chip ${lleva ? 'activo' : 'tachado'}" data-uid="${esc(f.uid)}" data-tipo="${esc(c)}" aria-pressed="${lleva}">${lleva ? ICONOS.check : ''}${esc(c)}</button>`;
                })
                .join('') || '<span class="texto-tenue">Sin tipos de carga</span>'
            }</span>
          </span>
        </div>`
      )
      .join('');
  };
  pintar();
  el.querySelector('#ql-lista').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tipo]');
    if (!b) return;
    const lista = estado.get(b.dataset.uid);
    const tipo = b.dataset.tipo;
    estado.set(b.dataset.uid, lista.includes(tipo) ? lista.filter((x) => x !== tipo) : [...lista, tipo]);
    pintar();
  });
  const sumar = async () => {
    const campo = el.querySelector('#ql-nuevo');
    const nombre = await sumarAlCatalogo(equipo, campo.value);
    if (!nombre) return;
    campo.value = '';
    el.querySelector('#ql-tipos').innerHTML = '';
    pintar();
  };
  el.querySelector('#ql-sumar').addEventListener('click', sumar);
  el.querySelector('#ql-nuevo').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sumar();
  });
  let guardando = false;
  el.querySelector('#ql-guardar').addEventListener('click', async () => {
    if (guardando) return;
    guardando = true;
    try {
      await guardar(Object.fromEntries(estado), el.querySelector('#ql-habitual').checked);
      hoja.cerrar();
      aviso('Guardado. Las paradas se reasignan según lo que lleva cada uno.');
    } catch (err) {
      guardando = false;
      aviso('No se pudo guardar. Revisá la conexión.');
    }
  });
}

/* Texto corto para filas: "Tubos de GNC" */
export function textoCargas(p) {
  return (p.cargas || []).join(', ');
}
