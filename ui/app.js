import { montarFormulario } from './formulario.js';
import { analizarDesdeFormulario, escenariosDesdeFormulario } from './adapter.js';
import { pintar, alEditarPrecioCombo } from './render.js';
import { montarEscenarios } from './graficos.js';

const railForm = document.getElementById('rail-form');
const bloqueEsc = document.getElementById('bloque-escenarios');
let formulario;

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

const esc = montarEscenarios(bloqueEsc);
let escVisible = false;
let escSucio = true;

function recalcularPrincipal() {
  const { vista } = analizarDesdeFormulario(formulario.leerForm());
  pintar(vista);
  escSucio = true;
  if (escVisible) recalcularEscenariosDebounced();
}
function recalcularEscenarios() {
  esc.pintar(escenariosDesdeFormulario(formulario.leerForm()));
  escSucio = false;
}
const recalcularPrincipalDebounced = debounce(recalcularPrincipal, 120);
const recalcularEscenariosDebounced = debounce(recalcularEscenarios, 250);

new IntersectionObserver((entradas) => {
  escVisible = entradas[0].isIntersecting;
  if (escVisible && escSucio) recalcularEscenarios();
}, { threshold: 0.15 }).observe(bloqueEsc);

formulario = montarFormulario(railForm, { alCambiar: () => { recalcularPrincipalDebounced(); if (escVisible) esc.marcarDesactualizado(); } });

alEditarPrecioCombo((n, valor) => {
  const id = n === 1 ? 'f-precioBase' : `f-precio${n}`;
  const elx = document.getElementById(id);
  if (elx) { elx.value = valor; recalcularPrincipalDebounced(); }
});

recalcularPrincipal();
