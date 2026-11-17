/* =========================================================
   Vueltrack — Tipos de bultos (solo quien organiza)
   El único lugar donde se crean, renombran o borran los tipos
   (ej.: "Tubos de GNC"). "General" está siempre y no se borra.
   En los fleteros se destilda lo que no llevan y en los clientes
   se elige el tipo habitual, siempre de esta lista.
   ========================================================= */
import { iniciarPantalla } from './sesion.js';
import { actualizarEquipo, fleterosDelEquipo, escucharClientes, guardarCliente } from './datos.js';
import { catalogoCargas, sumarAlCatalogo } from './cargas.js';
import { esc, abrirHoja, aviso, confirmar, ICONOS } from './ui.js';

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
  $('contenido').classList.toggle('oculto', solo);
  if (solo) return;
  const fleteros = fleterosDelEquipo(ctx.equipo);
  const tipos = catalogoCargas(ctx.equipo);
  const general = `
    <div class="fila">
      <span class="fila-cuerpo"><span class="fila-titulo-texto">General</span>
        <span class="fila-detalle">Lo lleva cualquier fletero. Es el tipo de entrada.</span></span>
    </div>`;
  $('lista-tipos').innerHTML =
    general +
    tipos
      .map((c) => {
        const no = fleteros.filter((f) => (f.noLleva || []).includes(c)).map((f) => f.nombre);
        return `
      <div class="fila">
        <span class="fila-cuerpo"><span class="fila-titulo-texto">${esc(c)}</span>
          <span class="fila-detalle">${no.length ? `No lo llevan: ${esc(no.join(', '))}` : 'Lo llevan todos'}</span></span>
        <button type="button" class="btn-icono sin-borde" data-renombrar="${esc(c)}" aria-label="Cambiar nombre de ${esc(c)}">${ICONOS.lapiz}</button>
        <button type="button" class="btn-icono sin-borde" data-borrar="${esc(c)}" aria-label="Borrar ${esc(c)}">${ICONOS.basura}</button>
      </div>`;
      })
      .join('');
}

/* ---------- Agregar ---------- */
async function agregar() {
  const campo = $('nuevo-tipo');
  const texto = campo.value.trim();
  if (!texto) return;
  if (texto.toLowerCase() === 'general') {
    aviso('"General" ya está');
    return;
  }
  const antes = catalogoCargas(ctx.equipo).length;
  const nombre = await sumarAlCatalogo(ctx.equipo, texto);
  campo.value = '';
  if (nombre) aviso(catalogoCargas(ctx.equipo).length > antes ? `"${nombre}" agregado` : `"${nombre}" ya estaba`);
  pintar();
}
$('btn-agregar').addEventListener('click', agregar);
$('nuevo-tipo').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') agregar();
});

/* ---------- Renombrar o borrar (también en fleteros y clientes) ---------- */
$('lista-tipos').addEventListener('click', async (e) => {
  const renombrar = e.target.closest('[data-renombrar]');
  const borrar = e.target.closest('[data-borrar]');
  if (!renombrar && !borrar) return;
  const viejo = renombrar ? renombrar.dataset.renombrar : borrar.dataset.borrar;
  let nuevo = null;
  if (renombrar) {
    nuevo = await pedirTexto(`Nuevo nombre para "${viejo}"`, viejo);
    if (!nuevo || nuevo === viejo) return;
    if (nuevo.toLowerCase() === 'general') {
      aviso('Ese nombre está reservado');
      return;
    }
  } else {
    const ok = await confirmar({
      titulo: `¿Borrar "${viejo}"?`,
      texto: 'Se saca de la lista y de los fleteros. Los clientes que lo tenían pasan a General.',
      aceptar: 'Borrar',
      peligro: true
    });
    if (!ok) return;
  }
  const catalogo = [...new Set(catalogoCargas(ctx.equipo).map((c) => (c === viejo ? nuevo : c)).filter(Boolean))];
  const cambios = { 'ajustes.cargas': catalogo };
  fleterosDelEquipo(ctx.equipo).forEach((f) => {
    if ((f.noLleva || []).includes(viejo)) {
      cambios[`miembros.${f.uid}.noLleva`] = f.noLleva.map((c) => (c === viejo ? nuevo : c)).filter(Boolean);
    }
  });
  try {
    await actualizarEquipo(ctx.equipo.id, cambios);
    await actualizarClientes(viejo, nuevo);
    aviso(nuevo ? 'Nombre cambiado' : 'Borrado');
  } catch (err) {
    aviso('No se pudo guardar. Revisá la conexión.');
  }
});

/* Los clientes con ese tipo pasan al nombre nuevo (o a General si se borró) */
let clientes = [];
escucharClientes(ctx.equipo.id, (lista) => {
  clientes = lista;
});

async function actualizarClientes(viejo, nuevo) {
  const tocados = clientes.filter((c) => (c.cargas || []).includes(viejo));
  await Promise.all(
    tocados.map((c) =>
      guardarCliente(ctx.equipo.id, {
        ...c,
        cargas: [...new Set((c.cargas || []).map((x) => (x === viejo ? nuevo : x)).filter(Boolean))]
      })
    )
  );
}

function pedirTexto(titulo, valor) {
  return new Promise((ok) => {
    let listo = false;
    const hoja = abrirHoja({
      titulo,
      html: `<div class="campo"><input id="pt-texto" value="${esc(valor)}" autocomplete="off" maxlength="40"></div>
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

pintar();
