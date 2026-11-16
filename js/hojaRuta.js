/* =========================================================
   Vueltrack — Hoja de ruta del día
   Todos los destinos de un día, por fletero: en qué orden,
   qué se hizo (entregado, retirado, no se pudo), a qué hora
   y quién lo marcó. Se comparte por WhatsApp o se baja en PDF.
   Se actualiza sola mientras los fleteros van marcando.
   ========================================================= */
import { iniciarPantalla } from './sesion.js';
import { escucharVuelta, fleterosDelEquipo } from './datos.js';
import { paradasDe, paradaHecha, queSeHizo } from './vuelta.js';
import { esc, fechaISO, fechaLarga, formatoKm, formatoDuracion, horaDeSegundos, linkWhatsApp, aviso } from './ui.js';

const $ = (id) => document.getElementById(id);
const parametros = new URLSearchParams(location.search);
let fecha = parametros.get('fecha') || fechaISO();
let vuelta = null;
let cortar = null;
let filtro = null;

const ctx = await iniciarPantalla({ pagina: 'historial', alCambiarEquipo: () => pintar() });
// El fletero de equipo ve solo lo suyo; quien organiza ve a todos
filtro = ctx.organizador ? 'todos' : ctx.user.uid;

$('fecha').value = fecha;
$('fecha').addEventListener('change', () => {
  if (!$('fecha').value) return;
  fecha = $('fecha').value;
  history.replaceState(null, '', `?fecha=${fecha}`);
  escuchar();
});

function escuchar() {
  if (cortar) cortar();
  $('cargando').classList.remove('oculto');
  cortar = escucharVuelta(ctx.equipo.id, fecha, (v) => {
    vuelta = v;
    cargado = true;
    pintar();
  });
}

/* ---------- Datos ---------- */

function nombreDe(uid) {
  const m = ctx.equipo.miembros && ctx.equipo.miembros[uid];
  return m ? m.nombre : '';
}

/* Resultado de una parada para mostrar: texto, clase y hora */
function resultado(p) {
  if (p.estado === 'entregado') return { texto: queSeHizo(p) === 'retirado' ? 'Retirado' : 'Entregado', clase: 'ok' };
  if (p.estado === 'noEstaba') return { texto: 'No estaba', clase: 'no' };
  if (p.estado === 'rechazado') return { texto: 'Rechazado', clase: 'no' };
  if (p.estado === 'reprogramado') return { texto: p.reprogramadaA ? `Pasada al ${fechaLarga(p.reprogramadaA).toLowerCase()}` : 'Reprogramada', clase: 'no' };
  return { texto: 'Pendiente', clase: 'pendiente' };
}

function grupos() {
  const fleteros = fleterosDelEquipo(ctx.equipo);
  const todas = (vuelta && vuelta.paradas) || [];
  const lista = fleteros
    .map((f) => ({ ...f, paradas: paradasDe(vuelta, f.uid) }))
    .filter((g) => g.paradas.length);
  // Destinos todavía sin fletero asignado
  const sinFletero = todas.filter((p) => !p.fleteroUid || !fleteros.some((f) => f.uid === p.fleteroUid));
  if (sinFletero.length) lista.push({ uid: '', nombre: 'Sin asignar', color: '#64748B', paradas: sinFletero });
  return filtro === 'todos' ? lista : lista.filter((g) => g.uid === filtro);
}

function totales(lista) {
  const ps = lista.flatMap((g) => g.paradas);
  return {
    destinos: ps.length,
    hechos: ps.filter((p) => p.estado === 'entregado').length,
    no: ps.filter((p) => paradaHecha(p) && p.estado !== 'entregado').length,
    pendientes: ps.filter((p) => !paradaHecha(p)).length
  };
}

function detalleFila(p, g) {
  return [
    p.tipo === 'retiro' ? 'Retiro' : 'Entrega',
    p.direccion,
    Number(p.bultos) > 1 ? `${p.bultos} bultos` : '',
    (p.cargas || []).join(', '),
    p.motivo && p.estado !== 'entregado' ? p.motivo : '',
    p.marcadoPor && p.marcadoPor !== g.uid && nombreDe(p.marcadoPor) ? `marcó ${nombreDe(p.marcadoPor)}` : '',
    p.comprobante ? 'con comprobante' : ''
  ]
    .filter(Boolean)
    .join(' · ');
}

function horaFila(p) {
  if (p.horaEstado) return p.horaEstado;
  return p.llegada != null && !paradaHecha(p) ? `aprox. ${horaDeSegundos(p.llegada)}` : '';
}

/* ---------- Pantalla ---------- */

function pintarFiltro() {
  const fleteros = fleterosDelEquipo(ctx.equipo).filter((f) => paradasDe(vuelta, f.uid).length);
  const mostrar = ctx.organizador && fleteros.length > 1;
  $('filtro-fletero').classList.toggle('oculto', !mostrar);
  if (!mostrar) return;
  const chip = (uid, texto) =>
    `<button type="button" class="chip ${filtro === uid ? 'activo' : ''}" data-filtro="${esc(uid)}" aria-pressed="${filtro === uid}">${esc(texto)}</button>`;
  $('filtro-fletero').innerHTML = chip('todos', 'Todos') + fleteros.map((f) => chip(f.uid, f.nombre)).join('');
}

$('filtro-fletero').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filtro]');
  if (!b) return;
  filtro = b.dataset.filtro;
  pintar();
});

let cargado = false;

function pintar() {
  if (!cargado) return;
  $('cargando').classList.add('oculto');
  $('fecha-texto').textContent = fechaLarga(fecha);
  pintarFiltro();
  const lista = grupos();
  const t = totales(lista);
  $('st-destinos').textContent = t.destinos;
  $('st-hechos').textContent = t.hechos;
  $('st-no').textContent = t.no;
  $('st-pendientes').textContent = t.pendientes;
  $('sin-datos').classList.toggle('oculto', t.destinos > 0);
  $('btn-whatsapp').disabled = !t.destinos;
  $('btn-pdf').disabled = !t.destinos;

  // Solo las paradas de hoy se abren (la pantalla de la parada es la del día)
  const esHoy = fecha === fechaISO();
  $('hoja').innerHTML = lista
    .map((g) => {
      const ruta = vuelta && vuelta.rutas && vuelta.rutas[g.uid];
      const tg = totales([g]);
      const resumen = [
        `${tg.hechos} de ${tg.destinos} hechos`,
        ruta && ruta.distancia ? formatoKm(ruta.distancia) : '',
        ruta && ruta.duracion ? formatoDuracion(ruta.duracion) : ''
      ]
        .filter(Boolean)
        .join(' · ');
      return `
      <section class="hoja-fletero">
        <div class="hoja-fletero-cabecera">
          <span class="letra-grupo"><i class="punto" style="background:${esc(g.color)}"></i> ${esc(g.nombre)}${g.vehiculo ? ` · ${esc(g.vehiculo)}` : ''}</span>
          <span class="texto-tenue">${esc(resumen)}</span>
        </div>
        <div class="lista">
          ${g.paradas
            .map((p, i) => {
              const r = resultado(p);
              return `
            <${esHoy ? 'a' : 'div'} class="fila fila-hoja enlace-plano" ${esHoy ? `href="/pages/parada.html?id=${encodeURIComponent(p.id)}"` : ''}>
              <span class="numero ${r.clase === 'ok' ? 'ok' : p.tipo === 'retiro' ? 'retiro' : ''}">${i + 1}</span>
              <span class="fila-cuerpo">
                <span class="fila-titulo-texto">${esc(p.nombre)}</span>
                <span class="fila-detalle">${esc(detalleFila(p, g))}</span>
              </span>
              <span class="titulo-bloque centrado-derecha">
                <span class="resultado ${r.clase}">${esc(r.texto)}</span>
                <span class="texto-tenue texto-chico">${esc(horaFila(p))}</span>
              </span>
            </${esHoy ? 'a' : 'div'}>`;
            })
            .join('')}
        </div>
      </section>`;
    })
    .join('');
}

/* ---------- Compartir ---------- */

function textoWhatsApp() {
  const equipo = ctx.equipo.modo !== 'solo' && ctx.equipo.nombre ? `${ctx.equipo.nombre} · ` : '';
  const lineas = [`*Hoja de ruta · ${equipo}${fechaLarga(fecha)}*`];
  const lista = grupos();
  const t = totales(lista);
  lineas.push(`${t.destinos} destinos · ${t.hechos} hechos · ${t.no} no se pudo · ${t.pendientes} pendientes`);
  lista.forEach((g) => {
    lineas.push('', `*${g.nombre}*`);
    g.paradas.forEach((p, i) => {
      const r = resultado(p);
      const hora = horaFila(p);
      const motivo = p.motivo && p.estado !== 'entregado' ? ` (${p.motivo})` : '';
      lineas.push(`${i + 1}. ${p.nombre} – ${r.texto}${hora ? ` ${hora}` : ''}${motivo}`);
    });
  });
  return lineas.join('\n');
}

$('btn-whatsapp').addEventListener('click', () => {
  window.open(linkWhatsApp('', textoWhatsApp()), '_blank', 'noopener');
});

$('btn-pdf').addEventListener('click', () => {
  const lista = grupos();
  const t = totales(lista);
  $('presupuesto').innerHTML = `
    <span class="marca-pdf">${esc(ctx.equipo.modo !== 'solo' && ctx.equipo.nombre ? ctx.equipo.nombre : 'Vueltrack')}</span>
    <h1>Hoja de ruta</h1>
    <div class="tenue-pdf">${esc(fechaLarga(fecha))} · ${t.destinos} destinos · ${t.hechos} hechos · ${t.no} no se pudo · ${t.pendientes} pendientes</div>
    ${lista
      .map(
        (g) => `
      <h2>${esc(g.nombre)}${g.vehiculo ? ` · ${esc(g.vehiculo)}` : ''}</h2>
      <table>
        <tr><th class="num">#</th><th>Destino</th><th>Tipo</th><th>Resultado</th><th class="num">Hora</th></tr>
        ${g.paradas
          .map((p, i) => {
            const r = resultado(p);
            const extra = [
              p.direccion,
              (p.cargas || []).join(', '),
              p.motivo && p.estado !== 'entregado' ? p.motivo : '',
              p.marcadoPor && p.marcadoPor !== g.uid && nombreDe(p.marcadoPor) ? `marcó ${nombreDe(p.marcadoPor)}` : ''
            ]
              .filter(Boolean)
              .join(' · ');
            return `<tr>
            <td class="num">${i + 1}</td>
            <td><strong>${esc(p.nombre)}</strong><div class="chico-pdf">${esc(extra)}</div></td>
            <td>${p.tipo === 'retiro' ? 'Retiro' : 'Entrega'}</td>
            <td>${esc(r.texto)}</td>
            <td class="num">${esc(horaFila(p))}</td>
          </tr>`;
          })
          .join('')}
      </table>`
      )
      .join('')}`;
  try {
    window.print();
  } catch (err) {
    aviso('No se pudo abrir la impresión. Probá desde el navegador.');
  }
});

escuchar();
