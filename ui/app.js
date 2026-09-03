import { montarFormulario } from './formulario.js';
import { analizarDesdeFormulario } from './adapter.js';

const railForm = document.getElementById('rail-form');

let formulario;
function recalcular() {
  const { vista } = analizarDesdeFormulario(formulario.leerForm());
  // Task 7 pinta la vista. Por ahora, prueba de humo:
  document.getElementById('bloque-veredicto').innerHTML =
    `<h2>Veredicto</h2><div class="card">${vista.veredicto.titulo} — ${vista.veredicto.lineas[0]}</div>`;
}

formulario = montarFormulario(railForm, { alCambiar: recalcular });
recalcular();
