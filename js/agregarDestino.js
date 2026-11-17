/* =========================================================
   Vueltrack — sumar un destino a una vuelta ya armada (desde Inicio)
   1) Se busca la dirección o el cliente.
   2) La app sugiere el fletero (zona + lo que lleva) y se puede cambiar.
   3) Si la vuelta ya estaba ordenada, el destino entra en el lugar
      que menos desvío agrega y se recalculan los horarios de ese fletero.
   ========================================================= */
import { crearBuscador, htmlBuscador } from './buscador.js';
import { escucharClientes, guardarVuelta, fleterosDelEquipo, obtenerVuelta } from './datos.js';
import { paradaNueva, paradaDesdeCliente, paradaHecha } from './vuelta.js';
import { activosDelDia, sugerirFletero } from './asignar.js';
import { selectorCargas, puedeLlevar, motivoNoLleva, htmlMinimo, conectarMinimo } from './cargas.js';
import { reordenarFletero, mensajeError, baseDeFletero } from './ordenar.js';
import { esc, abrirHoja, aviso, confirmar } from './ui.js';

function km(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/* Posición (dentro de las pendientes del fletero) que menos desvío agrega */
export function mejorLugar(nueva, pendientes, inicio, fin) {
  if (!Number.isFinite(nueva.lat) || !pendientes.length) return pendientes.length;
  const puntos = [inicio, ...pendientes, fin];
  let mejor = { i: pendientes.length, costo: Infinity };
  for (let i = 0; i < puntos.length - 1; i++) {
    const a = puntos[i];
    const b = puntos[i + 1];
    if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(b.lat)) continue;
    const costo = km(a, nueva) + km(nueva, b) - km(a, b);
    if (costo < mejor.costo) mejor = { i, costo };
  }
  return mejor.i;
}

/* Orden del fletero con la parada metida donde menos desvío agrega (ids, hechas primero) */
export function ordenConInsercion(equipo, vuelta, parada, uid) {
  const suyas = (vuelta.paradas || [])
    .filter((p) => p.fleteroUid === uid && p.id !== parada.id)
    .sort((a, b) => (a.orden || 0) - (b.orden || 0));
  const hechas = suyas.filter(paradaHecha);
  const pendientes = suyas.filter((p) => !paradaHecha(p));
  const base = baseDeFletero(equipo, uid);
  const inicio = hechas.length ? hechas[hechas.length - 1] : base;
  const fin = (equipo.ajustes || {}).volver === false ? null : base;
  const lugar = mejorLugar(parada, pendientes, inicio, fin);
  return [...hechas, ...pendientes.slice(0, lugar), parada, ...pendientes.slice(lugar)].map((p) => p.id);
}

/**
 * Suma destinos a una vuelta (ya con su fletero asignado en fleteroUid).
 * Si la vuelta estaba ordenada, cada uno entra en la ruta de su fletero donde
 * menos desvío agrega: el orden queda guardado al instante (aunque no haya
 * servicio de mapas) y después se recalculan los horarios de cada fletero tocado.
 * Devuelve { ordenada, posiciones: {id: número}, error }.
 */
export async function insertarEnRutas({ equipo, fecha, vuelta, nuevas }) {
  const todas = [...((vuelta && vuelta.paradas) || []), ...nuevas];
  if (!(vuelta && vuelta.ordenada)) {
    try {
      await guardarVuelta(equipo.id, fecha, { paradas: todas });
      return { ordenada: false, posiciones: {} };
    } catch (e) {
      return { ordenada: false, posiciones: {}, error: 'No se pudo agregar. Revisá la conexión.' };
    }
  }
  // Orden nuevo de cada fletero, metiendo los destinos de a uno
  let estado = { ...vuelta, paradas: todas };
  const ordenes = new Map();
  nuevas.forEach((n) => {
    const ids = ordenConInsercion(equipo, estado, n, n.fleteroUid);
    ordenes.set(n.fleteroUid, ids);
    const pos = new Map(ids.map((id, i) => [id, i + 1]));
    estado = { ...estado, paradas: estado.paradas.map((p) => (pos.has(p.id) && p.fleteroUid === n.fleteroUid ? { ...p, orden: pos.get(p.id) } : p)) };
  });
  const posiciones = {};
  nuevas.forEach((n) => {
    posiciones[n.id] = (ordenes.get(n.fleteroUid) || []).indexOf(n.id) + 1;
  });
  try {
    // El orden queda guardado ya; los horarios se recalculan después
    await guardarVuelta(equipo.id, fecha, { paradas: estado.paradas, ordenada: true });
  } catch (e) {
    return { ordenada: true, posiciones, error: 'No se pudo agregar. Revisá la conexión.' };
  }
  aviso('Recalculando horarios…');
  let error = '';
  for (const [uid, ordenManual] of ordenes) {
    try {
      const actual = (await obtenerVuelta(equipo.id, fecha).catch(() => null)) || estado;
      await reordenarFletero({ equipo, fecha, vuelta: actual, uid, orden: 'manual', ordenManual });
    } catch (e) {
      error = `Quedó en su lugar de la ruta, pero no se pudieron recalcular los horarios. ${mensajeError(e)}`;
    }
  }
  return { ordenada: true, posiciones, error };
}

export function abrirAgregarDestino({ ctx, fecha, vuelta }) {
  const equipo = ctx.equipo;
  const fleteros = fleterosDelEquipo(equipo).filter((f) => !f.temporal || f.temporal === fecha);
  const activos = activosDelDia(vuelta, fleteros);
  const varios = activos.length > 1;
  let clientes = [];
  let elegido = null; // parada armada a partir de lo buscado
  let uidElegido = null;
  let cargasElegidas = () => [];
  let minimoElegido = () => (elegido && elegido.vehiculoMinimo) || '';
  let cortar = null;

  const hoja = abrirHoja({
    titulo: 'Agregar destino',
    html: `
      ${htmlBuscador('ad-dir', 'Dirección o cliente', 'Dirección, cliente o nombre del lugar')}
      <div id="ad-paso2" class="seccion oculto">
        <div class="campo"><label for="ad-nombre">Nombre</label><input id="ad-nombre" placeholder="Nombre del destino" autocomplete="off"></div>
        <div class="campo"><span class="etiqueta-campo">Tipo</span>
          <div class="chips" id="ad-tipo">
            <button type="button" class="chip activo" data-tipo="retiro" aria-pressed="true">Retiro</button>
            <button type="button" class="chip" data-tipo="entrega" aria-pressed="false">Entrega</button>
          </div>
        </div>
        <div class="grilla-2 siempre">
          <div class="campo"><label for="ad-desde">Recibe desde</label><input id="ad-desde" type="time" class="input"></div>
          <div class="campo"><label for="ad-hasta">Cierra (tope)</label><input id="ad-hasta" type="time" class="input"></div>
        </div>
        <div id="ad-cargas" class="seccion"></div>
        <div class="campo ${varios ? '' : 'oculto'}"><span class="etiqueta-campo">Fletero</span>
          <div class="chips" id="ad-fleteros"></div>
          <span class="texto-tenue" id="ad-sugerido"></span>
        </div>
        <button type="button" class="btn btn-primario btn-grande" id="ad-agregar">Agregar a la vuelta</button>
      </div>`,
    alCerrar: () => cortar && cortar()
  });
  const el = hoja.el;
  cortar = escucharClientes(equipo.id, (lista) => {
    clientes = lista;
  });
  let tipo = 'retiro';

  const pintarFleteros = () => {
    if (!varios || !elegido) return;
    const prueba = { ...elegido, cargas: cargasElegidas(), vehiculoMinimo: minimoElegido() };
    el.querySelector('#ad-fleteros').innerHTML = activos
      .map((f) => {
        const apto = puedeLlevar(prueba, f, vuelta);
        const activo = f.uid === uidElegido;
        return `<button type="button" class="chip ${activo ? 'activo' : ''} ${apto ? '' : 'tachado'}" data-uid="${esc(f.uid)}" aria-pressed="${activo}"><i class="punto" style="background:${esc(f.color)}"></i>${esc(f.nombre)}</button>`;
      })
      .join('');
  };

  const sugerir = () => {
    const prueba = { ...elegido, cargas: cargasElegidas(), vehiculoMinimo: minimoElegido() };
    uidElegido = sugerirFletero(prueba, (vuelta && vuelta.paradas) || [], activos, vuelta);
    const f = activos.find((x) => x.uid === uidElegido);
    el.querySelector('#ad-sugerido').textContent = f ? `Sugerido: ${f.nombre}, por la zona y lo que lleva.` : '';
    pintarFleteros();
  };

  const mostrarPaso2 = () => {
    el.querySelector('#ad-paso2').classList.remove('oculto');
    el.querySelector('#ad-nombre').value = elegido.nombre;
    el.querySelector('#ad-desde').value = elegido.desde || '';
    el.querySelector('#ad-hasta').value = elegido.hasta || '';
    if (equipo.modo === 'equipo') {
      const sel = selectorCargas(equipo, elegido.cargas || [], { id: 'ad-c', titulo: 'Mercadería' });
      el.querySelector('#ad-cargas').innerHTML = sel.html + htmlMinimo('ad-minimo', elegido.vehiculoMinimo);
      cargasElegidas = sel.conectar(el.querySelector('#ad-cargas'));
      minimoElegido = conectarMinimo(el.querySelector('#ad-cargas'), 'ad-minimo', elegido.vehiculoMinimo);
      el.querySelector('#ad-cargas').addEventListener('click', () => setTimeout(sugerir, 0));
    }
    sugerir();
  };

  crearBuscador(el.querySelector('#ad-dir'), {
    foco: () => equipo.base,
    clientes: () => clientes,
    alElegir: (r) => {
      if (r.tipo === 'cliente') {
        const c = clientes.find((x) => x.id === r.clienteId);
        if (!c) return;
        elegido = paradaDesdeCliente(c);
      } else {
        elegido = paradaNueva({ nombre: r.nombre || r.direccion, direccion: r.direccion || r.nombre, lat: r.lat, lng: r.lng, cargas: [] });
      }
      el.querySelector('#ad-dir').value = elegido.direccion;
      mostrarPaso2();
    }
  });

  el.querySelector('#ad-tipo').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tipo]');
    if (!b) return;
    tipo = b.dataset.tipo;
    el.querySelectorAll('#ad-tipo [data-tipo]').forEach((x) => {
      x.classList.toggle('activo', x === b);
      x.setAttribute('aria-pressed', x === b);
    });
  });

  el.querySelector('#ad-fleteros').addEventListener('click', (e) => {
    const b = e.target.closest('[data-uid]');
    if (!b) return;
    uidElegido = b.dataset.uid;
    pintarFleteros();
  });

  let agregando = false;
  el.querySelector('#ad-agregar').addEventListener('click', async () => {
    if (agregando || !elegido) return;
    const desde = el.querySelector('#ad-desde').value;
    const hasta = el.querySelector('#ad-hasta').value;
    if (desde && hasta && desde >= hasta) {
      aviso('El horario “desde” tiene que ser antes que el de cierre');
      return;
    }
    const uid = uidElegido || (activos[0] && activos[0].uid) || ctx.user.uid;
    const f = activos.find((x) => x.uid === uid);
    const nueva = {
      ...elegido,
      nombre: el.querySelector('#ad-nombre').value.trim() || elegido.direccion,
      tipo,
      desde,
      hasta,
      cargas: cargasElegidas(),
      vehiculoMinimo: minimoElegido(),
      fleteroUid: uid
    };
    if (f && !puedeLlevar(nueva, f, vuelta)) {
      const ok = await confirmar({
        titulo: `${f.nombre}: ${motivoNoLleva(nueva, f, vuelta)}`,
        texto: '¿Se lo asignás igual?',
        aceptar: 'Asignar igual'
      });
      if (!ok) return;
      nueva.fleteroFijo = true;
    }
    agregando = true;
    hoja.cerrar();

    const r = await insertarEnRutas({ equipo, fecha, vuelta, nuevas: [nueva] });
    if (r.error) aviso(r.error);
    else aviso(r.ordenada ? `${nueva.nombre} quedó en la parada ${r.posiciones[nueva.id]}${f && varios ? ` de ${f.nombre}` : ''}` : `${nueva.nombre} sumado a la vuelta`);
  });

  el.querySelector('#ad-dir').focus();
}
