/** Construye el panel izquierdo desde CAMPOS. Sin lógica de pricing. */
import { CAMPOS } from './adapter.js';

const SECCIONES = [
  ['producto', 'Producto'],
  ['contraentrega', 'Contraentrega'],
  ['publicidad', 'Publicidad'],
];

function campoInput(c) {
  const wrap = document.createElement('div');
  wrap.className = `campo ${c.tipo}`;
  wrap.dataset.campo = c.id;
  wrap.dataset.modo = c.modo;
  const label = document.createElement('label');
  label.textContent = c.label;
  label.htmlFor = `f-${c.id}`;
  if (c.ayuda) label.title = c.ayuda;
  const caja = document.createElement('div');
  caja.className = 'caja';
  let control;
  if (c.tipo === 'opciones') {
    control = document.createElement('select');
    for (const op of c.opciones) {
      const o = document.createElement('option');
      o.value = o.textContent = op;
      control.append(o);
    }
    control.value = c.defecto;
  } else {
    control = document.createElement('input');
    control.type = 'text';
    control.inputMode = 'decimal';
    control.value = c.defecto === '' || c.defecto == null ? '' : String(c.defecto);
    control.placeholder = c.defecto === '' ? 'opcional' : '';
  }
  control.id = `f-${c.id}`;
  control.name = c.id;
  caja.append(control);
  wrap.append(label, caja);
  return wrap;
}

export function montarFormulario(contenedor, { alCambiar }) {
  contenedor.innerHTML = '';
  let modo = 'sugerir';

  // toggle
  const toggle = document.createElement('div');
  toggle.className = 'toggle';
  const bSug = document.createElement('button');
  const bEva = document.createElement('button');
  bSug.type = bEva.type = 'button';
  bSug.textContent = 'Sugerir';
  bEva.textContent = 'Evaluar';
  toggle.append(bSug, bEva);
  contenedor.append(toggle);

  // secciones básicas
  for (const [sec, titulo] of SECCIONES) {
    const h = document.createElement('div');
    h.className = 'grupo-seccion';
    h.textContent = titulo;
    contenedor.append(h);
    for (const c of CAMPOS.filter((x) => x.seccion === sec)) contenedor.append(campoInput(c));
  }

  // avanzado
  const det = document.createElement('details');
  det.className = 'avanzado';
  const sum = document.createElement('summary');
  sum.textContent = 'Avanzado';
  det.append(sum);
  for (const c of CAMPOS.filter((x) => x.seccion === 'avanzado')) det.append(campoInput(c));
  contenedor.append(det);

  function aplicarModo() {
    bSug.setAttribute('aria-pressed', String(modo === 'sugerir'));
    bEva.setAttribute('aria-pressed', String(modo === 'evaluar'));
    for (const w of contenedor.querySelectorAll('.campo')) {
      const m = w.dataset.modo;
      w.hidden = m !== 'ambos' && m !== modo;
    }
  }
  function setModo(m) {
    modo = m === 'evaluar' ? 'evaluar' : 'sugerir';
    aplicarModo();
    alCambiar();
  }
  bSug.addEventListener('click', () => setModo('sugerir'));
  bEva.addEventListener('click', () => setModo('evaluar'));
  contenedor.addEventListener('input', alCambiar);
  contenedor.addEventListener('change', alCambiar);

  function leerForm() {
    const form = { modo };
    for (const c of CAMPOS) {
      const el = contenedor.querySelector(`#f-${c.id}`);
      form[c.id] = el ? el.value : String(c.defecto ?? '');
    }
    return form;
  }

  aplicarModo();
  return { leerForm, setModo, get form() { return leerForm(); } };
}
