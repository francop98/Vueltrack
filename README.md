# Vueltrack v1.0

Armá la vuelta. Seguila parada por parada.

App web instalable (PWA) para fleteros y comisionistas: cargás direcciones o clientes habituales, Vueltrack ordena la vuelta, la reparte entre fleteros y cada uno la sigue desde el celular.

Hecha en HTML, CSS y JavaScript sin frameworks, con Firebase (cuentas y datos), Vercel (publicación y servidor) y OpenRouteService + OpenStreetMap (mapas y rutas). Todo con planes gratuitos.

---

## Estructura

```
vueltrack/
├── index.html          Hoy: la vuelta del día, próxima parada y mapa
├── login.html          Ingresar / crear cuenta (mail o Google)
├── bienvenida.html     Trabajar solo, armar equipo o sumarse con código
├── armar.html          Cargar direcciones y clientes, ajustes de salida
├── repartir.html       Repartir entre fleteros (por zona, parejo o a mano)
├── clientes.html       Clientes habituales (orden alfabético)
├── equipo.html         Modo de trabajo, integrantes y roles
├── parada.html         Modo fletero: navegar, avisar, entregado / no estaba
├── manifest.json       Datos de la app instalable
├── sw.js               Service worker (funciona con poca señal)
├── firestore.rules     Reglas de seguridad de Firestore
├── package.json
├── css/
│   └── estilos.css     Todos los estilos (modo claro y oscuro)
├── js/
│   ├── tema.js         Modo claro / oscuro / automático
│   ├── pwa.js          Registro del service worker
│   ├── firebase-config.js   ← COMPLETAR con los datos de tu proyecto
│   ├── firebase.js     Inicio de Firebase
│   ├── sesion.js       Usuario, equipo, roles y menú "Mi cuenta"
│   ├── datos.js        Lectura y escritura en Firestore
│   ├── ui.js           Utilidades (formatos, avisos, hojas, navegación)
│   ├── rutas.js        Búsqueda de direcciones, reparto por zona
│   ├── ordenar.js      Calcular y guardar la vuelta ordenada
│   ├── vuelta.js       Ayudas para leer una vuelta
│   ├── mapa.js         Mapa propio (Leaflet)
│   ├── buscador.js     Buscador de direcciones con sugerencias
│   └── (uno por pantalla) login, bienvenida, hoy, armar, repartir, clientes, equipo, parada
├── api/                Servidor en Vercel (guarda la clave de OpenRouteService)
│   ├── _comun.js
│   ├── buscar.js       GET  /api/buscar
│   └── optimizar.js    POST /api/optimizar
└── assets/             Íconos de la app
```

---

## Puesta en marcha

### 1. Firebase
1. Creá un proyecto nuevo en Firebase (por ejemplo `vueltrack-app`).
2. **Authentication → Método de acceso**: activá **Correo electrónico/contraseña** y **Google**.
3. **Firestore Database**: creala en modo producción (ubicación `southamerica-east1`).
4. **Firestore → Reglas**: pegá el contenido de `firestore.rules` y publicá.
5. **Configuración del proyecto → Tus apps → Web**: registrá la app y copiá los datos en `js/firebase-config.js`.
6. **Authentication → Configuración → Dominios autorizados**: agregá el dominio de Vercel (ej. `vueltrack.vercel.app`).

### 2. OpenRouteService (rutas y direcciones)
1. Creá una cuenta gratis en <https://account.heigit.org> (HeiGIT es quien hace OpenRouteService).
2. La cuenta trae una clave del plan **Standard** (gratis). Copiala desde el panel.
3. La app usa la dirección nueva `api.heigit.org` (la vieja `api.openrouteservice.org` se apagó en septiembre de 2026).

### 3. GitHub + Vercel
1. Subí la carpeta a un repo `vueltrack` en GitHub.
2. En Vercel: **Add New → Project** → importá el repo (sin framework, sin comando de build).
3. **Settings → Environment Variables** (Production y Preview):
   - `ORS_API_KEY` → la clave de OpenRouteService
   - `FIREBASE_API_KEY` → la misma `apiKey` de `js/firebase-config.js`
4. Volvé a publicar (Redeploy) para que tome las variables.

---

## Cómo funciona

- **Cuentas**: cada persona tiene su cuenta (mail o Google).
- **Trabajo solo**: sos organizador y fletero a la vez.
- **En equipo**: el que crea el equipo es organizador. Los demás se suman con el código (`VT-0000`) y entran como fleteros. Un organizador puede darle a otro el rol de organizador, y una persona puede tener los dos roles.
- **Organizador**: carga clientes, arma y reparte vueltas, ve todo el equipo.
- **Fletero**: ve su vuelta del día y marca cada parada.
- **Ordenar**: el orden lo calcula OpenRouteService respetando punto de salida, hora de salida, demora por parada, “recibe hasta” y urgentes.
- **Repartir**: por zona (cada uno su zona del mapa), parejo (cantidades parejas) o a mano. Tocando un pin en el mapa se pasa la parada a otro fletero.
- **Navegar**: cada parada se abre en Google Maps o Waze.
- **Ubicaciones**: si un pin cae corrido, se arrastra al lugar correcto o el fletero toca “Estoy en la puerta”. En los clientes habituales queda guardada para siempre.
- **Modo claro / oscuro**: en “Mi cuenta” (tocá tu inicial arriba a la derecha): Claro, Oscuro o Automático (sigue al celular). El mapa también cambia.

## Límites del plan gratis de OpenRouteService

- La cantidad diaria de cálculos y búsquedas figura en tu panel de account.heigit.org.
- Hasta 48 paradas por fletero en una vuelta (límite de 50 ubicaciones por cálculo).
- “Parejo” calcula todo junto hasta 3 fleteros y 48 paradas; con más, reparte por zonas parejas.

## Versiones

- Cambios chicos: v1.1, v1.2…  Cambios grandes: v2.0.
- Al publicar una versión nueva, cambiá `VERSION_APP` en `js/firebase-config.js` y `VERSION` en `sw.js` para que los celulares bajen lo nuevo.

### v1.0
Primera versión: cuentas, trabajo solo o en equipo, roles, clientes habituales, armar y ordenar la vuelta, repartir entre fleteros, modo fletero, modo claro y oscuro, app instalable.
