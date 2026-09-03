// Orquestador de la UI. Se completa en Tasks 6–9.
import { analizarDesdeFormulario } from './adapter.js';

console.info('UI cargada. adapter OK:', typeof analizarDesdeFormulario === 'function');
document.getElementById('bloque-veredicto').innerHTML =
  '<h2>Veredicto</h2><div class="card">Cargá los datos en el panel izquierdo…</div>';
