// ui/formulario.js
/** La vista básica: costo del proveedor + margen objetivo. Sin lógica de pricing. */
import { CAMPOS } from './adapter.js';

const campo = (c) => CAMPOS.find((x) => x.id === c);

export function montarEntradaBasica(contenedor, { alCambiar }) {
  contenedor.innerHTML = '';

  const costo = campo('costoUnitario');
  const margen = campo('margenObjetivo');

  const wrap = document.createElement('div');
  wrap.className = 'entrada-basica';
  wrap.innerHTML = `
    <label class="campo-basico moneda">
      <span class="lbl">${costo.label}</span>
      <span class="caja"><input id="in-costo" type="text" inputmode="decimal" autocomplete="off"
        aria-describedby="ayuda-costo" placeholder="0"></span>
      <span id="ayuda-costo" class="ayuda">${costo.ayuda}</span>
    </label>
    <label class="campo-basico porcentaje">
      <span class="lbl">${margen.label}</span>
      <span class="caja"><input id="in-margen" type="text" inputmode="decimal" autocomplete="off"
        aria-describedby="ayuda-margen" value="${margen.defecto}"></span>
      <span class="presets" role="group" aria-label="Márgenes frecuentes">
        ${margen.presets.map((p) => `<button type="button" class="preset" data-v="${p}">${p}%</button>`).join('')}
      </span>
      <span id="ayuda-margen" class="ayuda">${margen.ayuda}</span>
    </label>`;
  contenedor.append(wrap);

  const inCosto = wrap.querySelector('#in-costo');
  const inMargen = wrap.querySelector('#in-margen');

  wrap.addEventListener('input', alCambiar);
  for (const b of wrap.querySelectorAll('.preset')) {
    b.addEventListener('click', () => {
      inMargen.value = b.dataset.v;
      marcarPreset();
      alCambiar();
    });
  }
  function marcarPreset() {
    for (const b of wrap.querySelectorAll('.preset')) {
      b.setAttribute('aria-pressed', String(b.dataset.v === String(inMargen.value).trim()));
    }
  }
  inMargen.addEventListener('input', marcarPreset);
  marcarPreset();

  return {
    leerForm: () => ({ costoUnitario: inCosto.value, margenObjetivo: inMargen.value }),
    enfocar: (destino) => {
      const el = destino === 'margen' ? inMargen : inCosto;
      el.focus();
      el.select?.();
    },
  };
}
