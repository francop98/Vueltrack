/* =========================================================
   Vueltrack — utilidades de interfaz y formato
   ========================================================= */

export const ICONOS = {
  ruta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7"/></svg>',
  armar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/></svg>',
  clientes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/></svg>',
  equipo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M2 6h11v10H2zM13 10h4l4 4v2h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
  navegar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l18-8-8 18-2-8z"/></svg>',
  telefono: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
  mensaje: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
  cruz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  mas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  lapiz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  basura: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  volver: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  puntos: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  inicio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M5 16V11l2-5h10l2 5v5M3 16h18v3h-3v-1H6v1H3zM5 11h14"/><circle cx="7.5" cy="13.5" r="1"/><circle cx="16.5" cy="13.5" r="1"/></svg>',
  ubicacion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  ordenar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/></svg>',
  cuenta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  ojo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  ojoTachado: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.4 4.5-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  descargar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
  ayuda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5M12 17h.01"/></svg>',
  estrella: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>'
};

/* Colores de fleteros: se distinguen también por claridad */
export const COLORES_FLETERO = ['#E8681F', '#2563EB', '#0E9F8E', '#8B5CF6', '#D9467A', '#A16207', '#475569', '#16A34A'];

export function esc(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------- Fechas y horas ---------- */

export function fechaISO(fecha = new Date()) {
  const a = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

export function fechaDesdeISO(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function fechaLarga(iso) {
  const f = fechaDesdeISO(iso);
  return `${DIAS[f.getDay()]} ${f.getDate()} de ${MESES[f.getMonth()]}`;
}

export function fechaCorta(iso) {
  const f = fechaDesdeISO(iso);
  const hoy = fechaISO();
  const manana = fechaISO(new Date(Date.now() + 86400000));
  if (iso === hoy) return 'Hoy';
  if (iso === manana) return 'Mañana';
  return `${DIAS_CORTOS[f.getDay()]} ${f.getDate()}/${f.getMonth() + 1}`;
}

export function diaSemana(iso) {
  return fechaDesdeISO(iso).getDay();
}

export function segundosDeHora(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 3600 + (m || 0) * 60;
}

export function horaDeSegundos(seg) {
  if (seg == null || isNaN(seg)) return '—';
  const total = Math.round(seg / 60);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/* Hora actual redondeada hacia arriba (por defecto, a los próximos 5 minutos) */
export function horaAhora(redondeo = 5) {
  const a = new Date();
  let min = a.getHours() * 60 + a.getMinutes();
  min = Math.ceil(min / redondeo) * redondeo;
  const h = Math.floor(min / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export function segundosAhora() {
  const a = new Date();
  return a.getHours() * 3600 + a.getMinutes() * 60 + a.getSeconds();
}

export function formatoDuracion(seg) {
  if (seg == null || isNaN(seg)) return '—';
  const min = Math.round(seg / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

export function formatoKm(metros) {
  if (metros == null || isNaN(metros)) return '—';
  if (metros < 1000) return `${Math.round(metros)} m`;
  return `${Math.round(metros / 1000)} km`;
}

export function formatoPlata(valor) {
  if (valor == null || isNaN(valor)) return '—';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(valor);
}

/* ---------- Textos ---------- */

export function iniciales(nombre) {
  const partes = String(nombre || '?').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

export function primeraLetra(nombre) {
  return String(nombre || '#').trim().charAt(0).toLocaleUpperCase('es') || '#';
}

export function sinTildes(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function ordenarAlfa(lista, campo = 'nombre') {
  return [...lista].sort((a, b) =>
    String(a[campo] || '').localeCompare(String(b[campo] || ''), 'es', { sensitivity: 'base' })
  );
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function idNuevo() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------- Enlaces externos ---------- */

export function linkGoogleMaps(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

/* Google Maps acepta hasta 10 paradas por viaje (9 intermedias + destino).
   Sin origen: arranca desde donde está el celular. */
export const PARADAS_POR_TRAMO = 10;

export function linkGoogleMapsVuelta(paradas) {
  const tramo = paradas.slice(0, PARADAS_POR_TRAMO);
  if (!tramo.length) return '';
  const destino = tramo[tramo.length - 1];
  const intermedias = tramo.slice(0, -1).map((p) => `${p.lat},${p.lng}`).join('|');
  const q = new URLSearchParams({
    api: '1',
    destination: `${destino.lat},${destino.lng}`,
    travelmode: 'driving',
    dir_action: 'navigate'
  });
  if (intermedias) q.set('waypoints', intermedias);
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

export function linkWaze(lat, lng) {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

export function telefonoLimpio(tel) {
  return String(tel || '').replace(/[^\d+]/g, '');
}

export function linkTel(tel) {
  return `tel:${telefonoLimpio(tel)}`;
}

/* Normaliza un celular argentino para WhatsApp (549 + área + número) */
export function numeroWhatsApp(tel) {
  let n = String(tel || '').replace(/\D/g, '');
  if (!n) return '';
  if (n.startsWith('00')) n = n.slice(2);
  if (n.startsWith('54')) {
    n = n.slice(2);
    if (n.startsWith('9')) n = n.slice(1);
  }
  if (n.startsWith('0')) n = n.slice(1);
  n = n.replace(/^(\d{2,4})15(\d{6,8})$/, '$1$2');
  return '549' + n;
}

export function linkWhatsApp(tel, texto) {
  const numero = numeroWhatsApp(tel);
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto || '')}`;
}

/* ---------- Avisos, confirmaciones y hojas ---------- */

let avisoTimer;
export function aviso(texto) {
  let el = document.getElementById('aviso-global');
  if (!el) {
    el = document.createElement('div');
    el.id = 'aviso-global';
    el.className = 'aviso';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = texto;
  el.classList.remove('oculto');
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => el.classList.add('oculto'), 2800);
}

export function confirmar({ titulo, texto = '', aceptar = 'Aceptar', cancelar = 'Cancelar', peligro = false }) {
  return new Promise((resolver) => {
    const velo = document.createElement('div');
    velo.className = 'velo centrado';
    velo.innerHTML = `
      <div class="dialogo" role="dialog" aria-modal="true" aria-labelledby="dialogo-titulo">
        <h2 id="dialogo-titulo">${esc(titulo)}</h2>
        ${texto ? `<p>${esc(texto)}</p>` : ''}
        <div class="botonera">
          <button type="button" class="btn" data-r="no">${esc(cancelar)}</button>
          <button type="button" class="btn btn-primario" data-r="si">${esc(aceptar)}</button>
        </div>
      </div>`;
    if (peligro) velo.querySelector('[data-r="si"]').classList.add('btn-peligro-fondo');
    const cerrar = (r) => {
      velo.remove();
      resolver(r);
    };
    velo.addEventListener('click', (e) => {
      if (e.target === velo) cerrar(false);
      const b = e.target.closest('[data-r]');
      if (b) cerrar(b.dataset.r === 'si');
    });
    document.body.appendChild(velo);
    velo.querySelector('[data-r="si"]').focus();
  });
}

export function abrirHoja({ titulo, html, alCerrar }) {
  const velo = document.createElement('div');
  velo.className = 'velo';
  velo.innerHTML = `
    <div class="hoja" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <span class="hoja-agarre" aria-hidden="true"></span>
      <div class="hoja-cabecera">
        <h2>${esc(titulo)}</h2>
        <button type="button" class="btn-icono sin-borde" data-cerrar aria-label="Cerrar">${ICONOS.cruz}</button>
      </div>
      <div class="hoja-cuerpo seccion">${html}</div>
    </div>`;
  const cerrar = () => {
    velo.remove();
    document.removeEventListener('keydown', teclas);
    if (alCerrar) alCerrar();
  };
  const teclas = (e) => {
    if (e.key === 'Escape') cerrar();
  };
  velo.addEventListener('click', (e) => {
    if (e.target === velo || e.target.closest('[data-cerrar]')) cerrar();
  });
  document.addEventListener('keydown', teclas);
  document.body.appendChild(velo);
  return { el: velo.querySelector('.hoja-cuerpo'), cerrar };
}

export function botonCargando(boton, cargando, textoOriginal) {
  if (cargando) {
    boton.dataset.texto = boton.innerHTML;
    boton.disabled = true;
    boton.innerHTML = '<span class="girando" aria-hidden="true"></span> Calculando…';
  } else {
    boton.disabled = false;
    boton.innerHTML = textoOriginal || boton.dataset.texto || boton.innerHTML;
  }
}

/* ---------- Navegación inferior ---------- */

export function pintarNav(activa, { organizador }) {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const items = [
    { id: 'inicio', href: '/', texto: 'Inicio', icono: ICONOS.inicio, ver: true },
    { id: 'hoy', href: '/pages/hoy.html', texto: 'Hoy', icono: ICONOS.ruta, ver: true },
    { id: 'armar', href: '/pages/armar.html', texto: 'Armar', icono: ICONOS.armar, ver: organizador },
    { id: 'clientes', href: '/pages/clientes.html', texto: 'Clientes', icono: ICONOS.clientes, ver: organizador },
    { id: 'equipo', href: '/pages/equipo.html', texto: 'Equipo', icono: ICONOS.equipo, ver: true }
  ];
  nav.innerHTML = `<div class="nav-inferior-interno">${items
    .filter((i) => i.ver)
    .map(
      (i) =>
        `<a href="${i.href}" class="${i.id === activa ? 'activo' : ''}" ${i.id === activa ? 'aria-current="page"' : ''}>${i.icono}${i.texto}</a>`
    )
    .join('')}</div>`;
}

/* ---------- Mostrar / ocultar contraseñas ---------- */

export function activarVerClave(raiz = document) {
  raiz.querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.closest('.campo-clave')) return;
    const caja = document.createElement('span');
    caja.className = 'campo-clave';
    input.parentNode.insertBefore(caja, input);
    caja.appendChild(input);
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'ver-clave';
    boton.setAttribute('aria-label', 'Mostrar contraseña');
    boton.setAttribute('aria-pressed', 'false');
    boton.innerHTML = ICONOS.ojo;
    boton.addEventListener('click', () => {
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      boton.innerHTML = visible ? ICONOS.ojo : ICONOS.ojoTachado;
      boton.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
      boton.setAttribute('aria-pressed', String(!visible));
      input.focus();
    });
    caja.appendChild(boton);
  });
}
