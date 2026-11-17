/* =========================================================
   Vueltrack — Fleteros (solo quien organiza)
   Todos los fleteros del equipo en un lugar: datos, vehículo
   (tipo y capacidad), mercadería que no lleva y punto de salida.
   Con esto la app le asigna a cada uno solo lo que puede hacer.
   También se administran los tipos de mercadería.
   ========================================================= */
import { iniciarPantalla } from './sesion.js';
import { fleterosDelEquipo, actualizarMiembro, quitarMiembro, agregarFleteroSinApp, actualizarEquipo } from './datos.js';
import { TIPOS_VEHICULO, tipoVehiculo, selectorCargas, catalogoCargas, sumarAlCatalogo } from './cargas.js';
import { elegirPuntoDeSalida } from './salida.js';
import { esc, fechaISO, abrirHoja, aviso, confirmar, ICONOS, linkWhatsApp } from './ui.js';

const $ = (id) => document.getElementById(id);

let ctx = await iniciarPantalla({
  pagina: 'equipo',
  soloOrganizador: true,
  alCambiarEquipo: (nuevo) => {
    ctx = nuevo;
    pintar();
  }
});

function pintar() {
  const solo = ctx.equipo.modo === 'solo';
  $('modo-solo').classList.toggle('oculto', !solo);
  $('contenido-fleteros').classList.toggle('oculto', solo);
  if (solo) return;
  pintarFleteros();
  pintarCargas();
}

/* ---------- Lista ---------- */

function detalleDe(f) {
  const t = tipoVehiculo((f.gasto || {}).tipo);
  const cap = (f.gasto || {}).capacidad;
  return [
    t ? t.corto : 'Sin vehículo cargado',
    f.vehiculo || '',
    cap ? `${cap} bultos` : '',
    (f.noLleva || []).length ? `no lleva ${f.noLleva.join(', ')}` : '',
    f.base ? `sale desde ${f.base.direccion}` : ''
  ]
    .filter(Boolean)
    .join(' · ');
}

function pintarFleteros() {
  const lista = fleterosDelEquipo(ctx.equipo);
  $('sin-fleteros').classList.toggle('oculto', lista.length > 0);
  $('lista-fleteros').innerHTML = lista
    .map(
      (f) => `
      <button type="button" class="fila" data-uid="${esc(f.uid)}">
        <span class="iniciales" style="background:${esc(f.color)}">${esc((f.nombre || '?').slice(0, 1).toUpperCase())}</span>
        <span class="fila-cuerpo">
          <span class="fila-titulo-texto">${esc(f.nombre)}${f.uid === ctx.user.uid ? ' (vos)' : ''}</span>
          <span class="fila-detalle">${esc(detalleDe(f))}</span>
          <span class="fila-etiquetas">
            <span class="etiqueta ${f.externo ? '' : 'etiqueta-verde'}">${f.externo ? 'sin app' : 'con app'}</span>
            ${f.temporal ? `<span class="etiqueta etiqueta-acento">solo ${f.temporal === fechaISO() ? 'hoy' : f.temporal}</span>` : ''}
          </span>
        </span>
        <strong aria-hidden="true">›</strong>
      </button>`
    )
    .join('');
}

$('lista-fleteros').addEventListener('click', (e) => {
  const b = e.target.closest('[data-uid]');
  if (!b) return;
  const f = fleterosDelEquipo(ctx.equipo).find((x) => x.uid === b.dataset.uid);
  if (f) editarFletero(f);
});

$('btn-nuevo').addEventListener('click', () => editarFletero(null));

/* ---------- Ficha del fletero (nueva o existente) ---------- */

function editarFletero(f) {
  const nuevo = !f;
  const gasto = (f && f.gasto) || {};
  let tipo = gasto.tipo || '';
  const noLlevaSel = selectorCargas(ctx.equipo, (f && f.noLleva) || [], {
    id: 'fl-nolleva',
    titulo: 'Mercadería que NO lleva',
    ayuda: 'Esas paradas se le asignan a otro.'
  });
  const hoja = abrirHoja({
    titulo: nuevo ? 'Agregar fletero' : f.nombre,
    html: `
      <div class="campo"><label for="fl-nombre">Nombre</label><input id="fl-nombre" value="${esc((f && f.nombre) || '')}" placeholder="Nombre y apellido" autocomplete="off"></div>
      <div class="campo"><label for="fl-tel">Celular</label><input id="fl-tel" type="tel" inputmode="tel" value="${esc((f && f.telefono) || '')}" placeholder="Ej.: 291 412 3456"></div>
      <div class="campo"><span class="etiqueta-campo">Vehículo</span>
        <div class="chips" id="fl-tipo">${TIPOS_VEHICULO.map(
          (t) => `<button type="button" class="chip ${t.id === tipo ? 'activo' : ''}" data-tipo="${t.id}" aria-pressed="${t.id === tipo}">${esc(t.corto)}</button>`
        ).join('')}</div>
        <span class="texto-tenue">Las paradas que necesitan un vehículo más grande se le asignan a otro.</span>
      </div>
      <div class="grilla-2 siempre">
        <div class="campo"><label for="fl-modelo">Modelo o patente</label><input id="fl-modelo" value="${esc((f && f.vehiculo) || '')}" placeholder="Ej.: Fiorino AB123CD"></div>
        <div class="campo"><label for="fl-cap">Capacidad (bultos)</label><input id="fl-cap" type="number" inputmode="numeric" min="0" value="${esc(gasto.capacidad || '')}" placeholder="Sin límite"></div>
      </div>
      ${noLlevaSel.html}
      ${
        nuevo || f.externo
          ? `<label class="interruptor tarjeta" for="fl-frecuente">
        <span><strong>Fletero frecuente</strong><br><span class="texto-tenue">Si lo apagás, queda solo para hoy</span></span>
        <input type="checkbox" id="fl-frecuente" ${!f || !f.temporal ? 'checked' : ''}>
      </label>`
          : ''
      }
      ${nuevo ? '' : `<div class="lista ajustes"><button type="button" class="fila" id="fl-base"><span>Sale desde</span><strong>${esc(f.base ? f.base.direccion : 'El punto del equipo')}</strong></button></div>`}
      <button type="button" class="btn btn-primario btn-grande" id="fl-guardar">${nuevo ? 'Agregar' : 'Guardar'}</button>
      ${
        f && f.externo
          ? '<button type="button" class="btn" id="fl-invitar">Invitarlo a usar la app (WhatsApp)</button>'
          : ''
      }
      ${f && f.uid !== ctx.user.uid ? '<button type="button" class="link link-peligro centrado-texto" id="fl-quitar">Quitar del equipo</button>' : ''}`
  });
  const el = hoja.el;
  const noLlevaElegidas = noLlevaSel.conectar(el);
  if (nuevo) el.querySelector('#fl-nombre').focus();

  el.querySelector('#fl-tipo').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tipo]');
    if (!b) return;
    tipo = tipo === b.dataset.tipo ? '' : b.dataset.tipo;
    el.querySelectorAll('#fl-tipo [data-tipo]').forEach((x) => {
      x.classList.toggle('activo', x.dataset.tipo === tipo);
      x.setAttribute('aria-pressed', String(x.dataset.tipo === tipo));
    });
  });

  const botonBase = el.querySelector('#fl-base');
  if (botonBase) {
    botonBase.addEventListener('click', () => {
      hoja.cerrar();
      elegirPuntoDeSalida(ctx.equipo, { uid: f.uid, nombre: f.nombre });
    });
  }

  let guardando = false;
  el.querySelector('#fl-guardar').addEventListener('click', async () => {
    if (guardando) return;
    const nombre = el.querySelector('#fl-nombre').value.trim();
    if (!nombre) {
      aviso('Escribí el nombre del fletero');
      el.querySelector('#fl-nombre').focus();
      return;
    }
    guardando = true;
    const capacidad = Math.max(0, Math.round(Number(el.querySelector('#fl-cap').value) || 0)) || null;
    const datos = {
      nombre,
      telefono: el.querySelector('#fl-tel').value.trim(),
      vehiculo: el.querySelector('#fl-modelo').value.trim(),
      gasto: { ...gasto, tipo: tipo || null, capacidad },
      noLleva: noLlevaElegidas()
    };
    const frecuente = el.querySelector('#fl-frecuente') ? el.querySelector('#fl-frecuente').checked : true;
    hoja.cerrar();
    try {
      if (nuevo) {
        await agregarFleteroSinApp(ctx.equipo, { ...datos, frecuente, fecha: fechaISO() });
        aviso(`${nombre} agregado`);
      } else {
        if (f.externo) datos.temporal = frecuente ? null : f.temporal || fechaISO();
        await actualizarMiembro(ctx.equipo.id, f.uid, datos);
        aviso('Guardado');
      }
    } catch (err) {
      aviso('No se pudo guardar. Revisá la conexión.');
    }
  });

  const invitar = el.querySelector('#fl-invitar');
  if (invitar) {
    invitar.addEventListener('click', () => {
      const tel = el.querySelector('#fl-tel').value.trim();
      const texto = `Hola ${f.nombre.split(' ')[0]}! Sumate a "${ctx.equipo.nombre}" en Vueltrack para recibir tus retiros y entregas. Entrá a ${location.origin}/?codigo=${encodeURIComponent(ctx.equipo.codigo)} , creá tu cuenta y elegí "Me sumo a un equipo" (código ${ctx.equipo.codigo}).`;
      window.open(linkWhatsApp(tel, texto), '_blank', 'noopener');
    });
  }

  const quitar = el.querySelector('#fl-quitar');
  if (quitar) {
    quitar.addEventListener('click', async () => {
      const ok = await confirmar({
        titulo: `¿Quitar a ${f.nombre}?`,
        texto: 'Deja de aparecer para asignarle paradas. Sus paradas de hoy se pueden reasignar desde Armar.',
        aceptar: 'Quitar',
        peligro: true
      });
      if (!ok) return;
      hoja.cerrar();
      await quitarMiembro(ctx.equipo.id, f.uid).then(
        () => aviso(`${f.nombre} ya no está en el equipo`),
        () => aviso('No se pudo quitar. Revisá la conexión.')
      );
    });
  }
}

/* ---------- Tipos de mercadería ---------- */

function pintarCargas() {
  const lista = catalogoCargas(ctx.equipo);
  $('lista-cargas').innerHTML = lista.length
    ? lista
        .map(
          (c) => `
      <div class="fila">
        <span class="fila-cuerpo"><span class="fila-titulo-texto">${esc(c)}</span>
          <span class="fila-detalle">${fleterosDelEquipo(ctx.equipo).filter((f) => (f.noLleva || []).includes(c)).length} fleteros no la llevan</span></span>
        <button type="button" class="btn-icono sin-borde" data-renombrar="${esc(c)}" aria-label="Cambiar nombre de ${esc(c)}">${ICONOS.lapiz}</button>
        <button type="button" class="btn-icono sin-borde" data-borrar="${esc(c)}" aria-label="Borrar ${esc(c)}">${ICONOS.basura}</button>
      </div>`
        )
        .join('')
    : '<p class="texto-tenue">Todavía no cargaste tipos de mercadería.</p>';
}

$('lista-cargas').addEventListener('click', async (e) => {
  const renombrar = e.target.closest('[data-renombrar]');
  const borrar = e.target.closest('[data-borrar]');
  if (!renombrar && !borrar) return;
  const viejo = (renombrar || borrar).dataset.renombrar || (renombrar || borrar).dataset.borrar;
  let nuevo = null;
  if (renombrar) {
    nuevo = await pedirTexto(`Nuevo nombre para "${viejo}"`, viejo);
    if (!nuevo || nuevo === viejo) return;
  } else {
    const ok = await confirmar({
      titulo: `¿Borrar "${viejo}"?`,
      texto: 'Se saca de la lista y de los fleteros que no la llevaban. Los destinos ya cargados la conservan.',
      aceptar: 'Borrar',
      peligro: true
    });
    if (!ok) return;
  }
  // Catálogo + "no lleva" de cada fletero
  const catalogo = catalogoCargas(ctx.equipo)
    .map((c) => (c === viejo ? nuevo : c))
    .filter(Boolean);
  const cambios = { 'ajustes.cargas': [...new Set(catalogo)] };
  fleterosDelEquipo(ctx.equipo).forEach((f) => {
    if ((f.noLleva || []).includes(viejo)) {
      cambios[`miembros.${f.uid}.noLleva`] = f.noLleva.map((c) => (c === viejo ? nuevo : c)).filter(Boolean);
    }
  });
  await actualizarEquipo(ctx.equipo.id, cambios).then(
    () => aviso(nuevo ? 'Nombre cambiado' : 'Borrado'),
    () => aviso('No se pudo guardar. Revisá la conexión.')
  );
});

function pedirTexto(titulo, valor) {
  return new Promise((ok) => {
    let listo = false;
    const hoja = abrirHoja({
      titulo,
      html: `<div class="campo"><input id="pt-texto" value="${esc(valor)}" autocomplete="off"></div>
        <button type="button" class="btn btn-primario btn-grande" id="pt-ok">Guardar</button>`,
      alCerrar: () => {
        if (!listo) ok(null);
      }
    });
    const campo = hoja.el.querySelector('#pt-texto');
    campo.focus();
    campo.select();
    const aceptar = () => {
      listo = true;
      const t = campo.value.trim().replace(/\s+/g, ' ');
      hoja.cerrar();
      ok(t || null);
    };
    hoja.el.querySelector('#pt-ok').addEventListener('click', aceptar);
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') aceptar();
    });
  });
}

const sumarCarga = async () => {
  const nombre = await sumarAlCatalogo(ctx.equipo, $('nueva-carga').value);
  if (!nombre) return;
  $('nueva-carga').value = '';
  aviso(`"${nombre}" agregada`);
};
$('btn-nueva-carga').addEventListener('click', sumarCarga);
$('nueva-carga').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sumarCarga();
});

pintar();
