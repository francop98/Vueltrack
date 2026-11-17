/* =========================================================
   Vueltrack — tipos de carga
   Para que cada parada vaya con un fletero que la pueda llevar.

   equipo.ajustes.cargas   lista del equipo (ej.: "Tubos de GNC", "Vehículo grande")
   parada.cargas           lo que pide esa parada (cambia día a día)
   cliente.cargas          lo que suele pedir ese cliente (se copia al sumarlo, editable)
   miembro.noLleva         lo que ese fletero no lleva habitualmente
   vuelta.noLleva[uid]     lo que no lleva ESE día
   Tamaño del vehículo:
   miembro.gasto.tipo      vehículo habitual del fletero (moto, auto, utilitario…)
   vuelta.vehiculoDia[uid] en qué sale ESE día (ej.: hoy sale en la Fiorino)
   cliente/parada.vehiculoMinimo   lo que necesita como mínimo (ej.: furgón o camión)
   ========================================================= */
import { actualizarEquipo } from './datos.js';
import { esc, ordenarAlfa, abrirHoja, aviso, ICONOS } from './ui.js';

/* ---------- Tamaño de vehículo ---------- */
export const TIPOS_VEHICULO = [
  { id: 'moto', nombre: 'Moto', corto: 'Moto', nivel: 0 },
  { id: 'auto', nombre: 'Auto', corto: 'Auto', nivel: 1 },
  { id: 'utilitario', nombre: 'Utilitario chico (Partner, Fiorino, Kangoo)', corto: 'Utilitario', nivel: 2 },
  { id: 'camioneta', nombre: 'Camioneta (pick-up)', corto: 'Camioneta', nivel: 2 },
  { id: 'furgon', nombre: 'Furgón o combi (Sprinter, Master)', corto: 'Furgón/combi', nivel: 3 },
  { id: 'camion', nombre: 'Camión', corto: 'Camión', nivel: 4 }
];
// Lo que puede pedir un cliente como mínimo
export const MINIMOS = [
  { id: '', nombre: 'Cualquiera' },
  { id: 'utilitario', nombre: 'Utilitario o más' },
  { id: 'furgon', nombre: 'Furgón/combi o más' },
  { id: 'camion', nombre: 'Camión' }
];
export const tipoVehiculo = (id) => TIPOS_VEHICULO.find((t) => t.id === id) || null;
export const nivelDe = (id) => (tipoVehiculo(id) ? tipoVehiculo(id).nivel : null);

/* En qué sale un fletero ese día (lo del día manda sobre lo habitual) */
export function vehiculoDelDia(vuelta, fletero) {
  const delDia = vuelta && vuelta.vehiculoDia && vuelta.vehiculoDia[fletero.uid];
  return delDia || (fletero.gasto && fletero.gasto.tipo) || '';
}

export function textoMinimo(id) {
  const m = MINIMOS.find((x) => x.id === id);
  return id && m ? `Necesita ${m.nombre.toLowerCase()}` : '';
}

/* Requisito de tamaño como "carga" para el optimizador: __min:N */
const etiquetaNivel = (n) => `__min:${n}`;
export function requisitosDe(p) {
  const n = nivelDe(p.vehiculoMinimo);
  return n ? [etiquetaNivel(n)] : [];
}

/* Lo que no lleva para el optimizador: sus cargas + los tamaños que no le dan */
export function noLlevaParaOptimizar(vuelta, fletero) {
  const n = nivelDe(vehiculoDelDia(vuelta, fletero));
  const tamanos = n == null ? [] : [2, 3, 4].filter((x) => x > n).map(etiquetaNivel);
  return [...noLlevaDelDia(vuelta, fletero), ...tamanos];
}

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
  if (!fletero) return true;
  // Tamaño: si la parada pide un mínimo y se sabe en qué sale el fletero
  const minimo = nivelDe(parada.vehiculoMinimo);
  const tiene = nivelDe(vehiculoDelDia(vuelta, fletero));
  if (minimo && tiene != null && tiene < minimo) return false;
  const pide = parada.cargas || [];
  if (!pide.length) return true;
  const no = noLlevaDelDia(vuelta, fletero);
  return !pide.some((c) => no.includes(c));
}

/* Por qué no la puede llevar (texto corto) */
export function motivoNoLleva(parada, fletero, vuelta) {
  const minimo = nivelDe(parada.vehiculoMinimo);
  const tiene = nivelDe(vehiculoDelDia(vuelta, fletero));
  if (minimo && tiene != null && tiene < minimo) return `${textoMinimo(parada.vehiculoMinimo).toLowerCase()} y sale en ${tipoVehiculo(vehiculoDelDia(vuelta, fletero)).corto.toLowerCase()}`;
  const no = noLlevaDelDia(vuelta, fletero);
  const cuales = (parada.cargas || []).filter((c) => no.includes(c));
  return cuales.length ? `no lleva ${cuales.join(', ')}` : '';
}

/* Chips para elegir el vehículo mínimo (cliente o destino) */
export function htmlMinimo(id, elegido = '') {
  return `
    <div class="campo"><span class="etiqueta-campo">Vehículo que necesita</span>
      <div class="chips" id="${id}">${MINIMOS.map(
        (m) => `<button type="button" class="chip ${m.id === (elegido || '') ? 'activo' : ''}" data-minimo="${m.id}" aria-pressed="${m.id === (elegido || '')}">${m.nombre}</button>`
      ).join('')}</div>
    </div>`;
}

export function conectarMinimo(raiz, id, inicial = '') {
  let valor = inicial || '';
  const caja = raiz.querySelector(`#${id}`);
  caja.addEventListener('click', (e) => {
    const b = e.target.closest('[data-minimo]');
    if (!b) return;
    valor = b.dataset.minimo;
    caja.querySelectorAll('[data-minimo]').forEach((x) => {
      x.classList.toggle('activo', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
  });
  return () => valor;
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
  const hoja = abrirHoja({
    titulo: 'Vehículo y carga de cada uno',
    html: `
      <p class="texto-tenue">Para este día: en qué sale cada fletero y qué mercadería <strong>no</strong> lleva. Las paradas que necesiten otro vehículo o esa mercadería se le asignan a otro.</p>
      <div class="lista" id="ql-lista"></div>
      <div class="fila-nueva-carga">
        <input id="ql-nuevo" placeholder="Nuevo tipo de mercadería: ej. Tubos de GNC">
        <button type="button" class="btn" id="ql-sumar">Agregar</button>
      </div>
      <label class="interruptor tarjeta" for="ql-habitual">
        <span><strong>Guardar como habitual</strong><br><span class="texto-tenue">Se usa también los próximos días</span></span>
        <input type="checkbox" id="ql-habitual">
      </label>
      <button type="button" class="btn btn-primario btn-grande" id="ql-guardar">Guardar</button>`
  });
  const el = hoja.el;
  const estado = new Map(fleteros.map((f) => [f.uid, [...noLlevaDelDia(vuelta, f)]]));
  const vehiculos = new Map(fleteros.map((f) => [f.uid, vehiculoDelDia(vuelta, f)]));
  const pintar = () => {
    const lista = catalogoCargas(equipo);
    el.querySelector('#ql-lista').innerHTML = fleteros
      .map(
        (f) => `
        <div class="fila fila-que-lleva">
          <span class="fila-cuerpo">
            <span class="fila-titulo-texto"><i class="punto" style="background:${esc(f.color)}"></i> ${esc(f.nombre)}</span>
            <span class="etiqueta-campo">Sale en</span>
            <span class="chips">${TIPOS_VEHICULO.map((t) => {
              const activo = vehiculos.get(f.uid) === t.id;
              return `<button type="button" class="chip ${activo ? 'activo' : ''}" data-uid="${esc(f.uid)}" data-vehiculo="${t.id}" aria-pressed="${activo}">${esc(t.corto)}</button>`;
            }).join('')}</span>
            ${
              lista.length
                ? `<span class="etiqueta-campo">Mercadería (tocá la que no lleva)</span>
            <span class="chips">${lista
              .map((c) => {
                const lleva = !estado.get(f.uid).includes(c);
                return `<button type="button" class="chip ${lleva ? 'activo' : 'tachado'}" data-uid="${esc(f.uid)}" data-tipo="${esc(c)}" aria-pressed="${lleva}">${lleva ? ICONOS.check : ''}${esc(c)}</button>`;
              })
              .join('')}</span>`
                : ''
            }
          </span>
        </div>`
      )
      .join('');
  };
  pintar();
  el.querySelector('#ql-lista').addEventListener('click', (e) => {
    const v = e.target.closest('[data-vehiculo]');
    if (v) {
      vehiculos.set(v.dataset.uid, vehiculos.get(v.dataset.uid) === v.dataset.vehiculo ? '' : v.dataset.vehiculo);
      pintar();
      return;
    }
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
      await guardar(Object.fromEntries(estado), el.querySelector('#ql-habitual').checked, Object.fromEntries(vehiculos));
      hoja.cerrar();
      aviso('Guardado. Las paradas se reasignan según el vehículo y la carga de cada uno.');
    } catch (err) {
      guardando = false;
      aviso('No se pudo guardar. Revisá la conexión.');
    }
  });
}

/* Texto corto para filas: "Tubos de GNC" */
export function textoCargas(p) {
  return [...(p.cargas || []), textoMinimo(p.vehiculoMinimo)].filter(Boolean).join(', ');
}

/* ---------- Bultos con su mercadería ----------
   Cada destino (o cliente) dice cuántos bultos lleva y de qué tipo:
   [{ cantidad: 2, tipo: 'Tubos de GNC' }, { cantidad: 3, tipo: '' }]  ('' = general)
   De ahí sale solo: el total de bultos (capacidad del vehículo) y la
   mercadería que pide (cargas), que se cruza con lo que NO lleva cada fletero. */

export function detalleInicial(x = {}) {
  if (Array.isArray(x.bultosDetalle) && x.bultosDetalle.length) return x.bultosDetalle.map((b) => ({ cantidad: Number(b.cantidad) || 0, tipo: b.tipo || '' }));
  const cargas = x.cargas || [];
  const total = Number.isFinite(Number(x.bultos)) && x.bultos !== '' && x.bultos != null ? Number(x.bultos) : 1;
  if (!cargas.length) return [{ cantidad: total, tipo: '' }];
  const filas = cargas.map((c) => ({ cantidad: 1, tipo: c }));
  if (total > cargas.length) filas.push({ cantidad: total - cargas.length, tipo: '' });
  return filas;
}

export function resumenBultos(detalle) {
  const filas = detalle.filter((b) => Number(b.cantidad) > 0);
  return {
    bultosDetalle: filas.map((b) => ({ cantidad: Math.round(Number(b.cantidad)), tipo: b.tipo || '' })),
    bultos: filas.reduce((s, b) => s + Math.round(Number(b.cantidad)), 0),
    cargas: [...new Set(filas.map((b) => b.tipo).filter(Boolean))]
  };
}

/* "3 bultos: 2 Tubos de GNC y 1 general" */
export function textoBultos(p) {
  const detalle = (p.bultosDetalle || []).filter((b) => Number(b.cantidad) > 0);
  const total = Number(p.bultos) || detalle.reduce((s, b) => s + Number(b.cantidad), 0);
  const conTipo = detalle.filter((b) => b.tipo);
  if (!conTipo.length) {
    const cargas = (p.cargas || []).join(', ');
    return [total > 1 ? `${total} bultos` : '', cargas].filter(Boolean).join(' · ');
  }
  const partes = detalle.map((b) => `${b.cantidad} ${b.tipo || 'general'}`);
  return `${total} ${total === 1 ? 'bulto' : 'bultos'}: ${partes.join(', ')}`;
}

export function selectorBultos(equipo, inicial, { id = 'bultos', titulo = 'Bultos', ayuda = '' } = {}) {
  let filas = detalleInicial(inicial);
  const opciones = (elegido) =>
    ['', ...catalogoCargas(equipo)]
      .map((c) => `<option value="${esc(c)}" ${c === elegido ? 'selected' : ''}>${c ? esc(c) : 'General'}</option>`)
      .join('') + '<option value="__nuevo">+ Nuevo tipo de mercadería…</option>';
  const htmlFilas = () =>
    filas
      .map(
        (b, i) => `
      <div class="fila-bulto" data-i="${i}">
        <input type="number" inputmode="numeric" min="0" step="1" class="bulto-cantidad" value="${esc(String(b.cantidad))}" aria-label="Cantidad">
        <select class="bulto-tipo" aria-label="Mercadería">${opciones(b.tipo)}</select>
        ${filas.length > 1 ? `<button type="button" class="btn-icono sin-borde" data-quitar-bulto="${i}" aria-label="Quitar">${ICONOS.cruz}</button>` : ''}
      </div>`
      )
      .join('');
  const html = `
    <div class="campo" id="${id}-caja">
      <span class="etiqueta-campo">${esc(titulo)}</span>
      <div class="bultos-filas" id="${id}-filas">${htmlFilas()}</div>
      <button type="button" class="chip punteado" id="${id}-mas"><span class="mas" aria-hidden="true">+</span>Otro tipo de bulto</button>
      <div class="fila-nueva-carga oculto" id="${id}-nueva">
        <input id="${id}-texto" placeholder="Ej.: Tubos de GNC">
        <button type="button" class="btn btn-primario" id="${id}-sumar">Agregar</button>
      </div>
      <span class="texto-tenue">${esc(ayuda || 'Si un tipo de mercadería no lo lleva un fletero, la app no se lo asigna.')}</span>
    </div>`;

  const conectar = (raiz, alCambiar = null) => {
    const caja = raiz.querySelector(`#${id}-filas`);
    const nueva = raiz.querySelector(`#${id}-nueva`);
    const texto = raiz.querySelector(`#${id}-texto`);
    let filaPendiente = null;
    const repintar = () => {
      caja.innerHTML = htmlFilas();
      if (alCambiar) alCambiar();
    };
    caja.addEventListener('input', (e) => {
      const f = e.target.closest('[data-i]');
      if (!f || !e.target.classList.contains('bulto-cantidad')) return;
      filas[Number(f.dataset.i)].cantidad = Math.max(0, Math.round(Number(e.target.value) || 0));
      if (alCambiar) alCambiar();
    });
    caja.addEventListener('change', (e) => {
      const f = e.target.closest('[data-i]');
      if (!f || !e.target.classList.contains('bulto-tipo')) return;
      const i = Number(f.dataset.i);
      if (e.target.value === '__nuevo') {
        filaPendiente = i;
        e.target.value = filas[i].tipo;
        nueva.classList.remove('oculto');
        texto.focus();
        return;
      }
      filas[i].tipo = e.target.value;
      if (alCambiar) alCambiar();
    });
    caja.addEventListener('click', (e) => {
      const b = e.target.closest('[data-quitar-bulto]');
      if (!b) return;
      filas.splice(Number(b.dataset.quitarBulto), 1);
      repintar();
    });
    raiz.querySelector(`#${id}-mas`).addEventListener('click', () => {
      filas.push({ cantidad: 1, tipo: '' });
      repintar();
    });
    const sumar = async () => {
      const nombre = await sumarAlCatalogo(equipo, texto.value);
      if (!nombre) return;
      if (filaPendiente != null && filas[filaPendiente]) filas[filaPendiente].tipo = nombre;
      else filas.push({ cantidad: 1, tipo: nombre });
      filaPendiente = null;
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
    return () => resumenBultos(filas);
  };
  return { html, conectar };
}
