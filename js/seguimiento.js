/* =========================================================
   Vueltrack — página pública de seguimiento para el cliente
   No pide sesión: se abre con el link que manda el fletero.
   ========================================================= */
import { escucharSeguimiento } from './datos.js';
import { fechaISO, fechaLarga, horaDeSegundos } from './ui.js';

const $ = (id) => document.getElementById(id);
const token = new URLSearchParams(location.search).get('t');

function mostrar({ sobre, titulo, texto = '', antes = null, hora = null }) {
  $('estado-sobre').textContent = sobre;
  $('estado-titulo').textContent = titulo;
  $('estado-texto').textContent = texto;
  const conDatos = antes != null || hora != null;
  $('datos').classList.toggle('oculto', !conDatos);
  if (conDatos) {
    $('dato-antes').textContent = antes == null ? '—' : antes;
    $('dato-antes-nombre').textContent = antes === 1 ? 'parada antes' : 'paradas antes';
    $('dato-hora').textContent = hora || '—';
  }
}

if (!token) {
  mostrar({ sobre: 'Seguimiento', titulo: 'Link incompleto', texto: 'Pedile a quien te lo mandó que te lo reenvíe.' });
} else {
  escucharSeguimiento(
    token,
    (d) => {
      if (!d) {
        mostrar({ sobre: 'Seguimiento', titulo: 'No encontramos este envío', texto: 'Puede que el link haya cambiado. Pedile uno nuevo a quien te lo mandó.' });
        return;
      }
      document.title = `${d.equipo || 'Tu entrega'} · seguimiento`;
      $('equipo').textContent = d.equipo || '';
      const que = d.tipo === 'retiro' ? 'retiro' : 'entrega';
      const quien = d.fletero ? `${d.fletero} ` : '';
      const hoy = d.fecha === fechaISO();
      const sobre = `${d.tipo === 'retiro' ? 'Tu retiro' : 'Tu entrega'}${d.cliente ? ` · ${d.cliente}` : ''}`;

      if (d.estado === 'entregado') {
        mostrar({ sobre, titulo: d.tipo === 'retiro' ? '¡Retirado!' : '¡Entregado!', texto: d.horaEstado ? `A las ${d.horaEstado}.` : '' });
      } else if (d.estado === 'reprogramado') {
        mostrar({ sobre, titulo: 'Se pasó para otro día', texto: `${quien}te va a avisar cuándo pasa.` });
      } else if (d.estado === 'noEstaba' || d.estado === 'rechazado') {
        mostrar({ sobre, titulo: 'No se pudo completar', texto: `${quien}pasó${d.horaEstado ? ` a las ${d.horaEstado}` : ''}. Comunicate para coordinar.` });
      } else if (!hoy) {
        mostrar({ sobre, titulo: `Programada para el ${fechaLarga(d.fecha).toLowerCase()}`, texto: 'Ese día vas a ver acá cuánto falta.' });
      } else if (d.antes === 0) {
        mostrar({
          sobre,
          titulo: `${quien}va para allá`,
          texto: `Sos la próxima ${que}.`,
          antes: 0,
          hora: d.llegada != null ? horaDeSegundos(d.llegada) : null
        });
      } else {
        mostrar({
          sobre,
          titulo: 'Tu ' + que + ' está en camino',
          texto: `Hay ${d.antes} ${d.antes === 1 ? 'parada' : 'paradas'} antes que la tuya.`,
          antes: d.antes,
          hora: d.llegada != null ? horaDeSegundos(d.llegada) : null
        });
      }
      const ts = d.actualizado && d.actualizado.toDate ? d.actualizado.toDate() : null;
      $('actualizado').textContent = ts ? `Actualizado a las ${ts.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : '';
    },
    () => mostrar({ sobre: 'Seguimiento', titulo: 'No se pudo cargar', texto: 'Revisá la conexión y volvé a abrir el link.' })
  );
}
