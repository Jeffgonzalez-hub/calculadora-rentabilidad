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
  const n = limpio === '' ? NaN : Number(limpio);
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

// --- Resultado del motor → vista que pinta el renderer ---

const ANCHO_SEMAFORO = { premium: 100, sano: 75, apretado: 48, 'muy-apretado': 25, pierde: 12, 'sin-dato': 0 };
const ETIQUETA_SEMAFORO = {
  premium: 'Margen premium', sano: 'Margen sano', apretado: 'Apretado',
  'muy-apretado': 'Muy apretado', pierde: 'Pierde plata', 'sin-dato': 'Sin datos',
};
const LABEL_PARTE = {
  cogs: 'Producto', fleteIda: 'Flete', comisionRecaudo: 'Comisión de recaudo',
  empaque: 'Empaque', colchonDevoluciones: 'Colchón devoluciones', utilidad: 'Tu utilidad',
};
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const pctFr = (f, d = 0) => pct(f, d);

function vistaAvisos(avisos) {
  const lista = avisos.map((a) => ({ ...a, clase: a.nivel === 'error' ? 'av-error' : 'av-aviso' }));
  const resumen = { errores: 0, avisos: 0 };
  for (const a of lista) resumen[a.nivel === 'error' ? 'errores' : 'avisos']++;
  return { lista, resumen };
}

function vistaVeredicto(r) {
  const c1 = r.combos[0];
  const mejor = r.combos.find((c) => c.n === r.mejorCombo.n) || c1;
  const sinPauta = c1.utilidad.final == null;
  const gana = !sinPauta && r.combos.some((c) => c.utilidad.final > 0);
  const estado = sinPauta ? 'sin-pauta' : gana ? 'gana' : 'pierde';
  const tope = r.equilibrio.costoConversacionMaximo;
  const actualCC = r.entradaNormalizada.mercado.costoConversacion;
  const holgura = tope == null ? null : tope - actualCC;

  const lineas = sinPauta
    ? ['Cargá el costo por conversación para ver si la campaña te sirve.']
    : [
        `Ganás ${oGuion(mejor.utilidad.final, pesos)} limpios por venta entregada (combo de ${mejor.n}u).`,
        `Mejor combo: ${mejor.n} unidad${mejor.n > 1 ? 'es' : ''} · ${pesos(mejor.ingreso)} · margen neto ${oGuion(mejor.margen.neto, pctFr)}.`,
        tope == null
          ? 'No se puede estimar el tope por conversación con estos datos.'
          : `Podés pagar hasta ${pesos(tope)} por conversación (hoy pagás ${pesos(actualCC)}).`,
      ];

  return {
    estado,
    titulo: sinPauta ? 'FALTAN DATOS DE PAUTA' : gana ? 'SÍ, VAS GANANDO' : 'NO, VAS PERDIENDO',
    clase: sinPauta ? 'ver-neutro' : gana ? 'ver-gana' : 'ver-pierde',
    gananciaLimpia: oGuion(mejor.utilidad.final, pesos),
    gananciaComboN: mejor.n,
    mejorCombo: { n: mejor.n, precio: pesos(mejor.ingreso), margenPct: oGuion(mejor.margen.neto, pctFr) },
    topeConversacion: oGuion(tope, pesos),
    costoConversacionActual: pesos(actualCC),
    holguraConversacion: holgura == null ? '—' : pesos(holgura),
    lineas,
  };
}

function vistaCombos(r, modo) {
  return r.combos.map((c) => ({
    n: c.n,
    titulo: `${c.n} unidad${c.n > 1 ? 'es' : ''}`,
    esMejor: c.n === r.mejorCombo.n,
    precio: pesos(c.ingreso),
    precioRaw: c.ingreso,
    esSugerido: c.esSugerido,
    precioSugerido: pesos(c.precioSugerido),
    editable: modo === 'evaluar',
    gana: oGuion(c.utilidad.final, pesos),
    margenNeto: oGuion(c.margen.neto, pctFr),
    margenBruto: oGuion(c.margen.bruto, pctFr),
    markup: oGuion(c.markup.sobreProducto, ratio),
    cac: oGuion(c.cac, pesos),
    descuentoMax: oGuion(c.descuentoMaximoPct, pctFr),
    semaforo: {
      nivel: c.semaforo.nivel,
      clase: 'sem-' + c.semaforo.nivel,
      anchoPct: ANCHO_SEMAFORO[c.semaforo.nivel] ?? 0,
      etiqueta: ETIQUETA_SEMAFORO[c.semaforo.nivel] ?? '',
    },
  }));
}

function vistaDesglose(r, comboN = 1) {
  const c = r.combos.find((x) => x.n === comboN) || r.combos[0];
  const ing = c.ingreso;
  const claves = ['cogs', 'fleteIda', 'comisionRecaudo', 'empaque', 'colchonDevoluciones'];
  const base = claves.map((k) => c.costo[k]);
  const sumaCostos = base.reduce((a, b) => a + b, 0);
  const utilidad = ing - sumaCostos;
  const perdida = utilidad < 0; // algún componente > precio (caso precio_bajo_costo)
  const montos = [...base, utilidad];
  const partes = [...claves, 'utilidad'].map((k, i) => {
    let anchoPct;
    if (k === 'utilidad') {
      // en pérdida la utilidad es negativa: no ocupa barra.
      anchoPct = perdida ? 0 : ing > 0 ? clamp((montos[i] / ing) * 100, 0, 100) : 0;
    } else if (perdida) {
      // reparto proporcional de las 5 partes de costo sobre su propia suma (≈100 %).
      anchoPct = sumaCostos > 0 ? (montos[i] / sumaCostos) * 100 : 0;
    } else {
      anchoPct = ing > 0 ? clamp((montos[i] / ing) * 100, 0, 100) : 0;
    }
    return { clave: k, label: LABEL_PARTE[k], monto: pesos(montos[i]), anchoPct, clase: 'part-' + (i + 1) };
  });
  return {
    comboN: c.n,
    clase: perdida ? 'barra-perdida' : '',
    precio: pesos(ing),
    precioRaw: ing,
    partes,
    cac: oGuion(c.cac, pesos),
    notaCac: 'No es costo de la unidad: es lo que cuesta traer al cliente que paga (pauta + atención ÷ cierre ÷ entrega).',
  };
}

function filaEquilibrio(clave, label, limite, actual, tipo, dir) {
  // tipo: 'moneda' | 'pct' | 'ratio' | 'numero'.  dir: 'min' (actual debe superar el límite) | 'max' (actual debe estar por debajo).
  const fmt = tipo === 'moneda' ? pesos
    : tipo === 'ratio' ? ratio
    : tipo === 'numero' ? ((x) => numero(x, 1))
    : (x) => pct(x, 1);
  const alcanzable = limite != null;
  let clase = 'eq-ok';
  let holguraPct = 0;
  if (alcanzable && actual != null && limite > 0) {
    const rel = Math.abs(actual - limite) / limite;
    const perdiendo = dir === 'min' ? actual < limite : actual > limite;
    clase = perdiendo ? 'eq-malo' : rel < 0.15 ? 'eq-ajustado' : 'eq-ok';
    // una fila que ya cruzó al lado perdedor no tiene "holgura": barra en 0.
    holguraPct = perdiendo ? 0 : clamp(rel * 100, 0, 100);
  }
  return {
    clave, label,
    limite: alcanzable ? fmt(limite) : '—',
    actualLabel: actual == null ? '' : dir === 'max' ? 'hoy pagás' : 'tu valor',
    actual: actual == null ? '' : fmt(actual),
    holguraPct, clase, alcanzable,
  };
}

function vistaEquilibrio(r) {
  const eq = r.equilibrio;
  const m = r.entradaNormalizada.mercado;
  const ing1 = r.combos[0].ingreso;
  // El motor devuelve 0 (no null) cuando no hay costos fijos: sin fijos no hay meta de unidades → "—".
  const uFijos = eq.unidadesDiaParaFijos;
  const filas = [
    filaEquilibrio('precioMinimo', 'Precio mínimo (1u)', eq.precioMinimo[0]?.valor, ing1, 'moneda', 'min'),
    filaEquilibrio('entregaMinima', 'Entrega mínima', eq.tasaEntregaMinima, m.tasaEntrega, 'pct', 'min'),
    filaEquilibrio('cierreMinimo', 'Cierre mínimo', eq.tasaCierreMinima, m.tasaCierre, 'pct', 'min'),
    filaEquilibrio('costoConvMax', 'Costo/conversación máx', eq.costoConversacionMaximo, m.costoConversacion, 'moneda', 'max'),
    filaEquilibrio('roasMinimo', 'ROAS mínimo', eq.roasMinimo, r.combos[0].roas.actual, 'ratio', 'min'),
    filaEquilibrio('unidadesDiaFijos', 'Unidades/día para fijos', uFijos > 0 ? uFijos : null, null, 'numero', 'min'),
  ];
  // etiqueta de actual más específica
  filas[0].actualLabel = 'vendés a';
  filas[1].actualLabel = filas[2].actualLabel = 'tu tasa';
  filas[4].actualLabel = 'tu ROAS';
  return filas;
}

function vistaProyeccion(r) {
  const p = r.proyeccion;
  if (p.utilidadMes == null) {
    return {
      disponible: false,
      nota: 'Cargá presupuesto de pauta y costo por conversación para proyectar.',
      pedidosDia: '—', ventasEntregadasDia: '—', utilidadDia: '—', utilidadMes: '—',
    };
  }
  return {
    disponible: true,
    // sub-1 por día: 2 decimales para no perder el "0,75" en un "0,8".
    pedidosDia: numero(p.pedidosDia, 2),
    ventasEntregadasDia: numero(p.ventasEntregadasDia, 2),
    utilidadDia: pesos(p.utilidadDia),
    utilidadDiaRaw: p.utilidadDia,
    utilidadMes: pesos(p.utilidadMes),
    utilidadMesRaw: p.utilidadMes,
    nota: 'Ya restados pauta, atención y costos fijos.',
  };
}

export function resultadoToVista(resultado, modo, comboSeleccionado = 1) {
  const av = vistaAvisos(resultado.avisos);
  return {
    meta: { modo, comboSeleccionado },
    veredicto: vistaVeredicto(resultado),
    avisos: av.lista,
    resumenAvisos: av.resumen,
    combos: vistaCombos(resultado, modo),
    desglose: vistaDesglose(resultado, comboSeleccionado),
    equilibrio: vistaEquilibrio(resultado),
    proyeccion: vistaProyeccion(resultado),
    escenarios: null,
  };
}

// --- Escenarios: resultado.escenarios → vista.escenarios ---

const LABELS_VAR = {
  costoConversacion: 'Costo por conversación',
  tasaEntrega: 'Tasa de entrega',
  costoPedidoFallido: 'Costo de devolución',
  precio: 'Precio',
  tasaCierre: 'Tasa de cierre',
};
const signo = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);
const pesosConSigno = (n) => (n < 0 ? '−' : '+') + pesos(Math.abs(n));

function vistaSensibilidad(sens) {
  const variables = Object.entries(sens).map(([clave, pasos]) => {
    const label = LABELS_VAR[clave] || clave;
    // el motor devuelve null en cada paso cuando no hay datos de pauta.
    const conDato = pasos.filter((p) => p.utilidadFinal != null);
    if (conDato.length === 0) {
      return {
        clave, label, puntos: [], cruceXPct: null, disponible: false,
        ejeY: { ceroPct: 50, max: '—', min: '—' },
      };
    }
    const vals = conDato.map((p) => p.utilidadFinal);
    let min = Math.min(...vals), max = Math.max(...vals);
    const plana = !(max > min);
    if (plana) { min -= 1; max += 1; } // serie plana ⇒ línea horizontal al medio
    const margen = (max - min) * 0.08;
    min -= margen; max += margen;
    const norm = (v) => ((v - min) / (max - min)) * 100;
    const puntos = [];
    pasos.forEach((p, i) => {
      if (p.utilidadFinal == null) return; // saltar huecos, no graficarlos
      puntos.push({
        xPct: i * 10,
        yPct: plana ? 50 : clamp(100 - norm(p.utilidadFinal), 0, 100),
        valor: oGuion(p.utilidadFinal, pesos),
        valorRaw: p.utilidadFinal,
        delta: (p.delta > 0 ? '+' : '') + pct(p.delta, 0),
      });
    });
    let cruceXPct = null;
    for (let i = 1; i < puntos.length; i++) {
      const a = puntos[i - 1].valorRaw, b = puntos[i].valorRaw;
      if (a == null || b == null || a === 0) continue;
      if (signo(a) !== signo(b)) {
        const t = a / (a - b); // 0..1 entre los dos puntos
        cruceXPct = clamp(puntos[i - 1].xPct + t * (puntos[i].xPct - puntos[i - 1].xPct), 0, 100);
        break;
      }
    }
    return {
      clave, label,
      puntos: puntos.map(({ valorRaw, ...p }) => p),
      cruceXPct,
      disponible: true,
      ejeY: {
        ceroPct: plana ? 50 : clamp(100 - norm(0), 0, 100),
        max: pesosCompacto(max), min: pesosCompacto(min),
      },
    };
  });
  return { variables };
}

function vistaTornado(filas) {
  const maxMag = Math.max(1, ...filas.map((f) => Math.max(Math.abs(f.impactoAbajo ?? 0), Math.abs(f.impactoArriba ?? 0))));
  // barras divergentes desde x=50: cada lado dispone de 50 unidades de ancho.
  return filas.map((f) => ({
    clave: f.variable,
    label: LABELS_VAR[f.variable] || f.variable,
    abajoPct: clamp((Math.abs(f.impactoAbajo ?? 0) / maxMag) * 50, 0, 50),
    arribaPct: clamp((Math.abs(f.impactoArriba ?? 0) / maxMag) * 50, 0, 50),
    abajo: f.impactoAbajo == null ? '—' : pesosConSigno(f.impactoAbajo),
    arriba: f.impactoArriba == null ? '—' : pesosConSigno(f.impactoArriba),
    dirAbajo: (f.impactoAbajo ?? 0) < 0 ? 'neg' : 'pos',
    dirArriba: (f.impactoArriba ?? 0) < 0 ? 'neg' : 'pos',
  }));
}

function vistaMatriz(mx) {
  // rampa divergente calculada solo con celdas que tienen dato.
  const conDato = mx.celdas.flat().map((c) => c.utilidadMes).filter((v) => v != null);
  const esc = Math.max(1, ...conDato.map((v) => Math.abs(v)));
  const clase = (v) => {
    const r = v / esc;
    if (r <= -0.5) return 'mx-n2';
    if (r < -0.05) return 'mx-n1';
    if (r <= 0.05) return 'mx-0';
    if (r < 0.5) return 'mx-p1';
    return 'mx-p2';
  };
  let actual = { fila: 0, col: 0 };
  const celdas = mx.celdas.map((fila, i) => fila.map((c, j) => {
    if (c.actual) actual = { fila: i, col: j };
    return {
      valor: oGuion(c.utilidadMes, pesosCompacto),
      clase: c.utilidadMes == null ? 'mx-sin-dato' : clase(c.utilidadMes),
      actual: !!c.actual,
    };
  }));
  return {
    ejeEntrega: mx.ejes.entrega.map((x) => pct(x)),
    ejeCierre: mx.ejes.cierre.map((x) => pct(x)),
    celdas, actual,
  };
}

function vistaEscenarios(esc) {
  if (!esc) return null;
  return {
    sensibilidad: vistaSensibilidad(esc.sensibilidad),
    tornado: vistaTornado(esc.tornado),
    matriz: vistaMatriz(esc.matrizEntregaCierre),
  };
}

// --- Funciones públicas ---

export function analizarDesdeFormulario(form, comboSeleccionado = 1) {
  const entrada = formToEntrada(form);
  const resultado = analizar(entrada, { conEscenarios: false });
  return {
    vista: resultadoToVista(resultado, entrada.objetivo.modo, comboSeleccionado),
    entradaNormalizada: resultado.entradaNormalizada,
    avisos: resultado.avisos,
  };
}

export function escenariosDesdeFormulario(form) {
  const entrada = formToEntrada(form);
  const resultado = analizar(entrada, { conEscenarios: true });
  return vistaEscenarios(resultado.escenarios);
}
