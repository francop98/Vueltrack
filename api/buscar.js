/* =========================================================
   GET /api/buscar?texto=...&lat=...&lng=...
   Sugerencias de direcciones y de lugares (comercios, empresas).

   Si el texto tiene altura ("Sarmiento 100") busca una DIRECCIÓN:
     1. Georef (servicio oficial de direcciones de Argentina)
     2. OpenRouteService · autocompletar y búsqueda
     3. Nominatim (OpenStreetMap)
   Si no tiene altura ("Ferretería Don Luis") busca un LUGAR por nombre:
     1. OpenRouteService · autocompletar (comercios y calles)
     2. Photon (bueno para nombres de lugares)
     3. Nominatim
     4. Overpass: todo lo cargado en OpenStreetMap cerca del punto de salida
   Casos especiales (se prueban primero):
     Esquinas ("Alsina y Chiclana"): Georef y, si no, el cruce de las dos calles en OpenStreetMap.
     Rutas con kilómetro ("Ruta 3 km 696"): mojón de ese km en OpenStreetMap (o el más cercano).
   Prioridad: primero lo que está en tu localidad, después en tu provincia
   y después el resto, ordenado por cercanía al punto de salida.
   Cada resultado trae:
     nombre    nombre del lugar (solo si es un comercio o empresa)
     direccion calle y altura
     detalle   ciudad, provincia y aclaraciones
     tipo      "direccion" | "lugar" | "calle"
   ========================================================= */
import {
  verificarUsuario,
  pedirORS,
  pedirNominatim,
  pedirGeoref,
  pedirPhoton,
  pedirOverpass,
  consultarOverpass,
  patronOverpass,
  responder
} from './_comun.js';

const MAX = 7;

function separarAltura(texto) {
  // Toma el último número como altura ("Av. 9 de Julio 1200" → calle "Av. 9 de Julio", altura 1200)
  const m = texto.match(/^(.*\D)\s+(?:n[°º]?\s*)?(\d{1,5})\b\s*,?\s*(.*)$/i);
  if (!m || !m[1].trim()) return { calle: texto, numero: null };
  return { calle: m[1].replace(/,\s*$/, '').trim(), numero: m[2] };
}

function nombrePropio(texto) {
  return String(texto || '')
    .toLowerCase()
    .replace(/(^|[\s.(-])([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\b(De|Del|La|Las|Los|Y)\b/g, (m) => m.toLowerCase())
    .replace(/^./, (c) => c.toUpperCase());
}

function sinTildes(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function coincide(a, b) {
  const x = sinTildes(a);
  const y = sinTildes(b);
  return !!x && !!y && (x.includes(y) || y.includes(x));
}

function distanciaKm(a, b) {
  if (!a || !b) return 0;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

function armarDireccion(calle, altura) {
  return calle ? `${calle}${altura ? ' ' + altura : ''}` : '';
}

/* ---------- Georef ---------- */

const zonas = new Map();
async function zonaDe(foco) {
  if (!foco) return null;
  const clave = `${foco.lat.toFixed(2)},${foco.lng.toFixed(2)}`;
  if (zonas.has(clave)) return zonas.get(clave);
  const datos = await pedirGeoref('ubicacion', { lat: foco.lat, lon: foco.lng });
  const u = datos.ubicacion || {};
  const zona = u.departamento && u.departamento.id ? { departamento: u.departamento.id, provincia: u.provincia.id } : null;
  zonas.set(clave, zona);
  return zona;
}

async function deGeoref(texto, foco) {
  const zona = await zonaDe(foco).catch(() => null);
  const parametros = { direccion: texto.split(',')[0].trim(), max: '5', campos: 'completo' };
  if (zona) Object.assign(parametros, zona);
  const datos = await pedirGeoref('direcciones', parametros);
  return (datos.direcciones || [])
    .filter((d) => d.ubicacion && Number.isFinite(d.ubicacion.lat) && Number.isFinite(d.ubicacion.lon))
    .map((d) => {
      const calle = nombrePropio(d.calle && d.calle.nombre);
      const altura = d.altura && d.altura.valor != null ? String(d.altura.valor) : '';
      const cruce = d.calle_cruce_1 && d.calle_cruce_1.nombre ? nombrePropio(d.calle_cruce_1.nombre) : '';
      return {
        tipo: altura || cruce ? 'direccion' : 'calle',
        calle,
        direccion: cruce && !altura ? `${calle} y ${cruce}` : armarDireccion(calle, altura),
        ciudad: nombrePropio((d.localidad_censal && d.localidad_censal.nombre) || (d.departamento && d.departamento.nombre) || ''),
        provincia: (d.provincia && d.provincia.nombre) || '',
        lat: d.ubicacion.lat,
        lng: d.ubicacion.lon
      };
    });
}

/* ---------- Esquinas: "Calle A y Calle B" ---------- */

function separarEsquina(texto) {
  const m = texto.split(',')[0].match(/^(.{3,}?)\s+(?:y|e|esq\.?|esquina|&)\s+(.{3,})$/i);
  if (!m) return null;
  const limpiar = (t) => t.replace(/^(?:calle|av\.?|avenida)\s+/i, '').trim();
  return { a: limpiar(m[1]), b: limpiar(m[2]) };
}

async function esquinaEnOverpass({ a, b }, foco) {
  if (!foco) return [];
  const radio = 25000;
  const datos = await consultarOverpass(
    `[out:json][timeout:8];` +
      `way["highway"]["name"~"${patronOverpass(a)}",i](around:${radio},${foco.lat},${foco.lng})->.a;` +
      `way["highway"]["name"~"${patronOverpass(b)}",i](around:${radio},${foco.lat},${foco.lng})->.b;` +
      `node(w.a)->.na;node(w.b)->.nb;node.na.nb;out 6;`
  );
  return (datos.elements || [])
    .filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lon))
    .map((e) => ({
      tipo: 'direccion',
      calle: nombrePropio(a),
      direccion: `${nombrePropio(a)} y ${nombrePropio(b)}`,
      ciudad: '',
      provincia: '',
      lat: e.lat,
      lng: e.lon
    }));
}

/* ---------- Rutas con kilómetro: "Ruta 3 km 696" ---------- */

function separarRutaKm(texto) {
  const m = texto.match(/\b(?:ruta|rn|rp|r\.n\.|r\.p\.)\s*(?:nacional|provincial)?\s*(?:n[°º]?\s*)?(\d{1,4})\b.*?\bkm\.?\s*(\d{1,4})(?:[.,]\d+)?/i);
  return m ? { ruta: m[1], km: Number(m[2]) } : null;
}

async function rutaKmEnOverpass({ ruta, km }, foco) {
  if (!foco) return [];
  // Kilómetro pedido y los cercanos, por si ese mojón no está cargado
  const cercanos = [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5].map((d) => km + d).filter((k) => k >= 0);
  const distancias = cercanos.join('|');
  const datos = await consultarOverpass(
    `[out:json][timeout:12];` +
      `way["highway"]["ref"~"(^|;)[ ]*(RN|RP|R|Ruta)?[ -]*${ruta}[ ]*($|;)",i](around:200000,${foco.lat},${foco.lng})->.r;` +
      `node["highway"="milestone"]["distance"~"^(${distancias})([.,]0+)?$"](around.r:250);out 20;`,
    13000
  );
  const mojones = (datos.elements || [])
    .filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lon))
    .map((e) => ({ e, km: Number(String((e.tags || {}).distance).replace(',', '.')) }))
    .filter((x) => Number.isFinite(x.km))
    .sort((x, y) => Math.abs(x.km - km) - Math.abs(y.km - km) || distanciaKm(foco, { lat: x.e.lat, lng: x.e.lon }) - distanciaKm(foco, { lat: y.e.lat, lng: y.e.lon }));
  if (!mojones.length) return [];
  const mejor = mojones[0];
  const exacto = mejor.km === km;
  return [
    {
      tipo: 'direccion',
      calle: `Ruta ${ruta}`,
      direccion: `Ruta ${ruta} km ${km}`,
      ciudad: '',
      provincia: '',
      nota: exacto ? 'mojón del km' : `cerca del mojón km ${mejor.km}, ajustá el pin`,
      aproximada: !exacto,
      lat: mejor.e.lat,
      lng: mejor.e.lon
    }
  ];
}

/* ---------- OpenRouteService (Pelias) ---------- */

function parametrosPelias(texto, foco) {
  const q = new URLSearchParams({ text: texto, 'boundary.country': 'AR', layers: 'venue,address,street', size: String(MAX) });
  if (foco) {
    q.set('focus.point.lat', String(foco.lat));
    q.set('focus.point.lon', String(foco.lng));
  }
  return q.toString();
}

function desdePelias(datos) {
  return (datos.features || []).map((f) => {
    const p = f.properties || {};
    const [lng, lat] = f.geometry.coordinates;
    const esLugar = p.layer === 'venue';
    const conAltura = p.layer === 'address' || !!p.housenumber;
    return {
      tipo: esLugar ? 'lugar' : conAltura ? 'direccion' : 'calle',
      nombre: esLugar ? p.name : '',
      calle: p.street || (esLugar ? '' : p.name) || '',
      direccion: esLugar ? armarDireccion(p.street, p.housenumber) : p.name || p.label,
      ciudad: p.locality || p.localadmin || p.county || '',
      provincia: p.region || '',
      lat,
      lng
    };
  });
}

/* ---------- Photon ---------- */

function desdePhoton(datos) {
  return (datos.features || [])
    .filter((f) => (f.properties || {}).countrycode === 'AR' || !(f.properties || {}).countrycode)
    .map((f) => {
      const p = f.properties || {};
      const [lng, lat] = f.geometry.coordinates;
      const esCalle = p.osm_key === 'highway';
      const esZona = p.osm_key === 'place' || p.osm_key === 'boundary';
      // Photon marca muchos comercios como "house": cuenta como lugar si tiene nombre propio
      const esLugar = !!p.name && !esCalle && !esZona && p.name !== p.street;
      return {
        tipo: esLugar ? 'lugar' : p.housenumber ? 'direccion' : 'calle',
        nombre: esLugar ? p.name : '',
        calle: p.street || (esCalle ? p.name : '') || '',
        direccion: armarDireccion(p.street || (esCalle ? p.name : ''), p.housenumber) || (esLugar ? '' : p.name || ''),
        ciudad: p.city || p.town || p.village || p.district || '',
        provincia: p.state || '',
        lat,
        lng,
        zona: esZona
      };
    })
    .filter((r) => !r.zona);
}

/* ---------- Nominatim ---------- */

function desdeNominatim(lista) {
  return (lista || []).map((n) => {
    const a = n.address || {};
    const calle = a.road || a.pedestrian || a.footway || '';
    const nombre = (n.namedetails && n.namedetails.name) || n.name || '';
    const esLugar = !!nombre && n.category !== 'highway' && n.category !== 'place' && n.category !== 'boundary' && nombre !== calle;
    return {
      tipo: esLugar ? 'lugar' : a.house_number ? 'direccion' : 'calle',
      nombre: esLugar ? nombre : '',
      calle,
      direccion: armarDireccion(calle, a.house_number) || (esLugar ? '' : (n.display_name || '').split(',')[0]),
      ciudad: a.city || a.town || a.village || a.suburb || a.municipality || '',
      provincia: a.state || '',
      lat: Number(n.lat),
      lng: Number(n.lon)
    };
  });
}

/* ---------- Overpass ---------- */

function desdeOverpass(datos) {
  return (datos.elements || [])
    .map((e) => {
      const t = e.tags || {};
      const lat = e.lat ?? (e.center && e.center.lat);
      const lng = e.lon ?? (e.center && e.center.lon);
      if (!t.name || t.highway || t.place || t.boundary) return null;
      return {
        tipo: 'lugar',
        nombre: t.name,
        calle: t['addr:street'] || '',
        direccion: armarDireccion(t['addr:street'], t['addr:housenumber']),
        ciudad: t['addr:city'] || '',
        provincia: '',
        lat,
        lng
      };
    })
    .filter(Boolean);
}

/* ---------- Armado de la respuesta ---------- */

function formatear(lista, numero, { localidad, provincia, foco }) {
  const vistos = new Set();
  const orden = { lugar: 0, direccion: 1, calle: 2 };
  const validos = lista.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng) && (r.nombre || r.direccion));

  // Puntaje de cercanía: localidad > provincia > resto
  validos.forEach((r) => {
    const enLocalidad = localidad && coincide(r.ciudad, localidad);
    const enProvincia = provincia && coincide(r.provincia, provincia);
    r.puntaje = (enLocalidad ? 2 : 0) + (enProvincia || enLocalidad ? 1 : 0);
    r.km = distanciaKm(foco, r);
    // Sin datos de ciudad/provincia: se juzga por la distancia al punto de salida
    if (!r.ciudad && !r.provincia && foco) r.puntaje = r.km < 30 ? 2 : r.km < 300 ? 1 : 0;
  });
  // Si hay resultados en la provincia, se descartan los de otras provincias
  const hayEnProvincia = provincia && validos.some((r) => r.puntaje >= 1);

  return validos
    .filter((r) => !hayEnProvincia || r.puntaje >= 1)
    .sort((a, b) => b.puntaje - a.puntaje || (numero ? 0 : orden[a.tipo] - orden[b.tipo]) || a.km - b.km)
    .map((r) => {
      let direccion = r.direccion;
      let aproximada = !!r.aproximada;
      if (r.tipo === 'calle' && numero) {
        const yaTieneNumero = new RegExp(`\\b${numero}$`).test(String(r.calle || r.direccion).trim());
        if (!yaTieneNumero) {
          direccion = `${r.calle || r.direccion} ${numero}`;
          aproximada = true;
        }
      }
      const lugar = [r.ciudad, r.provincia].filter(Boolean).join(', ');
      let aclaracion = r.nota || '';
      if (r.nota) aclaracion = r.nota;
      else if (aproximada) aclaracion = 'altura aproximada, ajustá el pin';
      else if (r.tipo === 'calle') aclaracion = 'sin altura';
      return {
        tipo: r.tipo,
        nombre: r.nombre || '',
        direccion: direccion || '',
        detalle: [lugar, aclaracion].filter(Boolean).join(' · '),
        lat: r.lat,
        lng: r.lng,
        aproximada
      };
    })
    .filter((r, _, todas) => !(r.aproximada && r.tipo === 'calle' && todas.some((x) => x.tipo === 'direccion')))
    .filter((r) => {
      const clave = `${(r.nombre || r.direccion).toLowerCase()}|${r.lat.toFixed(3)}|${r.lng.toFixed(3)}`;
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    })
    .slice(0, MAX);
}

async function probar(intentos, listo) {
  let encontrados = [];
  let fallas = 0;
  for (const intento of intentos) {
    if (listo(encontrados)) break;
    try {
      encontrados = encontrados.concat(await intento());
    } catch (e) {
      fallas++;
      console.log('[buscar] falló un intento', e.message, e.estado || '', JSON.stringify(e.detalle || '').slice(0, 200));
    }
  }
  return { encontrados, todosFallaron: fallas === intentos.length };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return responder(res, 405, { error: 'metodo' });
  const uid = await verificarUsuario(req);
  if (!uid) return responder(res, 401, { error: 'sin-sesion' });

  const texto = String(req.query.texto || '').trim().slice(0, 120);
  if (texto.length < 3) return responder(res, 200, { resultados: [] });

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const foco = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  const { calle, numero } = separarAltura(texto);
  const localidad = String(req.query.localidad || '').trim().slice(0, 80);
  const provincia = String(req.query.provincia || '').trim().slice(0, 80);
  // Para Nominatim se agrega la localidad al texto (si no la escribió el usuario)
  const conZona = !texto.includes(',') && localidad ? `${texto}, ${localidad}${provincia ? ', ' + provincia : ''}` : texto;

  let resultado;

  // Casos especiales: ruta con kilómetro y esquinas
  const rutaKm = separarRutaKm(texto);
  const esquina = rutaKm ? null : separarEsquina(texto);
  if (rutaKm || esquina) {
    const especial = await probar(
      rutaKm
        ? [() => rutaKmEnOverpass(rutaKm, foco)]
        : [() => deGeoref(`${esquina.a} y ${esquina.b}`, foco).then((l) => l.filter((r) => / y /.test(r.direccion))), () => esquinaEnOverpass(esquina, foco)],
      (lista) => lista.length > 0
    );
    if (especial.encontrados.length) {
      const resultados = formatear(especial.encontrados, null, { localidad, provincia, foco });
      console.log('[buscar]', JSON.stringify({ texto, especial: rutaKm ? 'ruta-km' : 'esquina', resultados: resultados.length }));
      if (resultados.length) return responder(res, 200, { resultados });
    }
  }

  if (rutaKm) {
    // Sin mojón cargado: se muestra la ruta para ubicar el pin a mano
    resultado = await probar(
      [
        async () =>
          desdeNominatim(await pedirNominatim(`Ruta Nacional ${rutaKm.ruta}${localidad ? ', ' + localidad : ''}`, foco)).map((r) => ({
            ...r,
            tipo: 'direccion',
            nombre: '',
            direccion: `Ruta ${rutaKm.ruta} km ${rutaKm.km}`,
            aproximada: true,
            nota: 'ese km no está en el mapa, ubicá el pin'
          }))
      ],
      (lista) => lista.length > 0
    );
  } else if (numero) {
    // Dirección con altura
    resultado = await probar(
      [
        () => deGeoref(texto, foco),
        async () => desdePelias(await pedirORS(`/pelias/v1/autocomplete?${parametrosPelias(texto, foco)}`)),
        async () => desdePelias(await pedirORS(`/pelias/v1/search?${parametrosPelias(texto, foco)}`)),
        async () => desdeNominatim(await pedirNominatim(conZona, foco)),
        async () => desdePelias(await pedirORS(`/pelias/v1/search?${parametrosPelias(calle, foco)}`))
      ],
      (lista) => lista.some((r) => r.tipo === 'direccion' && (!localidad || coincide(r.ciudad, localidad) || distanciaKm(foco, r) < 30))
    );
  } else {
    // Nombre de un lugar o de una calle
    const hayLugares = (lista) =>
      lista.filter((r) => r.tipo === 'lugar' && (!foco || distanciaKm(foco, r) < 60)).length >= 3;
    resultado = await probar(
      [
        // Photon y OpenRouteService a la vez (los dos son rápidos)
        async () => {
          const [photon, pelias] = await Promise.allSettled([
            pedirPhoton(texto, foco).then(desdePhoton),
            pedirORS(`/pelias/v1/autocomplete?${parametrosPelias(texto, foco)}`).then(desdePelias)
          ]);
          if (photon.status === 'rejected' && pelias.status === 'rejected') throw photon.reason;
          return [...(photon.value || []), ...(pelias.value || [])];
        },
        async () => desdeNominatim(await pedirNominatim(conZona, foco)),
        async () => desdeOverpass(await pedirOverpass(texto, foco))
      ],
      hayLugares
    );
  }

  if (!resultado.encontrados.length && resultado.todosFallaron) {
    return responder(res, 502, { error: 'busqueda' });
  }

  const resultados = formatear(resultado.encontrados, numero, { localidad, provincia, foco });
  console.log('[buscar]', JSON.stringify({ texto, conAltura: !!numero, resultados: resultados.length, lugares: resultados.filter((r) => r.tipo === 'lugar').length }));
  return responder(res, 200, { resultados });
}
