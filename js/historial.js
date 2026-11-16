/* =========================================================
   Vueltrack — Historial y hoja de ruta
   Por período (Hoy, Esta semana, Este mes, Elegir fecha o Todos)
   y por fletero: km, tiempo, efectividad y la hoja de ruta con
   cada destino, qué se hizo, a qué hora y quién lo marcó.
   Se imprime / baja en PDF, se exporta a Excel o se comparte.
   ========================================================= */
import { iniciarPantalla } from './sesion.js';
import { vueltasEntre, escucharVuelta, fleterosDelEquipo } from './datos.js';
import { paradaHecha, queSeHizo } from './vuelta.js';
import { esc, fechaISO, fechaDesdeISO, fechaCorta, fechaLarga, sumarDias, formatoKm, formatoDuracion, horaDeSegundos, linkWhatsApp, aviso } from './ui.js';

const $ = (id) => document.getElementById(id);
const parametros = new URLSearchParams(location.search);
let rango = 'hoy';
let modoElegir = 'dia';
let fletero = null;
let vueltas = [];
let datos = null;
let cortarHoy = null;

const ctx = await iniciarPantalla({
  pagina: 'historial',
  alCambiarEquipo: () => {
    calcular();
    pintar();
  }
});
const fleteros = () => fleterosDelEquipo(ctx.equipo);
// El fletero de equipo ve solo lo suyo
fletero = ctx.organizador ? 'todos' : ctx.user.uid;

// ?fecha=AAAA-MM-DD abre ese día
if (parametros.get('fecha')) {
  rango = 'elegir';
  modoElegir = 'dia';
  $('dia').value = parametros.get('fecha');
}

/* ---------- Período ---------- */

function primeroDeMes(valorMes) {
  return `${valorMes}-01`;
}

function ultimoDeMes(valorMes) {
  const [a, m] = valorMes.split('-').map(Number);
  return fechaISO(new Date(a, m, 0));
}

function fechasDelRango() {
  const hoy = fechaISO();
  const f = fechaDesdeISO(hoy);
  if (rango === 'hoy') return [hoy, hoy];
  if (rango === 'semana') return [sumarDias(hoy, -((f.getDay() + 6) % 7)), hoy];
  if (rango === 'mes') return [fechaISO(new Date(f.getFullYear(), f.getMonth(), 1)), hoy];
  if (rango === 'todos') return ['2000-01-01', hoy];
  // Elegir fecha
  if (modoElegir === 'dia') {
    const d = $('dia').value || hoy;
    return [d, d];
  }
  if (modoElegir === 'meses') {
    const mesHoy = hoy.slice(0, 7);
    const desde = $('mes-desde').value || mesHoy;
    const hasta = $('mes-hasta').value || desde;
    return desde <= hasta ? [primeroDeMes(desde), ultimoDeMes(hasta)] : [primeroDeMes(hasta), ultimoDeMes(desde)];
  }
  const desde = $('desde').value || sumarDias(hoy, -7);
  const hasta = $('hasta').value || hoy;
  return desde <= hasta ? [desde, hasta] : [hasta, desde];
}

function textoRango(desde, hasta) {
  if (rango === 'todos') return 'Todo el historial';
  if (desde === hasta) return fechaLarga(desde);
  return `${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
}

function marcarChips(selector, atributo, valor) {
  document.querySelectorAll(selector).forEach((x) => {
    const activo = x.dataset[atributo] === valor;
    x.classList.toggle('activo', activo);
    x.setAttribute('aria-pressed', String(activo));
  });
}

function pintarElegir() {
  $('elegir').classList.toggle('oculto', rango !== 'elegir');
  $('campo-dia').classList.toggle('oculto', modoElegir !== 'dia');
  $('campos-rango').classList.toggle('oculto', modoElegir !== 'rango');
  $('campos-meses').classList.toggle('oculto', modoElegir !== 'meses');
  marcarChips('[data-rango]', 'rango', rango);
  marcarChips('[data-modo]', 'modo', modoElegir);
}

document.querySelectorAll('[data-rango]').forEach((b) =>
  b.addEventListener('click', () => {
    rango = b.dataset.rango;
    if (rango === 'elegir') {
      const hoy = fechaISO();
      if (!$('dia').value) $('dia').value = hoy;
      if (!$('desde').value) $('desde').value = sumarDias(hoy, -7);
      if (!$('hasta').value) $('hasta').value = hoy;
      if (!$('mes-desde').value) $('mes-desde').value = hoy.slice(0, 7);
      if (!$('mes-hasta').value) $('mes-hasta').value = hoy.slice(0, 7);
    }
    pintarElegir();
    cargar();
  })
);

document.querySelectorAll('[data-modo]').forEach((b) =>
  b.addEventListener('click', () => {
    modoElegir = b.dataset.modo;
    pintarElegir();
    cargar();
  })
);
['dia', 'desde', 'hasta', 'mes-desde', 'mes-hasta'].forEach((id) => $(id).addEventListener('change', cargar));

/* ---------- Filtro por fletero (organizador) ---------- */

function pintarFiltro() {
  const caja = $('filtro-fletero');
  const lista = fleteros();
  if (!ctx.organizador || lista.length < 2) {
    caja.classList.add('oculto');
    return;
  }
  caja.classList.remove('oculto');
  const opciones = [{ uid: 'todos', nombre: 'Todos los fleteros' }, ...lista];
  caja.innerHTML = opciones
    .map(
      (o) =>
        `<button type="button" class="chip ${fletero === o.uid ? 'activo' : ''}" data-uid="${esc(o.uid)}" aria-pressed="${fletero === o.uid}">${
          o.color ? `<i class="punto" style="background:${esc(o.color)}"></i>` : ''
        }${esc(o.nombre)}</button>`
    )
    .join('');
}
$('filtro-fletero').addEventListener('click', (e) => {
  const b = e.target.closest('[data-uid]');
  if (!b) return;
  fletero = b.dataset.uid;
  pintarFiltro();
  calcular();
  pintar();
});

/* ---------- Datos ---------- */

async function cargar() {
  const [desde, hasta] = fechasDelRango();
  $('rango-texto').textContent = textoRango(desde, hasta);
  $('cargando').classList.remove('oculto');
  if (cortarHoy) {
    cortarHoy();
    cortarHoy = null;
  }
  // Hoy: se actualiza solo mientras los fleteros van marcando
  if (desde === hasta && desde === fechaISO()) {
    cortarHoy = escucharVuelta(ctx.equipo.id, desde, (v) => {
      vueltas = v ? [v] : [];
      $('cargando').classList.add('oculto');
      calcular();
      pintar();
    });
    return;
  }
  try {
    vueltas = await vueltasEntre(ctx.equipo.id, desde, hasta);
  } catch (e) {
    vueltas = [];
    aviso('No se pudo cargar el historial. Revisá la conexión.');
  }
  $('cargando').classList.add('oculto');
  calcular();
  pintar();
}

function nombreDe(uid) {
  const m = ctx.equipo.miembros && ctx.equipo.miembros[uid];
  return m ? m.nombre : '';
}

/* Resultado de una parada: texto y clase */
function resultado(p) {
  if (p.estado === 'entregado') return { texto: queSeHizo(p) === 'retirado' ? 'Retirado' : 'Entregado', clase: 'ok' };
  if (p.estado === 'noEstaba') return { texto: 'No estaba', clase: 'no' };
  if (p.estado === 'rechazado') return { texto: 'Rechazado', clase: 'no' };
  if (p.estado === 'reprogramado') return { texto: p.reprogramadaA ? `Pasada al ${fechaCorta(p.reprogramadaA).toLowerCase()}` : 'Reprogramada', clase: 'no' };
  return { texto: 'Pendiente', clase: 'pendiente' };
}

function horaDe(p) {
  if (p.horaEstado) return p.horaEstado;
  return p.llegada != null && !paradaHecha(p) ? `aprox. ${horaDeSegundos(p.llegada)}` : '';
}

function detalleDe(p, uid) {
  return [
    p.tipo === 'retiro' ? 'Retiro' : 'Entrega',
    p.direccion,
    Number(p.bultos) > 1 ? `${p.bultos} bultos` : '',
    (p.cargas || []).join(', '),
    p.motivo && p.estado !== 'entregado' ? p.motivo : '',
    p.marcadoPor && p.marcadoPor !== uid && nombreDe(p.marcadoPor) ? `marcó ${nombreDe(p.marcadoPor)}` : '',
    p.comprobante ? 'con comprobante' : ''
  ]
    .filter(Boolean)
    .join(' · ');
}

function calcular() {
  const lista = fleteros();
  const uids = fletero === 'todos' ? lista.map((f) => f.uid) : [fletero];
  const total = { dias: 0, paradas: 0, hechas: 0, noHechas: 0, pendientes: 0, km: 0, tiempo: 0, motivos: {} };
  const dias = [];
  const detalle = [];

  vueltas.forEach((v) => {
    let km = 0;
    let tiempo = 0;
    const grupos = [];
    uids.forEach((uid) => {
      const r = v.rutas && v.rutas[uid];
      if (r) {
        km += r.distancia || 0;
        tiempo += r.duracion || 0;
      }
      const paradas = (v.paradas || []).filter((p) => p.fleteroUid === uid).sort((a, b) => (a.orden || 0) - (b.orden || 0));
      const f = lista.find((x) => x.uid === uid) || { uid, nombre: nombreDe(uid), color: '#64748B' };
      if (paradas.length) grupos.push({ ...f, paradas, ruta: r || null });
    });
    const paradas = grupos.flatMap((g) => g.paradas);
    if (!paradas.length && !km) return;
    const hechas = paradas.filter((p) => p.estado === 'entregado').length;
    const noHechas = paradas.filter((p) => paradaHecha(p) && p.estado !== 'entregado').length;
    grupos.forEach((g) =>
      g.paradas.forEach((p) => {
        if (p.motivo && p.estado !== 'entregado') {
          const clave = p.motivo.split(':')[0].trim();
          total.motivos[clave] = (total.motivos[clave] || 0) + 1;
        }
        detalle.push({ fecha: v.fecha, fletero: g.nombre, uid: g.uid, p });
      })
    );
    dias.push({ fecha: v.fecha, paradas: paradas.length, hechas, noHechas, km, tiempo, grupos });
    total.dias++;
    total.paradas += paradas.length;
    total.hechas += hechas;
    total.noHechas += noHechas;
    total.pendientes += paradas.length - hechas - noHechas;
    total.km += km;
    total.tiempo += tiempo;
  });
  datos = { total, dias, detalle };
}

/* ---------- Pantalla ---------- */

function htmlDia(d, abierto) {
  return `
    <details class="dia-hoja" ${abierto ? 'open' : ''}>
      <summary class="fila">
        <span class="numero ${d.paradas && d.hechas === d.paradas ? 'ok' : ''}">${fechaDesdeISO(d.fecha).getDate()}</span>
        <span class="fila-cuerpo">
          <span class="fila-titulo-texto">${esc(fechaLarga(d.fecha))}</span>
          <span class="fila-detalle">${d.hechas} de ${d.paradas} hechas · ${esc(formatoKm(d.km))} · ${esc(formatoDuracion(d.tiempo))}</span>
        </span>
      </summary>
      ${d.grupos
        .map(
          (g) => `
        <div class="hoja-fletero">
          <span class="letra-grupo"><i class="punto" style="background:${esc(g.color)}"></i> ${esc(g.nombre)}${g.vehiculo ? ` · ${esc(g.vehiculo)}` : ''}</span>
          <div class="lista">
            ${g.paradas
              .map((p, i) => {
                const r = resultado(p);
                return `
              <div class="fila fila-hoja">
                <span class="numero ${r.clase === 'ok' ? 'ok' : p.tipo === 'retiro' ? 'retiro' : ''}">${i + 1}</span>
                <span class="fila-cuerpo">
                  <span class="fila-titulo-texto">${esc(p.nombre)}</span>
                  <span class="fila-detalle">${esc(detalleDe(p, g.uid))}</span>
                </span>
                <span class="titulo-bloque centrado-derecha">
                  <span class="resultado ${r.clase}">${esc(r.texto)}</span>
                  <span class="texto-tenue texto-chico">${esc(horaDe(p))}</span>
                </span>
              </div>`;
              })
              .join('')}
          </div>
        </div>`
        )
        .join('')}
    </details>`;
}

function pintar() {
  if (!datos) return;
  const t = datos.total;
  $('st-dias').textContent = t.dias;
  $('st-entregas').textContent = t.paradas ? `${t.hechas}/${t.paradas}` : '0';
  $('st-km').textContent = formatoKm(t.km);
  $('st-tiempo').textContent = t.tiempo ? formatoDuracion(t.tiempo) : '—';

  const porcentaje = t.paradas ? Math.round((t.hechas / t.paradas) * 100) : 0;
  const motivos = Object.entries(t.motivos)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m, n]) => `${m} (${n})`)
    .join(', ');
  $('efectividad').classList.toggle('oculto', !t.paradas);
  $('efectividad').innerHTML = t.paradas
    ? `
      <span class="texto-tenue">Hechas con éxito</span>
      <strong class="subtitulo">${porcentaje}% · ${t.hechas} de ${t.paradas}</strong>
      <span class="texto-tenue">${t.noHechas} no se pudieron${t.pendientes ? ` · ${t.pendientes} sin marcar` : ''}</span>
      ${motivos ? `<span class="texto-tenue">Motivos más comunes: ${esc(motivos)}</span>` : ''}`
    : '';

  $('sin-datos').classList.toggle('oculto', datos.dias.length > 0);
  $('dias').classList.toggle('oculto', !datos.dias.length);
  // El día más reciente arriba; si es uno solo, ya abierto
  const dias = [...datos.dias].reverse();
  $('dias').innerHTML = dias.map((d, i) => htmlDia(d, dias.length === 1 || (i === 0 && dias.length <= 7))).join('');
  ['btn-excel', 'btn-pdf', 'btn-whatsapp'].forEach((id) => {
    $(id).disabled = !datos.detalle.length;
  });
}

/* ---------- Exportar ---------- */

function celda(valor) {
  const texto = String(valor ?? '');
  return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function nombreDelFiltro() {
  return fletero === 'todos' ? 'Todos los fleteros' : (fleteros().find((f) => f.uid === fletero) || {}).nombre || '';
}

$('btn-excel').addEventListener('click', () => {
  const [desde, hasta] = fechasDelRango();
  const encabezado = ['Fecha', 'Fletero', 'Orden', 'Tipo', 'Nombre', 'Dirección', 'Resultado', 'Hora', 'Motivo', 'Marcó', 'Bultos', 'Carga', 'Llegada estimada', 'Comprobante'];
  const filas = datos.detalle.map(({ fecha, fletero: nombre, uid, p }) => [
    fecha,
    nombre,
    p.orden || '',
    p.tipo === 'retiro' ? 'Retiro' : 'Entrega',
    p.nombre,
    p.direccion,
    resultado(p).texto,
    p.horaEstado || '',
    p.estado !== 'entregado' ? p.motivo || '' : '',
    p.marcadoPor && p.marcadoPor !== uid ? nombreDe(p.marcadoPor) : '',
    p.bultos ?? '',
    (p.cargas || []).join(', '),
    p.llegada != null ? horaDeSegundos(p.llegada) : '',
    p.comprobante ? 'Sí' : ''
  ]);
  // Punto y coma y BOM: Excel en español lo abre directo con tildes y columnas
  const csv = '﻿' + [encabezado, ...filas].map((f) => f.map(celda).join(';')).join('\r\n');
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  enlace.download = `vueltrack-hoja-de-ruta-${desde}-a-${hasta}.csv`;
  document.body.appendChild(enlace);
  enlace.click();
  setTimeout(() => {
    URL.revokeObjectURL(enlace.href);
    enlace.remove();
  }, 1000);
});

$('btn-whatsapp').addEventListener('click', () => {
  const [desde, hasta] = fechasDelRango();
  const t = datos.total;
  const equipo = ctx.equipo.modo !== 'solo' && ctx.equipo.nombre ? `${ctx.equipo.nombre} · ` : '';
  const lineas = [`*Hoja de ruta · ${equipo}${textoRango(desde, hasta)}*`, `${t.paradas} destinos · ${t.hechas} hechos · ${t.noHechas} no se pudo · ${t.pendientes} pendientes`];
  datos.dias.forEach((d) => {
    if (datos.dias.length > 1) lineas.push('', `*${fechaLarga(d.fecha)}*`);
    d.grupos.forEach((g) => {
      lineas.push('', `_${g.nombre}_`);
      g.paradas.forEach((p, i) => {
        const r = resultado(p);
        const hora = horaDe(p);
        const motivo = p.motivo && p.estado !== 'entregado' ? ` (${p.motivo})` : '';
        lineas.push(`${i + 1}. ${p.nombre} – ${r.texto}${hora ? ` ${hora}` : ''}${motivo}`);
      });
    });
  });
  window.open(linkWhatsApp('', lineas.join('\n')), '_blank', 'noopener');
});

$('btn-pdf').addEventListener('click', () => {
  const [desde, hasta] = fechasDelRango();
  const t = datos.total;
  $('presupuesto').innerHTML = `
    <span class="marca-pdf">${esc(ctx.equipo.modo !== 'solo' && ctx.equipo.nombre ? ctx.equipo.nombre : 'Vueltrack')}</span>
    <h1>Hoja de ruta</h1>
    <div class="tenue-pdf">${esc(textoRango(desde, hasta))} · ${esc(nombreDelFiltro())}</div>
    <div class="tenue-pdf">${t.paradas} destinos · ${t.hechas} hechos · ${t.noHechas} no se pudo · ${t.pendientes} pendientes · ${esc(formatoKm(t.km))}${
      t.tiempo ? ` · ${esc(formatoDuracion(t.tiempo))}` : ''
    }</div>
    ${datos.dias
      .map(
        (d) => `
      <h2>${esc(fechaLarga(d.fecha))}</h2>
      ${d.grupos
        .map(
          (g) => `
        <h3>${esc(g.nombre)}${g.vehiculo ? ` · ${esc(g.vehiculo)}` : ''}</h3>
        <table>
          <tr><th class="num">#</th><th>Destino</th><th>Tipo</th><th>Resultado</th><th class="num">Hora</th></tr>
          ${g.paradas
            .map((p, i) => {
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
              <td>${esc(resultado(p).texto)}</td>
              <td class="num">${esc(horaDe(p))}</td>
            </tr>`;
            })
            .join('')}
        </table>`
        )
        .join('')}`
      )
      .join('')}`;
  const titulo = document.title;
  document.title = `Vueltrack hoja de ruta ${desde === hasta ? desde : `${desde} a ${hasta}`}`;
  window.print();
  setTimeout(() => {
    document.title = titulo;
  }, 1000);
});

pintarFiltro();
pintarElegir();
cargar();
