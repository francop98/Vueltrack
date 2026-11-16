# Vueltrack v5.0

Armá la vuelta. Seguila parada por parada.

App web instalable (PWA) para fleteros y comisionistas: cargás direcciones o clientes habituales, Vueltrack ordena la vuelta, la reparte entre fleteros y cada uno la sigue desde el celular.

Hecha en HTML, CSS y JavaScript sin frameworks, con Firebase (cuentas y datos), Vercel (publicación y servidor) y OpenRouteService + OpenStreetMap (mapas y rutas). Todo con planes gratuitos.

---

## Estructura

```
vueltrack/
├── index.html          Inicio: pantalla principal (menú)
├── styles.css          Estilos generales de todas las pantallas
├── manifest.json       Datos de la app instalable
├── sw.js               Service worker (funciona con poca señal)
├── vercel.json         Redirecciones de direcciones viejas
├── firestore.rules     Reglas de seguridad de Firestore
├── package.json
├── README.md
├── pages/              Todas las pantallas (menos Inicio)
│   ├── hoy.html        La vuelta del día: mapa, próxima parada, navegar
│   ├── login.html      Ingresar / crear cuenta (mail o Google)
│   ├── bienvenida.html Trabajar solo, armar equipo o sumarse con código
│   ├── armar.html      Cargar direcciones y clientes, salida y orden
│   ├── repartir.html   Repartir entre fleteros
│   ├── clientes.html   Clientes habituales
│   ├── equipo.html     Modo de trabajo, integrantes y roles
│   ├── parada.html     Modo fletero: navegar, avisar, entregado / no estaba
│   └── vehiculo.html   Mi vehículo: consumo y gasto estimado
├── css/                Estilos propios de cada pantalla
│   ├── mapa.css · ingreso.css · inicio.css · parada.css · equipo.css · repartir.css
├── js/                 Toda la lógica (un archivo por pantalla + módulos compartidos)
├── api/                Servidor en Vercel (buscar, optimizar, lugar)
└── assets/             Íconos de la app
```

Todas las rutas son absolutas desde la raíz (`/styles.css`, `/js/...`, `/pages/...`), así funcionan igual desde `index.html` y desde `pages/`.

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
- **Diseño**: solo modo oscuro, pensado para usar desde el celular.
- **Orden de la vuelta**: más conveniente, de la más cercana a la más lejana, de la más lejana a la más cercana o por horario de cierre (las que no tienen horario quedan al final). Las urgentes siempre primero. Desde Hoy se puede reordenar arrancando desde donde estás.
- **Navegar**: “Toda la vuelta” abre Google Maps con las próximas paradas (hasta 10 por tramo) o “Solo esta” para una sola. Waze va de a una.
- **Mi vehículo**: rinde y precio del combustible para calcular el gasto estimado de cada vuelta.

## Límites del plan gratis de OpenRouteService

- La cantidad diaria de cálculos y búsquedas figura en tu panel de account.heigit.org.
- Georef es gratis y sin clave. Nominatim (último respaldo) es gratis con uso moderado: hasta 1 búsqueda por segundo.
- Hasta 48 paradas por fletero en una vuelta (límite de 50 ubicaciones por cálculo).
- “Parejo” calcula todo junto hasta 3 fleteros y 48 paradas; con más, reparte por zonas parejas.

## Versiones

- Cambios chicos: v1.1, v1.2…  Cambios grandes: v2.0.
- Al publicar una versión nueva, cambiá `VERSION_APP` en `js/firebase-config.js` y `VERSION` en `sw.js` para que los celulares bajen lo nuevo.

### v5.0
- Scroll: el fondo queda fijo; solo se desplaza el contenido. Con una hoja, el menú o un aviso abiertos, la pantalla de atrás no se mueve.
- Barra de abajo nueva. Organizador: Inicio, Armar, Hoy, Clientes, Historial. Fletero: Inicio, Hoy, Manejo, Historial. Equipo pasa al menú ☰ y al Inicio.
- Botón para volver en todas las pantallas.
- Pantalla de carga al entrar: el punto del logo recorre la línea.
- Se quitó el cotizador de fletes y el cálculo de gasto (rinde y precio). Mi vehículo queda con datos, capacidad, vencimientos y service.
- Perfil solo organizador (sin vehículo): se elige en el onboarding y desde Equipo.
- Armar: “¿Quiénes salen este día?” y cada destino nuevo se asigna solo al fletero de esa zona (se puede cambiar tocando el nombre). Botón “Dividir por zona”.
- Armar: “Elegir clientes” abre la lista completa con buscador para sumar varios de una.
- Clientes: nombre siempre en mayúsculas, sin repetidos y sin doble guardado. Se quitó “Bultos habituales”.
- Búsqueda: esquinas (“Alsina y Chiclana”) y rutas con kilómetro (“Ruta 3 km 696”).
- Archivos eliminados: pages/cotizar.html, js/cotizar.js, css/cotizar.css, js/consumos.js.

### v4.0
**En la calle**
- Resultado de cada parada: Entregado, No estaba, Rechazado u otro motivo. Opción de pasarla a otro día (se suma pendiente a esa vuelta).
- “Avisar que voy”: WhatsApp al cliente con hora estimada y link de seguimiento (página pública /pages/seguimiento.html, sin cuenta).
- Notas fijas y horario en que recibe (desde / hasta) por cliente y por parada.
- Modo manejo (/pages/manejo.html): una parada por vez, botones grandes y pantalla siempre encendida.
- Comprobante de entrega: foto comprimida y firma en pantalla (se guardan en Firestore, sin Storage).

**Carga de la vuelta**
- Los clientes que les toca ese día se suman solos al abrir un día vacío (se puede apagar).
- Repetir una vuelta anterior.
- Pegar varias direcciones de una (una por renglón).
- Retiro y entrega: una parada de retiro se vincula a su entrega; el orden respeta que primero se retira.
- Pausa de la jornada (almuerzo) incluida en el cálculo de horarios.
- Bultos por parada y capacidad del vehículo al ordenar.

**Negocio**
- Cotizador de fletes: km, tiempo, combustible, amortización, tu hora, peajes y ganancia. Presupuesto por WhatsApp o PDF.
- Historial: días, entregas, km, tiempo y gasto por período y por fletero. Exporta a Excel (CSV) y PDF.

**Equipo y vehículo**
- Ubicación en vivo: cada fletero elige compartirla; el organizador la ve en el mapa de Hoy.
- Vencimientos (VTV, seguro, patente, etc.) y service por km con avisos en Inicio.

**Firestore**: hay reglas nuevas (seguimiento, ubicaciones, comprobantes y vueltas creadas por fleteros). Hay que volver a publicar firestore.rules.

### v3.1
- La parte superior respeta la zona de la hora y la batería del iPhone (también con la app instalada).
- Mapa con OpenStreetMap en versión oscura: sin clave y gratis (CARTO pasó a pedir clave).
- Mi vehículo: rinde aproximado según el modelo, tipo y combustible, con botón Usar.
- Calculadora de amortización: valor del vehículo, años de uso, reventa, km por año y mantenimiento anual.
- Se guarda la fecha del último precio cargado.
- Onboarding: el rinde se completa solo al escribir el modelo.

### v3.0
- Ingreso: “Recordar mis datos en este celular” (guarda el correo y mantiene la sesión) y botón para ver u ocultar la contraseña.
- Instalar como app: en Android/Chrome abre el cartel de instalación; en iPhone muestra los pasos (Compartir → Agregar a pantalla de inicio). Está en Inicio, en el menú y al final del onboarding.
- Guía de uso para nuevos: se muestra sola la primera vez y queda en el menú.
- Onboarding completo: nombre y teléfono, modo de trabajo, zona (provincia y localidad), punto de salida, jornada (hora de salida, demora por destino, volver) y vehículo.
- Búsquedas: priorizan la localidad cargada, después la provincia, y descartan otras provincias si hay resultados en la tuya.
- Zona de trabajo y punto de salida editables desde Equipo (organizador).
- Menú hamburguesa a la izquierda; el panel sale desde la izquierda.
- Reglas de Firestore: cada integrante puede guardar su teléfono (hay que volver a publicarlas).

### v2.3
- Corrige la búsqueda de comercios: Photon marca muchos comercios como “casa” y se estaban descartando. Photon y OpenRouteService se consultan a la vez.
- Destinos: botones para editar (nombre, dirección, pin, teléfono, horario de cierre, nota, urgente) y eliminar, en Armar y en la pantalla de cada parada.
- Inicio queda solo en la barra de abajo (ícono de casa). Arriba a la derecha, menú desplegable con Mis datos, Seguridad (cambiar contraseña), Mi vehículo, Equipo, Clientes y Cerrar sesión.
- Textos de ayuda formales y simples en todos los campos.

### v2.2
- Búsqueda de comercios y empresas por nombre (ej. “Ferretería Don Luis”), además de calle y altura. Usa OpenRouteService, Photon, Nominatim y Overpass (todo OpenStreetMap, gratis).
- Las sugerencias muestran primero tus clientes habituales que coinciden, después los lugares y al final las calles.
- Al elegir un comercio, la parada queda con el nombre del negocio y su dirección.
- Límite: solo aparecen los comercios cargados en OpenStreetMap. Los que no estén, guardalos como clientes habituales.

### v2.1
- Nueva estructura de carpetas: `pages/` para las pantallas, `styles.css` en la raíz y `css/` con los estilos de cada pantalla.
- `vercel.json` redirige las direcciones viejas (ej. `/hoy.html`) a `/pages/`.

### v2.0
- Solo modo oscuro y ajustes para celulares chicos.
- Pantalla principal (Inicio) con botón de menú en todas las pantallas. La vuelta del día pasa a `hoy.html`.
- Orden de las paradas: conveniente, cerca → lejos, lejos → cerca o por horario de cierre. Reordenar desde Hoy, opcionalmente desde tu ubicación.
- Navegar toda la vuelta en Google Maps (de a 10 paradas) o una sola parada.
- Mi vehículo: consumo, precio del combustible y gasto estimado por vuelta.
- Salgo desde: opción “Usar mi ubicación actual”.
- Hora de salida: arranca en la hora actual y se puede cambiar.
- Reglas de Firestore actualizadas (hay que volver a publicarlas).
- Se elimina `js/tema.js`.

### v1.2
- Las direcciones se buscan primero en **Georef** (servicio oficial de direcciones de Argentina, datos.gob.ar), que ubica la altura sobre la cuadra. Busca dentro del partido del punto de salida.

### v1.1
- Búsqueda de direcciones más robusta: si OpenRouteService no encuentra “calle + altura”, prueba con su búsqueda completa y después con Nominatim (OpenStreetMap).
- Si la altura exacta no está en el mapa, la dirección se carga como aproximada y se abre la parada para ubicar el pin en la puerta.

### v1.0
Primera versión: cuentas, trabajo solo o en equipo, roles, clientes habituales, armar y ordenar la vuelta, repartir entre fleteros, modo fletero, modo claro y oscuro, app instalable.
