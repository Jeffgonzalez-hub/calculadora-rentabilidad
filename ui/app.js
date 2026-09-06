// ui/app.js — punto de entrada. Solo importa lógica vía ./adapter.js y ./perfil.js.
import { montarEntradaBasica } from './formulario.js';
import { analizarDesdeFormulario, escenariosDesdeFormulario, perfilToVista } from './adapter.js';
import { montarResultado, pintarHero, pintarSecundario, alPulsarCta, alCambiarComboDesglose } from './render.js';
import { montarPerfilPantalla } from './perfil-pantalla.js';
import { montarEscenarios } from './graficos.js';
import { cargarPerfil, guardarPerfil, restablecerPerfil } from './perfil.js';

const $ = (id) => document.getElementById(id);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

let perfil = cargarPerfil();
let comboDesglose = 1;

montarResultado();
const entrada = montarEntradaBasica($('entrada-basica'), { alCambiar: () => recalcularDebounced() });

const escenarios = montarEscenarios($('bloque-escenarios'));
let escVisible = false;
let escSucio = true;

const perfilPantalla = montarPerfilPantalla($('perfil-pantalla'), {
  alCambiarCampo: (clave, campo) => {
    perfil = { ...perfil, [clave]: campo };
    // Solo el resumen: repintar las filas destruiría el <input> en uso (foco perdido).
    perfilPantalla.pintarResumen(perfilToVista(perfil));
    recalcularDebounced();
  },
  alGuardar: () => { guardarPerfil(perfil); perfilPantalla.cerrar(); },
  alRestablecer: () => { perfil = restablecerPerfil(); perfilPantalla.pintar(perfilToVista(perfil)); recalcular(); },
  alCerrar: () => {},
});
perfilPantalla.pintar(perfilToVista(perfil));

$('btn-perfil').addEventListener('click', () => perfilPantalla.abrir($('btn-perfil')));

alPulsarCta((destino, clave) => {
  if (destino === 'perfil') {
    perfilPantalla.abrir($('btn-perfil'));
    if (clave) perfilPantalla.enfocarClave(clave);
  } else {
    entrada.enfocar(destino);
  }
});
alCambiarComboDesglose((n) => { comboDesglose = n; recalcular(); });

function recalcular() {
  const form = entrada.leerForm();
  const { vista, hero } = analizarDesdeFormulario(form, perfil, comboDesglose);
  pintarHero(hero);
  pintarSecundario(vista, hero.muestraPrecio);
  escSucio = true;
  if (escVisible) recalcularEscenariosDebounced();
}
function recalcularEscenarios() {
  escenarios.pintar(escenariosDesdeFormulario(entrada.leerForm(), perfil));
  escSucio = false;
}
const recalcularDebounced = debounce(recalcular, 120);
const recalcularEscenariosDebounced = debounce(recalcularEscenarios, 250);

new IntersectionObserver((entradas) => {
  escVisible = entradas.at(-1).isIntersecting;
  if (escVisible && escSucio) recalcularEscenarios();
}, { threshold: 0.15 }).observe($('bloque-escenarios'));

recalcular();
