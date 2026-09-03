/**
 * Adapter puro (sin DOM). Único módulo que habla los dos vocabularios:
 * (form del panel izquierdo) <-> entrada del motor, y Resultado <-> vista.
 * Task 2: CAMPOS + formToEntrada. Task 3/4 agregan resultadoToVista y las funciones públicas.
 */
import { analizar, DEFAULTS } from '../src/index.js';
import { pesos, pesosCompacto, pct, ratio, oGuion, numero } from './formato.js';

const D = DEFAULTS;

// --- Metadata del formulario. app.js/formulario.js construye el <form> desde acá. ---
// `defecto` de campos `%` se guarda en escala 0–100 (lo que ve el usuario); formToEntrada divide.
export const CAMPOS = [
  // PRODUCTO
  { id: 'costoUnitario', grupo: 'basico', modo: 'ambos', seccion: 'producto', tipo: 'moneda',
    label: 'Costo del proveedor (por unidad)', ayuda: 'Lo que te cuesta una unidad, sin flete.', defecto: 0 },
  { id: 'utilidadObjetivo', grupo: 'basico', modo: 'sugerir', seccion: 'producto', tipo: 'moneda',
    label: 'Utilidad que querés ganar', ayuda: 'Por venta entregada, antes de descontar publicidad.', defecto: 40000 },
  { id: 'precioBase', grupo: 'basico', modo: 'evaluar', seccion: 'producto', tipo: 'moneda',
    label: 'Precio 1 unidad', ayuda: 'El precio al que vendés una unidad.', defecto: 0 },
  { id: 'precio2', grupo: 'basico', modo: 'evaluar', seccion: 'producto', tipo: 'moneda',
    label: 'Precio 2 unidades (combo)', ayuda: 'Opcional. Vacío = 2 × el precio de 1.', defecto: '' },
  { id: 'precio3', grupo: 'basico', modo: 'evaluar', seccion: 'producto', tipo: 'moneda',
    label: 'Precio 3 unidades (combo)', ayuda: 'Opcional. Vacío = 3 × el precio de 1.', defecto: '' },
  // CONTRAENTREGA
  { id: 'fleteIda', grupo: 'basico', modo: 'ambos', seccion: 'contraentrega', tipo: 'moneda',
    label: 'Flete de ida (se paga siempre)', ayuda: 'El transportador lo cobra entregue o no.', defecto: D.supuestos.fleteIda },
  { id: 'fleteDevolucion', grupo: 'basico', modo: 'ambos', seccion: 'contraentrega', tipo: 'moneda',
    label: 'Flete de devolución (si rebota)', ayuda: 'Lo que cuesta que la guía vuelva.', defecto: D.supuestos.fleteDevolucion },
  { id: 'tasaEntrega', grupo: 'basico', modo: 'ambos', seccion: 'contraentrega', tipo: 'porcentaje',
    label: 'Entrega efectiva', ayuda: '% de pedidos generados que se entregan y pagan.', defecto: D.mercado.tasaEntrega * 100 },
  // PUBLICIDAD
  { id: 'costoConversacion', grupo: 'basico', modo: 'ambos', seccion: 'publicidad', tipo: 'moneda',
    label: 'Costo por conversación', ayuda: 'Lo que te cobra la plataforma por cada conversación iniciada.', defecto: D.mercado.costoConversacion },
  { id: 'tasaCierre', grupo: 'basico', modo: 'ambos', seccion: 'publicidad', tipo: 'porcentaje',
    label: 'Cierre chat → venta', ayuda: '% de conversaciones que terminan en pedido.', defecto: D.mercado.tasaCierre * 100 },
  { id: 'presupuestoDia', grupo: 'basico', modo: 'ambos', seccion: 'publicidad', tipo: 'moneda',
    label: 'Presupuesto diario de pauta', ayuda: 'Cuánto gastás por día en anuncios.', defecto: D.publicidad.presupuestoDia },
  // AVANZADO
  { id: 'comisionRecaudoPct', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'porcentaje',
    label: 'Comisión de recaudo (%)', ayuda: '% sobre el valor recaudado (Dropi/transportadora).', defecto: D.supuestos.comisionRecaudoPct * 100 },
  { id: 'comisionRecaudoFijo', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'moneda',
    label: 'Comisión de recaudo (fijo)', ayuda: 'Monto fijo por pedido entregado.', defecto: D.supuestos.comisionRecaudoFijo },
  { id: 'feeDevolucion', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'moneda',
    label: 'Fee fijo por devolución', ayuda: 'Cargo fijo del operador cuando una guía se devuelve.', defecto: D.supuestos.feeDevolucion },
  { id: 'pctProductoPerdido', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'porcentaje',
    label: '% de producto perdido en devolución', ayuda: 'Qué parte del costo del producto no recuperás cuando vuelve.', defecto: D.supuestos.pctProductoPerdidoEnDevolucion * 100 },
  { id: 'empaque', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'moneda',
    label: 'Empaque por pedido', ayuda: 'Caja, relleno, etiqueta.', defecto: D.supuestos.empaquePorPedido },
  { id: 'costoAtencionConv', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'moneda',
    label: 'Costo de atender la conversación', ayuda: 'Tiempo del asesor / herramienta, aparte del costo de ads.', defecto: D.supuestos.costoAtencionConversacion },
  { id: 'cesionCombo', grupo: 'avanzado', modo: 'sugerir', seccion: 'avanzado', tipo: 'porcentaje',
    label: 'Cesión de utilidad por unidad extra', ayuda: 'Cuánta utilidad "regalás" por cada unidad de más en el combo.', defecto: D.supuestos.cesionUtilidadPorUnidadExtra * 100 },
  { id: 'costosFijosMes', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'moneda',
    label: 'Costos fijos al mes', ayuda: 'Sueldos, software, arriendo — lo que pagás vendas o no.', defecto: D.overhead.costosFijosMes },
  { id: 'diasOperacionMes', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'entero',
    label: 'Días de operación al mes', ayuda: 'Para repartir los fijos y proyectar.', defecto: D.overhead.diasOperacionMes },
  { id: 'mezcla1', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'porcentaje',
    label: 'Mezcla de ventas · 1u (%)', ayuda: 'Qué parte de tus ventas es de 1 unidad.', defecto: 100 },
  { id: 'mezcla2', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'porcentaje',
    label: 'Mezcla de ventas · 2u (%)', ayuda: '', defecto: 0 },
  { id: 'mezcla3', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'porcentaje',
    label: 'Mezcla de ventas · 3u (%)', ayuda: '', defecto: 0 },
  { id: 'redondeoGranularidad', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'entero',
    label: 'Redondeo · múltiplo', ayuda: 'El precio sugerido se redondea a este múltiplo.', defecto: D.supuestos.redondeo.granularidad },
  { id: 'redondeoTerminacion', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'entero',
    label: 'Redondeo · terminación', ayuda: 'Se resta al múltiplo (900 = precios "…900").', defecto: D.supuestos.redondeo.terminacion },
  { id: 'redondeoDireccion', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'opciones',
    label: 'Redondeo · dirección', ayuda: '"arriba" nunca deja el precio bajo el objetivo.',
    defecto: D.supuestos.redondeo.direccion, opciones: ['arriba', 'cercano', 'abajo'] },
];

const CAMPO_POR_ID = Object.fromEntries(CAMPOS.map((c) => [c.id, c]));

function parseNum(str, defecto = 0) {
  if (str == null) return defecto;
  const limpio = String(str).replace(/[^\d,.\-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(limpio);
  return Number.isFinite(n) ? n : defecto;
}

function leerCampo(form, id) {
  const c = CAMPO_POR_ID[id];
  const crudo = form[id];
  if (c.tipo === 'opciones') {
    return c.opciones.includes(crudo) ? crudo : c.defecto;
  }
  const vacio = crudo == null || String(crudo).trim() === '';
  if (c.tipo === 'porcentaje') {
    const base = vacio ? Number(c.defecto) : parseNum(crudo, Number(c.defecto));
    return base / 100;
  }
  return vacio ? Number(c.defecto) || 0 : parseNum(crudo, Number(c.defecto) || 0);
}

/** form (strings del DOM) → entrada anidada que consume analizar(). */
export function formToEntrada(form) {
  const g = (id) => leerCampo(form, id);
  const modo = form.modo === 'evaluar' ? 'evaluar' : 'sugerir';

  const escaleraPrecios = [];
  if (modo === 'evaluar') {
    const p2 = parseNum(form.precio2, 0);
    const p3 = parseNum(form.precio3, 0);
    if (p2 > 0) escaleraPrecios.push({ cantidad: 2, precio: p2 });
    if (p3 > 0) escaleraPrecios.push({ cantidad: 3, precio: p3 });
  }

  return {
    producto: {
      costoUnitario: g('costoUnitario'),
      precioBase: modo === 'evaluar' ? g('precioBase') : null,
      escaleraPrecios,
    },
    supuestos: {
      fleteIda: g('fleteIda'),
      fleteDevolucion: g('fleteDevolucion'),
      feeDevolucion: g('feeDevolucion'),
      pctProductoPerdidoEnDevolucion: g('pctProductoPerdido'),
      comisionRecaudoPct: g('comisionRecaudoPct'),
      comisionRecaudoFijo: g('comisionRecaudoFijo'),
      empaquePorPedido: g('empaque'),
      costoAtencionConversacion: g('costoAtencionConv'),
      cesionUtilidadPorUnidadExtra: g('cesionCombo'),
      redondeo: {
        granularidad: g('redondeoGranularidad'),
        terminacion: g('redondeoTerminacion'),
        direccion: g('redondeoDireccion'),
      },
    },
    mercado: {
      tasaEntrega: g('tasaEntrega'),
      tasaCierre: g('tasaCierre'),
      costoConversacion: g('costoConversacion'),
    },
    publicidad: { presupuestoDia: g('presupuestoDia') },
    overhead: { costosFijosMes: g('costosFijosMes'), diasOperacionMes: g('diasOperacionMes') },
    // mezcla sin dividir: el motor renormaliza (da igual la escala).
    mezcla: { 1: parseNum(form.mezcla1, 100), 2: parseNum(form.mezcla2, 0), 3: parseNum(form.mezcla3, 0) },
    objetivo: { modo, utilidadObjetivo: g('utilidadObjetivo') },
  };
}
