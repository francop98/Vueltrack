/* =========================================================
   Vueltrack — instalar como app
   Android / Chrome: muestra el cartel del navegador.
   iPhone (Safari): explica cómo agregarla a la pantalla de inicio.
   ========================================================= */
import { abrirHoja, aviso } from './ui.js';

export function estaInstalada() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function esIPhone() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/* Se puede ofrecer instalar si no está instalada todavía */
export function sePuedeInstalar() {
  return !estaInstalada();
}

const COMPARTIR =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';

export async function instalarApp() {
  if (estaInstalada()) {
    aviso('Vueltrack ya está instalada en este celular');
    return;
  }
  const evento = window.vueltrackInstalar;
  if (evento) {
    evento.prompt();
    const { outcome } = await evento.userChoice;
    window.vueltrackInstalar = null;
    if (outcome === 'accepted') aviso('¡Listo! Vueltrack quedó en tu pantalla de inicio');
    return;
  }
  if (esIPhone()) {
    abrirHoja({
      titulo: 'Instalar en iPhone',
      html: `
        <ol class="pasos">
          <li>Abrí Vueltrack en <strong>Safari</strong>.</li>
          <li>Tocá el botón <strong>Compartir</strong> <span class="icono-texto">${COMPARTIR}</span> de abajo.</li>
          <li>Elegí <strong>Agregar a pantalla de inicio</strong>.</li>
          <li>Tocá <strong>Agregar</strong>. Vueltrack queda como una app más.</li>
        </ol>`
    });
    return;
  }
  abrirHoja({
    titulo: 'Instalar la app',
    html: `
      <ol class="pasos">
        <li>Abrí el menú del navegador (los tres puntos ⋮ arriba a la derecha).</li>
        <li>Elegí <strong>Instalar app</strong> o <strong>Agregar a pantalla de inicio</strong>.</li>
        <li>Confirmá. Vueltrack queda como una app más.</li>
      </ol>`
  });
}
