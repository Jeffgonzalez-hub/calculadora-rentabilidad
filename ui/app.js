import { montarFormulario } from './formulario.js';
import { analizarDesdeFormulario, escenariosDesdeFormulario } from './adapter.js';
import { pintar, alEditarPrecioCombo } from './render.js';
import { montarEscenarios } from './graficos.js';

const rail = document.getElementById('rail');
const railForm = document.getElementById('rail-form');
const bloqueEsc = document.getElementById('bloque-escenarios');
let formulario;

// responsive lite: bajo 900px el formulario del rail se puede colapsar
const mqAngosto = matchMedia('(max-width:900px)');
const railToggle = document.createElement('button');
railToggle.type = 'button';
railToggle.className = 'rail-toggle';
railToggle.setAttribute('aria-controls', 'rail-form');
function pintarRailToggle() {
  const colapsado = rail.classList.contains('rail--colapsado');
  railToggle.textContent = colapsado ? 'Mostrar entradas ▾' : 'Ocultar entradas ▴';
  railToggle.setAttribute('aria-expanded', String(!colapsado));
}
railToggle.addEventListener('click', () => {
  rail.classList.toggle('rail--colapsado');
  pintarRailToggle();
});
rail.insertBefore(railToggle, railForm);
pintarRailToggle();
// al volver a pantalla ancha, asegurar que el formulario quede visible
mqAngosto.addEventListener('change', (e) => {
  if (!e.matches) { rail.classList.remove('rail--colapsado'); pintarRailToggle(); }
});

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
