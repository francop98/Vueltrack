/* =========================================================
   Vueltrack — Equipo: modo de trabajo, integrantes y roles
   ========================================================= */
import { iniciarPantalla } from './sesion.js';
import { actualizarEquipo, actualizarMiembro, quitarMiembro, salirDelEquipo, fleterosDelEquipo } from './datos.js';
import { ICONOS, COLORES_FLETERO, esc, iniciales, ordenarAlfa, aviso, confirmar, abrirHoja } from './ui.js';
import { elegirZona, textoZona } from './zona.js';
import { elegirPuntoDeSalida } from './salida.js';

const $ = (id) => document.getElementById(id);
let ctx;

ctx = await iniciarPantalla({
  pagina: 'equipo',
  alCambiarEquipo: (nuevo) => {
    ctx = nuevo;
    pintar();
  }
});
pintar();

function miembros() {
  const colores = new Map(fleterosDelEquipo(ctx.equipo).map((f) => [f.uid, f.color]));
  return ordenarAlfa(
    Object.entries(ctx.equipo.miembros || {}).map(([uid, m]) => ({ uid, ...m, color: colores.get(uid) || m.color }))
  );
}

function organizadores() {
  return miembros().filter((m) => (m.roles || []).includes('organizador'));
}

function pintar() {
  const eq = ctx.equipo;
  const lista = miembros();
  const enEquipo = eq.modo !== 'solo';

  $('modos').classList.toggle('oculto', !ctx.organizador);

  $('bloque-ajustes').classList.toggle('oculto', !ctx.organizador);
  $('txt-zona').textContent = textoZona(eq.zona);
  $('txt-base').textContent = eq.base ? eq.base.direccion : 'Sin cargar';
  document.querySelectorAll('#modos [data-modo]').forEach((b) => b.classList.toggle('activo', b.dataset.modo === (enEquipo ? 'equipo' : 'solo')));

  $('equipo-sobre').textContent = enEquipo ? 'Tu equipo' : 'Trabajás solo';
  $('equipo-nombre').textContent = eq.nombre;
  const orgs = organizadores().length;
  $('equipo-detalle').textContent = enEquipo
    ? `${lista.length} ${lista.length === 1 ? 'integrante' : 'integrantes'} · ${orgs} ${orgs === 1 ? 'organizador' : 'organizadores'}`
    : 'Armás y hacés tu propia vuelta. Si después sumás gente, pasá a “En equipo”.';
  $('btn-renombrar').classList.toggle('oculto', !ctx.organizador);
  $('codigo-caja').classList.toggle('oculto', !enEquipo || !ctx.organizador);
  $('codigo').textContent = eq.codigo;

  $('bloque-integrantes').classList.toggle('oculto', !enEquipo);
  $('integrantes').innerHTML = lista
    .map((m) => {
      const roles = m.roles || [];
      const yo = m.uid === ctx.user.uid;
      return `
      <div class="fila">
        <span ${m.color ? `class="iniciales redondo con-color" style="background:${esc(m.color)}"` : 'class="iniciales redondo"'}>${esc(iniciales(m.nombre))}</span>
        <span class="fila-cuerpo">
          <span class="fila-titulo-texto">${esc(m.nombre)}${yo ? ' (vos)' : ''}</span>
          <span class="chips chips-chicas">
            ${roles.includes('organizador') ? '<span class="etiqueta etiqueta-oscura">Organizador</span>' : ''}
            ${roles.includes('fletero') ? '<span class="etiqueta etiqueta-acento">Fletero</span>' : ''}
            ${m.vehiculo ? `<span class="fila-detalle">· ${esc(m.vehiculo)}</span>` : ''}
          </span>
        </span>
        ${
          ctx.organizador
            ? `<button type="button" class="btn-icono sin-borde" data-miembro="${esc(m.uid)}" aria-label="Opciones de ${esc(m.nombre)}">${ICONOS.puntos}</button>`
            : ''
        }
      </div>`;
    })
    .join('');

  const puedeSalir = enEquipo && lista.length > 1 && (!ctx.organizador || orgs > 1);
  $('btn-salir-equipo').classList.toggle('oculto', !puedeSalir);
}

/* ---------- Ajustes del equipo ---------- */

$('btn-zona').addEventListener('click', () => elegirZona(ctx.equipo));
$('btn-base').addEventListener('click', () => elegirPuntoDeSalida(ctx.equipo));

/* ---------- Modo de trabajo ---------- */

document.querySelectorAll('#modos [data-modo]').forEach((b) =>
  b.addEventListener('click', async () => {
    const modo = b.dataset.modo;
    if (modo === (ctx.equipo.modo === 'solo' ? 'solo' : 'equipo')) return;
    if (modo === 'solo' && Object.keys(ctx.equipo.miembros || {}).length > 1) {
      aviso('Para trabajar solo, primero quitá a los demás integrantes');
      return;
    }
    await actualizarEquipo(ctx.equipo.id, { modo });
    aviso(modo === 'solo' ? 'Ahora trabajás solo' : 'Listo, invitá a tu equipo con el código');
  })
);

$('btn-renombrar').addEventListener('click', () => {
  const hoja = abrirHoja({
    titulo: 'Nombre del equipo',
    html: `<div class="campo"><label for="nuevo-nombre">Nombre</label><input id="nuevo-nombre" value="${esc(ctx.equipo.nombre)}"></div>
      <button type="button" class="btn btn-primario btn-grande" id="guardar-nombre">Guardar</button>`
  });
  hoja.el.querySelector('#guardar-nombre').addEventListener('click', async () => {
    const nombre = hoja.el.querySelector('#nuevo-nombre').value.trim();
    if (!nombre) return;
    await actualizarEquipo(ctx.equipo.id, { nombre });
    hoja.cerrar();
  });
});

$('btn-invitar').addEventListener('click', async () => {
  const texto = `Sumate a "${ctx.equipo.nombre}" en Vueltrack para recibir tu vuelta del día. Entrá a ${location.origin}, creá tu cuenta y poné el código ${ctx.equipo.codigo}.`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Vueltrack', text: texto });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
});

/* ---------- Roles de cada integrante ---------- */

$('integrantes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-miembro]');
  if (b) editarMiembro(b.dataset.miembro);
});

function editarMiembro(uid) {
  const m = miembros().find((x) => x.uid === uid);
  if (!m) return;
  const roles = m.roles || [];
  const yo = uid === ctx.user.uid;
  const hoja = abrirHoja({
    titulo: m.nombre + (yo ? ' (vos)' : ''),
    html: `
      <fieldset class="campo sin-borde">
        <legend class="etiqueta-campo">Roles</legend>
        <label class="interruptor tarjeta" for="r-org"><span><strong>Organizador</strong><br><span class="texto-tenue">Arma y reparte las vueltas</span></span><input type="checkbox" id="r-org" ${roles.includes('organizador') ? 'checked' : ''}></label>
        <label class="interruptor tarjeta" for="r-flet"><span><strong>Fletero</strong><br><span class="texto-tenue">Sale a repartir. Si no lo marcás, es solo organizador, sin vehículo.</span></span><input type="checkbox" id="r-flet" ${roles.includes('fletero') ? 'checked' : ''}></label>
      </fieldset>
      <div class="campo ${roles.includes('fletero') ? '' : 'oculto'}" id="r-vehiculo-caja"><label for="r-vehiculo">Vehículo</label><input id="r-vehiculo" value="${esc(m.vehiculo || '')}" placeholder="Marca y modelo"></div>
      <fieldset class="campo sin-borde">
        <legend class="etiqueta-campo">Color en el mapa</legend>
        <div class="casillas">
          ${COLORES_FLETERO.map(
            (c, i) =>
              `<label class="casilla casilla-color"><input type="radio" name="r-color" value="${c}" ${m.color === c ? 'checked' : ''}><span style="background:${c}" aria-label="Color ${i + 1}"></span></label>`
          ).join('')}
        </div>
      </fieldset>
      <p class="error-texto oculto" id="r-error" role="alert"></p>
      <button type="button" class="btn btn-primario btn-grande" id="r-guardar">Guardar</button>
      ${yo ? '' : `<button type="button" class="btn btn-peligro" id="r-quitar">${ICONOS.basura}Quitar del equipo</button>`}`
  });
  const el = hoja.el;
  el.querySelector('#r-flet').addEventListener('change', (e) => el.querySelector('#r-vehiculo-caja').classList.toggle('oculto', !e.target.checked));

  el.querySelector('#r-guardar').addEventListener('click', async () => {
    const nuevos = [];
    if (el.querySelector('#r-org').checked) nuevos.push('organizador');
    if (el.querySelector('#r-flet').checked) nuevos.push('fletero');
    const error = el.querySelector('#r-error');
    if (!nuevos.length) {
      error.textContent = 'Tiene que tener al menos un rol.';
      error.classList.remove('oculto');
      return;
    }
    const dejaDeOrganizar = roles.includes('organizador') && !nuevos.includes('organizador');
    if (dejaDeOrganizar && organizadores().length === 1) {
      error.textContent = 'El equipo necesita al menos un organizador.';
      error.classList.remove('oculto');
      return;
    }
    const color = (el.querySelector('input[name="r-color"]:checked') || {}).value || m.color || '';
    await actualizarMiembro(ctx.equipo.id, uid, {
      roles: nuevos,
      vehiculo: el.querySelector('#r-vehiculo').value.trim(),
      color
    });
    hoja.cerrar();
    aviso('Guardado');
  });

  const quitar = el.querySelector('#r-quitar');
  if (quitar) {
    quitar.addEventListener('click', async () => {
      const ok = await confirmar({
        titulo: `¿Quitar a ${m.nombre}?`,
        texto: 'Deja de ver las vueltas del equipo. Puede volver a sumarse con el código.',
        aceptar: 'Quitar',
        peligro: true
      });
      if (!ok) return;
      await quitarMiembro(ctx.equipo.id, uid);
      hoja.cerrar();
      aviso(`${m.nombre} ya no está en el equipo`);
    });
  }
}

$('btn-salir-equipo').addEventListener('click', async () => {
  const ok = await confirmar({
    titulo: '¿Salir del equipo?',
    texto: `Dejás de ver las vueltas de ${ctx.equipo.nombre}.`,
    aceptar: 'Salir',
    peligro: true
  });
  if (!ok) return;
  await salirDelEquipo(ctx.equipo.id, ctx.user.uid);
  location.replace('/pages/bienvenida.html');
});
