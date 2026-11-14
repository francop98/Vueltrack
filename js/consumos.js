/* =========================================================
   Vueltrack — consumos de referencia y amortización
   Valores aproximados de consumo mixto (ciudad + ruta).
   Sirven de punto de partida: el fletero siempre puede corregirlos.
   ========================================================= */

/* Modelos comunes en Argentina, ordenados alfabéticamente.
   nafta / gasoil en km por litro. */
const MODELOS = [
  { claves: ['208'], nombre: 'Peugeot 208', nafta: 13 },
  { claves: ['amarok'], nombre: 'Volkswagen Amarok', gasoil: 10.5 },
  { claves: ['berlingo'], nombre: 'Citroën Berlingo', nafta: 10.5, gasoil: 15 },
  { claves: ['clio'], nombre: 'Renault Clio', nafta: 13 },
  { claves: ['corsa'], nombre: 'Chevrolet Corsa', nafta: 12 },
  { claves: ['cronos'], nombre: 'Fiat Cronos', nafta: 12.5 },
  { claves: ['daily'], nombre: 'Iveco Daily', gasoil: 8 },
  { claves: ['doblo'], nombre: 'Fiat Doblo', nafta: 9.5, gasoil: 13 },
  { claves: ['ducato'], nombre: 'Fiat Ducato', gasoil: 9 },
  { claves: ['duster'], nombre: 'Renault Duster', nafta: 10.5, gasoil: 14 },
  { claves: ['ecosport'], nombre: 'Ford EcoSport', nafta: 10.5 },
  { claves: ['etios'], nombre: 'Toyota Etios', nafta: 13 },
  { claves: ['express'], nombre: 'Renault Express', nafta: 11, gasoil: 15 },
  { claves: ['fiorino'], nombre: 'Fiat Fiorino', nafta: 11 },
  { claves: ['frontier'], nombre: 'Nissan Frontier', gasoil: 10.5 },
  { claves: ['gol'], nombre: 'Volkswagen Gol', nafta: 12.5 },
  { claves: ['hiace'], nombre: 'Toyota Hiace', gasoil: 9 },
  { claves: ['hilux'], nombre: 'Toyota Hilux', gasoil: 10 },
  { claves: ['ka'], nombre: 'Ford Ka', nafta: 13 },
  { claves: ['kangoo'], nombre: 'Renault Kangoo', nafta: 10.5, gasoil: 14 },
  { claves: ['logan'], nombre: 'Renault Logan', nafta: 12 },
  { claves: ['master'], nombre: 'Renault Master', gasoil: 9 },
  { claves: ['onix'], nombre: 'Chevrolet Onix', nafta: 13.5 },
  { claves: ['palio'], nombre: 'Fiat Palio', nafta: 12.5 },
  { claves: ['partner'], nombre: 'Peugeot Partner', nafta: 10.5, gasoil: 15 },
  { claves: ['ranger'], nombre: 'Ford Ranger', gasoil: 10 },
  { claves: ['s10'], nombre: 'Chevrolet S10', gasoil: 10 },
  { claves: ['sandero'], nombre: 'Renault Sandero', nafta: 12 },
  { claves: ['saveiro'], nombre: 'Volkswagen Saveiro', nafta: 11 },
  { claves: ['siena'], nombre: 'Fiat Siena', nafta: 12.5 },
  { claves: ['sprinter'], nombre: 'Mercedes-Benz Sprinter', gasoil: 9 },
  { claves: ['strada'], nombre: 'Fiat Strada', nafta: 11.5 },
  { claves: ['transit'], nombre: 'Ford Transit', gasoil: 9.5 },
  { claves: ['uno'], nombre: 'Fiat Uno', nafta: 13 }
];

/* Promedios por tipo de vehículo cuando no reconocemos el modelo */
const POR_TIPO = {
  auto: { nafta: 12, gasoil: 15, electrico: 6.5, km: 20000 },
  utilitario: { nafta: 10.5, gasoil: 14, electrico: 5, km: 30000 },
  camioneta: { nafta: 8.5, gasoil: 10.5, electrico: 4, km: 30000 },
  camion: { nafta: 4, gasoil: 5, electrico: 1.5, km: 50000 },
  moto: { nafta: 35, gasoil: 35, electrico: 20, km: 20000 }
};

/* El GNC rinde algo más por m³ que la nafta por litro */
const FACTOR_GNC = 1.1;

const normalizar = (texto) =>
  String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

function buscarModelo(nombre) {
  const palabras = normalizar(nombre).split(/[^a-z0-9]+/).filter(Boolean);
  return MODELOS.find((m) => m.claves.some((c) => palabras.includes(c))) || null;
}

/**
 * Rinde sugerido según el modelo escrito, el tipo y el combustible.
 * Devuelve { valor, origen } o null.
 */
export function rindeSugerido({ nombre, tipo, combustible }) {
  const modelo = buscarModelo(nombre);
  const base = POR_TIPO[tipo] || POR_TIPO.utilitario;

  if (combustible === 'electrico') {
    return { valor: base.electrico, origen: `promedio de ${nombreTipo(tipo)} eléctrico` };
  }

  const delModelo = modelo ? modelo[combustible === 'gnc' ? 'nafta' : combustible] : null;
  let valor = delModelo || base[combustible === 'gnc' ? 'nafta' : combustible];
  if (combustible === 'gnc') valor = Math.round(valor * FACTOR_GNC * 10) / 10;

  const origen = delModelo ? modelo.nombre : `promedio de ${nombreTipo(tipo)}`;
  return { valor, origen };
}

function nombreTipo(tipo) {
  return { auto: 'auto', utilitario: 'utilitario', camioneta: 'camioneta', camion: 'camión', moto: 'moto' }[tipo] || 'utilitario';
}

export function kmAnualesSugeridos(tipo) {
  return (POR_TIPO[tipo] || POR_TIPO.utilitario).km;
}

/**
 * Amortización y mantenimiento por km.
 * valor: lo que vale hoy el vehículo
 * anios: cuántos años pensás usarlo
 * kmAnio: km que hacés por año
 * reventa: % del valor que recuperás al venderlo
 * mantenimiento: gasto anual en service, cubiertas, seguro y patente (opcional)
 */
export function calcularAmortizacion({ valor, anios, kmAnio, reventa, mantenimiento }) {
  const v = Number(valor) || 0;
  const a = Number(anios) || 0;
  const k = Number(kmAnio) || 0;
  const r = Math.min(Math.max(Number(reventa) || 0, 0), 100);
  const m = Number(mantenimiento) || 0;
  if (!(a > 0) || !(k > 0) || (!(v > 0) && !(m > 0))) return null;

  const perdida = v * (1 - r / 100);
  const amortizacionKm = perdida / (a * k);
  const mantenimientoKm = m / k;
  return {
    amortizacionKm,
    mantenimientoKm,
    totalKm: Math.round((amortizacionKm + mantenimientoKm) * 10) / 10
  };
}
