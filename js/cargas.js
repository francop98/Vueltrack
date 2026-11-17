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
import { esc, abrirHoja, aviso, ICONOS } from './ui.js';

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

/* Aviso cuando todavía no hay tipos cargados (se crean en un solo lugar) */
const SIN_TIPOS = 'Todavía no cargaste tipos de bultos. Se crean en el menú → Tipos de bultos.';

/**
 * Qué lleva un fletero: un chip por tipo de bulto, todos marcados de entrada;
 * se destilda lo que NO lleva. "General" lo lleva siempre.
 * Devuelve { html, conectar(raiz) → () => noLleva[] }
 */
export function selectorQueLleva(equipo, noLleva = [], { id = 'quelleva', titulo = 'Qué tipos de bultos lleva' } = {}) {
  const tipos = catalogoCargas(equipo);
  let no = noLleva.filter((c) => tipos.includes(c));
  const chips = () =>
    tipos
      .map((c) => {
        const lleva = !no.includes(c);
        return `<button type="button" class="chip ${lleva ? 'activo' : 'tachado'}" data-lleva="${esc(c)}" aria-pressed="${lleva}">${lleva ? ICONOS.check : ''}${esc(c)}</button>`;
      })
      .join('');
  const html = `
    <div class="campo" id="${id}-caja">
      <span class="etiqueta-campo">${esc(titulo)}</span>
      ${
        tipos.length
          ? `<div class="chips" id="${id}-chips">${chips()}</div>
      <span class="texto-tenue">Tocá para destildar lo que <strong>no</strong> lleva. General lo lleva siempre.</span>`
          : `<span class="texto-tenue">${SIN_TIPOS}</span>`
      }
    </div>`;
  const conectar = (raiz) => {
    const caja = raiz.querySelector(`#${id}-chips`);
    if (caja) {
      caja.addEventListener('click', (e) => {
        const b = e.target.closest('[data-lleva]');
        if (!b) return;
        const c = b.dataset.lleva;
        no = no.includes(c) ? no.filter((x) => x !== c) : [...no, c];
        caja.innerHTML = chips();
      });
    }
    return () => [...no];
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
                ? `<span class="etiqueta-campo">Tipos de bultos (tocá lo que no lleva)</span>
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

/* ---------- Tipo de bulto de un cliente o destino ----------
   cargas: tipos que pide (sin "General"); bultos: cantidad total (solo destinos).
   Los tipos se eligen de la lista: no se escriben acá (así no hay "tubos" y
   "Tubos GNC" como si fueran cosas distintas). */

export function textoBultos(p) {
  const total = Number(p.bultos) || 0;
  const tipos = (p.cargas || []).join(', ');
  return [total > 1 ? `${total} bultos` : '', tipos].filter(Boolean).join(' · ');
}

function tiposIniciales(x) {
  const desdeDetalle = (x.bultosDetalle || []).map((b) => b.tipo).filter(Boolean);
  const lista = [...new Set([...(x.cargas || []), ...desdeDetalle])];
  return lista.length ? lista : [''];
}

/**
 * Desplegable "Tipo de bulto" (General de entrada) y, si hace falta, "+ Otro tipo".
 * conCantidad: muestra también la cantidad de bultos (en destinos).
 * conectar(raiz, alCambiar) → () => ({ cargas, bultos? })
 */
export function selectorBultos(equipo, inicial = {}, { id = 'bultos', titulo = 'Tipo de bulto', conCantidad = false } = {}) {
  const catalogo = catalogoCargas(equipo);
  let tipos = tiposIniciales(inicial).filter((t) => !t || catalogo.includes(t));
  if (!tipos.length) tipos = [''];
  const opciones = (elegido) => ['', ...catalogo].map((c) => `<option value="${esc(c)}" ${c === elegido ? 'selected' : ''}>${c ? esc(c) : 'General'}</option>`).join('');
  const filas = () =>
    tipos
      .map(
        (t, i) => `
      <div class="fila-bulto" data-i="${i}">
        <select class="bulto-tipo" aria-label="Tipo de bulto">${opciones(t)}</select>
        ${tipos.length > 1 ? `<button type="button" class="btn-icono sin-borde" data-quitar-bulto="${i}" aria-label="Quitar">${ICONOS.cruz}</button>` : ''}
      </div>`
      )
      .join('');
  const total = Number(inicial.bultos) > 0 ? Number(inicial.bultos) : 1;
  const html = `
    ${conCantidad ? `<div class="campo"><label for="${id}-cantidad">Cantidad de bultos</label><input id="${id}-cantidad" type="number" inputmode="numeric" min="0" step="1" value="${total}"></div>` : ''}
    <div class="campo" id="${id}-caja">
      <span class="etiqueta-campo">${esc(titulo)}</span>
      <div class="bultos-filas" id="${id}-filas">${filas()}</div>
      ${
        catalogo.length
          ? `<button type="button" class="chip punteado" id="${id}-mas"><span class="mas" aria-hidden="true">+</span>Otro tipo</button>`
          : `<span class="texto-tenue">${SIN_TIPOS}</span>`
      }
    </div>`;
  const conectar = (raiz, alCambiar = null) => {
    const caja = raiz.querySelector(`#${id}-filas`);
    const avisar = () => alCambiar && alCambiar();
    const repintar = () => {
      caja.innerHTML = filas();
      avisar();
    };
    caja.addEventListener('change', (e) => {
      const f = e.target.closest('[data-i]');
      if (!f) return;
      tipos[Number(f.dataset.i)] = e.target.value;
      avisar();
    });
    caja.addEventListener('click', (e) => {
      const b = e.target.closest('[data-quitar-bulto]');
      if (!b) return;
      tipos.splice(Number(b.dataset.quitarBulto), 1);
      repintar();
    });
    const mas = raiz.querySelector(`#${id}-mas`);
    if (mas) {
      mas.addEventListener('click', () => {
        const libre = catalogo.find((c) => !tipos.includes(c));
        if (!libre) return;
        tipos.push(libre);
        repintar();
      });
    }
    const cantidad = raiz.querySelector(`#${id}-cantidad`);
    if (cantidad) cantidad.addEventListener('input', avisar);
    return () => {
      const resultado = { cargas: [...new Set(tipos.filter(Boolean))], bultosDetalle: [] };
      if (cantidad) resultado.bultos = Math.max(0, Math.round(Number(cantidad.value) || 0));
      return resultado;
    };
  };
  return { html, conectar };
}
