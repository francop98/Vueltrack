/* =========================================================
   Vueltrack — inicialización de Firebase (Auth + Firestore)
   ========================================================= */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

let baseDeDatos;
try {
  // Guarda una copia local: la app sigue mostrando la vuelta si se corta la señal.
  // ignoreUndefinedProperties: un dato vacío (undefined) no hace fallar el guardado
  baseDeDatos = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true
  });
} catch (e) {
  baseDeDatos = initializeFirestore(app, { ignoreUndefinedProperties: true });
}

export const db = baseDeDatos;
