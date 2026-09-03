import { montarFormulario } from './formulario.js';
import { analizarDesdeFormulario } from './adapter.js';
import { pintar, alEditarPrecioCombo } from './render.js';

const railForm = document.getElementById('rail-form');
let formulario;

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function recalcular() {
  const { vista } = analizarDesdeFormulario(formulario.leerForm());
  pintar(vista);
}
const recalcularDebounced = debounce(recalcular, 120);

formulario = montarFormulario(railForm, { alCambiar: recalcularDebounced });

// editar el precio de una tarjeta (modo evaluar) escribe en el input del rail y recalcula
alEditarPrecioCombo((n, valor) => {
  const id = n === 1 ? 'f-precioBase' : `f-precio${n}`;
  const el = document.getElementById(id);
  if (el) { el.value = valor; recalcularDebounced(); }
});

recalcular();
