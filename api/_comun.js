/* =========================================================
   Vueltrack — funciones compartidas del servidor (Vercel)
   Variables de entorno:
     ORS_API_KEY       clave gratuita de OpenRouteService (cuenta en account.heigit.org)
     FIREBASE_API_KEY  la apiKey pública de Firebase (la misma de js/firebase-config.js)
   ========================================================= */

// Dirección nueva de OpenRouteService (api.openrouteservice.org se apagó en septiembre de 2026)
const ORS = 'https://api.heigit.org';

/* Solo usuarios con sesión iniciada pueden usar la clave de OpenRouteService */
export async function verificarUsuario(req) {
  const encabezado = req.headers.authorization || '';
  const token = encabezado.startsWith('Bearer ') ? encabezado.slice(7) : '';
  if (!token || !process.env.FIREBASE_API_KEY) return null;
  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(process.env.FIREBASE_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token })
      }
    );
    if (!resp.ok) return null;
    const datos = await resp.json();
    return datos.users && datos.users[0] ? datos.users[0].localId : null;
  } catch (e) {
    return null;
  }
}

export async function pedirORS(ruta, { method = 'GET', body } = {}) {
  if (!process.env.ORS_API_KEY) throw new Error('falta-ORS_API_KEY');
  // En los GET (búsqueda de direcciones) la clave también va en la dirección
  let url = `${ORS}${ruta}`;
  if (method === 'GET') url += `${url.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(process.env.ORS_API_KEY)}`;
  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: process.env.ORS_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json, application/geo+json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const texto = await resp.text();
  let datos = null;
  try {
    datos = JSON.parse(texto);
  } catch (e) {
    datos = { error: texto };
  }
  if (!resp.ok) {
    const error = new Error('ors');
    error.estado = resp.status;
    error.detalle = datos;
    throw error;
  }
  return datos;
}

export function responder(res, estado, datos) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(estado).json(datos);
}
