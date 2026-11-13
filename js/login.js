/* =========================================================
   Vueltrack — ingreso y creación de cuenta (mail o Google)
   ========================================================= */
import { auth } from './firebase.js';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { guardarUsuario } from './datos.js';
import { aviso } from './ui.js';

const $ = (id) => document.getElementById(id);
let modo = 'ingresar';
let creando = false;

onAuthStateChanged(auth, (user) => {
  if (user && !creando) location.replace('index.html');
});

getRedirectResult(auth).catch((e) => mostrarError(traducir(e)));

function cambiarModo(nuevo) {
  modo = nuevo;
  const crear = modo === 'crear';
  $('tab-ingresar').classList.toggle('activo', !crear);
  $('tab-crear').classList.toggle('activo', crear);
  $('tab-ingresar').setAttribute('aria-selected', String(!crear));
  $('tab-crear').setAttribute('aria-selected', String(crear));
  $('campo-nombre').classList.toggle('oculto', !crear);
  $('btn-olvide').classList.toggle('oculto', crear);
  $('btn-enviar').textContent = crear ? 'Crear cuenta' : 'Ingresar';
  $('clave').setAttribute('autocomplete', crear ? 'new-password' : 'current-password');
  mostrarError('');
}

$('tab-ingresar').addEventListener('click', () => cambiarModo('ingresar'));
$('tab-crear').addEventListener('click', () => cambiarModo('crear'));

function mostrarError(texto) {
  $('error').textContent = texto;
  $('error').classList.toggle('oculto', !texto);
}

function traducir(e) {
  const codigo = e && e.code ? e.code : '';
  const textos = {
    'auth/invalid-email': 'El mail no es válido.',
    'auth/missing-password': 'Falta la contraseña.',
    'auth/weak-password': 'La contraseña tiene que tener al menos 6 caracteres.',
    'auth/email-already-in-use': 'Ya hay una cuenta con ese mail. Probá ingresar.',
    'auth/invalid-credential': 'Mail o contraseña incorrectos.',
    'auth/wrong-password': 'Mail o contraseña incorrectos.',
    'auth/user-not-found': 'No hay ninguna cuenta con ese mail.',
    'auth/too-many-requests': 'Demasiados intentos. Esperá un rato y volvé a probar.',
    'auth/network-request-failed': 'Sin conexión. Revisá internet y probá de nuevo.',
    'auth/popup-closed-by-user': ''
  };
  return codigo in textos ? textos[codigo] : 'No se pudo completar. Probá de nuevo.';
}

$('form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const email = $('email').value.trim();
  const clave = $('clave').value;
  const nombre = $('nombre').value.trim();
  if (modo === 'crear' && !nombre) {
    mostrarError('Poné tu nombre así te reconoce el equipo.');
    return;
  }
  $('btn-enviar').disabled = true;
  try {
    if (modo === 'crear') {
      creando = true;
      const cred = await createUserWithEmailAndPassword(auth, email, clave);
      await updateProfile(cred.user, { displayName: nombre });
      await guardarUsuario(cred.user.uid, { nombre, email, equipoId: null });
      location.replace('bienvenida.html');
    } else {
      await signInWithEmailAndPassword(auth, email, clave);
    }
  } catch (e) {
    creando = false;
    mostrarError(traducir(e));
  } finally {
    $('btn-enviar').disabled = false;
  }
});

$('btn-olvide').addEventListener('click', async () => {
  const email = $('email').value.trim();
  if (!email) {
    mostrarError('Escribí tu mail arriba y volvé a tocar “Me olvidé la contraseña”.');
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    mostrarError('');
    aviso('Te mandamos un mail para crear una contraseña nueva.');
  } catch (e) {
    mostrarError(traducir(e));
  }
});

$('btn-google').addEventListener('click', async () => {
  const proveedor = new GoogleAuthProvider();
  const esAppInstalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  try {
    if (esAppInstalada) await signInWithRedirect(auth, proveedor);
    else await signInWithPopup(auth, proveedor);
  } catch (e) {
    if (e.code === 'auth/popup-blocked') await signInWithRedirect(auth, proveedor);
    else mostrarError(traducir(e));
  }
});
