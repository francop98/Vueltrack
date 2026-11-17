/* =========================================================
   Vueltrack — hoja de ruta en PDF (con el diseño de la app)
   Se arma el archivo en el celular con jsPDF (se carga recién al usarlo),
   así funciona también en la app instalada en iPhone, donde no hay
   "imprimir". Después se comparte (WhatsApp, Archivos, Imprimir…)
   o se descarga.
   ========================================================= */

const JSPDF = 'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js';

const C = {
  fondo: '#0E1420',
  tarjeta: '#172033',
  linea: '#222C44',
  tinta: '#EEF1F6',
  tenue: '#A3ACBC',
  acento: '#F07A2B',
  ok: '#3DBE74',
  okSuave: '#143424',
  okTexto: '#7EDBA5',
  no: '#F97066',
  noSuave: '#3A1D1F',
  noTexto: '#F8B4AE',
  neutro: '#1F2940'
};

let cargando = null;
function cargarJsPDF() {
  if (window.jspdf) return Promise.resolve(window.jspdf);
  if (!cargando) {
    cargando = new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = JSPDF;
      s.onload = () => (window.jspdf ? ok(window.jspdf) : mal(new Error('jspdf')));
      s.onerror = () => {
        cargando = null;
        mal(new Error('jspdf'));
      };
      document.head.appendChild(s);
    });
  }
  return cargando;
}

/* Corta un texto para que entre en el ancho (con "…") */
function recortar(doc, texto, ancho) {
  let t = String(texto || '');
  if (doc.getTextWidth(t) <= ancho) return t;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > ancho) t = t.slice(0, -1);
  return `${t}…`;
}

/**
 * hoja = {
 *   equipo, sobre, titulo, stats: [[valor, nombre]],
 *   dias: [{ titulo, resumen, grupos: [{ nombre, color, resumen,
 *            filas: [{ num, nombre, detalle, resultado, clase: 'ok'|'no'|'pendiente', hora }] }] }],
 *   pie, archivo
 * }
 */
export async function armarPdf(hoja) {
  const { jsPDF } = await cargarJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const ANCHO = 210;
  const ALTO = 297;
  const M = 12;
  const UTIL = ANCHO - M * 2;
  const ABAJO = ALTO - 14;
  let y = M;

  const fondo = () => {
    doc.setFillColor(C.fondo);
    doc.rect(0, 0, ANCHO, ALTO, 'F');
  };
  const nuevaPagina = () => {
    doc.addPage();
    fondo();
    y = M;
  };
  const lugar = (alto) => {
    if (y + alto > ABAJO) nuevaPagina();
  };
  const texto = (t, x, yy, { tam = 9, color = C.tinta, negrita = false, alinear = 'left' } = {}) => {
    doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    doc.setFontSize(tam);
    doc.setTextColor(color);
    doc.text(String(t), x, yy, { align: alinear });
  };

  fondo();

  // Marca
  doc.setFillColor(C.tarjeta);
  doc.roundedRect(M, y, 9, 9, 2.2, 2.2, 'F');
  doc.setDrawColor(C.acento);
  doc.setLineWidth(0.9);
  doc.lines([[2.2, -5.5], [3.6, 1], [0.2, 3.2]], M + 2.4, y + 6.6, [1, 1], 'S', false);
  doc.setFillColor('#FFFFFF');
  doc.circle(M + 2.4, y + 6.6, 0.9, 'F');
  texto('vuel', M + 11.5, y + 6.6, { tam: 14, negrita: true });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  texto('track', M + 11.5 + doc.getTextWidth('vuel'), y + 6.6, { tam: 14, negrita: true, color: C.acento });
  if (hoja.equipo) texto(hoja.equipo, ANCHO - M, y + 6.2, { tam: 10, negrita: true, color: C.acento, alinear: 'right' });
  y += 17;

  // Título
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  texto(recortar(doc, hoja.sobre, UTIL), M, y, { tam: 9, color: C.tenue });
  y += 8;
  texto(hoja.titulo, M, y, { tam: 22, negrita: true });
  y += 8;

  // Números
  const n = hoja.stats.length;
  const gap = 2.5;
  const anchoStat = (UTIL - gap * (n - 1)) / n;
  hoja.stats.forEach(([valor, nombre], i) => {
    const x = M + i * (anchoStat + gap);
    doc.setFillColor(C.tarjeta);
    doc.roundedRect(x, y, anchoStat, 15, 2.5, 2.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    texto(recortar(doc, valor, anchoStat - 6), x + 3, y + 7, { tam: 12, negrita: true });
    texto(nombre, x + 3, y + 12, { tam: 7.5, color: C.tenue });
  });
  y += 22;

  const ALTO_FILA = 11;
  hoja.dias.forEach((dia) => {
    lugar(10 + 10 + ALTO_FILA);
    texto(dia.titulo, M, y + 4, { tam: 12, negrita: true });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    if (dia.resumen) texto(dia.resumen, M + doc.getTextWidth(dia.titulo) + 3, y + 4, { tam: 8.5, color: C.tenue });
    y += 8;

    dia.grupos.forEach((g) => {
      lugar(10 + ALTO_FILA);
      // Cabecera del fletero
      doc.setFillColor(C.tarjeta);
      doc.roundedRect(M, y, UTIL, 10, 2.5, 2.5, 'F');
      doc.rect(M, y + 5, UTIL, 5, 'F');
      doc.setFillColor(g.color || C.tenue);
      doc.circle(M + 4.5, y + 5, 1.4, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      texto(recortar(doc, g.nombre, UTIL / 2), M + 8, y + 6.4, { tam: 10, negrita: true });
      if (g.resumen) texto(g.resumen, ANCHO - M - 4, y + 6.4, { tam: 8, color: C.tenue, alinear: 'right' });
      y += 10;

      g.filas.forEach((f, i) => {
        if (y + ALTO_FILA > ABAJO) nuevaPagina();
        const ultima = i === g.filas.length - 1;
        doc.setFillColor(C.tarjeta);
        if (ultima) {
          doc.roundedRect(M, y, UTIL, ALTO_FILA, 2.5, 2.5, 'F');
          doc.rect(M, y, UTIL, 4, 'F');
        } else {
          doc.rect(M, y, UTIL, ALTO_FILA, 'F');
        }
        doc.setDrawColor(C.linea);
        doc.setLineWidth(0.2);
        doc.line(M + 4, y, ANCHO - M - 4, y);

        // Número
        const colorNum = f.clase === 'ok' ? C.ok : f.clase === 'no' ? C.no : C.neutro;
        doc.setFillColor(colorNum);
        doc.circle(M + 6.5, y + ALTO_FILA / 2, 3, 'F');
        texto(f.num, M + 6.5, y + ALTO_FILA / 2 + 1.1, {
          tam: 8,
          negrita: true,
          color: f.clase === 'ok' ? '#06200F' : f.clase === 'no' ? '#2A0B08' : C.tinta,
          alinear: 'center'
        });

        // Resultado (pastilla) y hora
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        const anchoPill = doc.getTextWidth(f.resultado) + 5;
        const xPill = ANCHO - M - 4 - anchoPill;
        doc.setFillColor(f.clase === 'ok' ? C.okSuave : f.clase === 'no' ? C.noSuave : C.neutro);
        doc.roundedRect(xPill, y + 1.8, anchoPill, 4.2, 2.1, 2.1, 'F');
        texto(f.resultado, xPill + anchoPill / 2, y + 4.8, {
          tam: 7.5,
          negrita: true,
          color: f.clase === 'ok' ? C.okTexto : f.clase === 'no' ? C.noTexto : C.tenue,
          alinear: 'center'
        });
        if (f.hora) texto(f.hora, ANCHO - M - 4, y + 9.2, { tam: 7.5, color: C.tenue, alinear: 'right' });

        // Nombre y detalle
        const anchoTexto = xPill - (M + 12) - 4;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        texto(recortar(doc, f.nombre, anchoTexto), M + 12, y + 4.6, { tam: 9, negrita: true });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        texto(recortar(doc, f.detalle, anchoTexto), M + 12, y + 8.8, { tam: 7.5, color: C.tenue });
        y += ALTO_FILA;
      });
      y += 4;
    });
    y += 2;
  });

  // Pie en cada página
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    texto(`${hoja.pie}${paginas > 1 ? ` · Página ${i} de ${paginas}` : ''}`, ANCHO / 2, ALTO - 7, { tam: 7.5, color: C.tenue, alinear: 'center' });
  }
  return doc.output('blob');
}

/* Arma el PDF y lo comparte (celular) o lo descarga (computadora) */
export async function descargarPdf(hoja) {
  const blob = await armarPdf(hoja);
  const archivo = new File([blob], hoja.archivo, { type: 'application/pdf' });
  const esCelular = window.matchMedia('(pointer: coarse)').matches;
  if (esCelular && navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: hoja.titulo });
      return 'compartido';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelado';
    }
  }
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = hoja.archivo;
  document.body.appendChild(enlace);
  enlace.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    enlace.remove();
  }, 4000);
  return 'descargado';
}
