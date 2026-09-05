import { num, clamp, aviso } from './util.js';
import { inferirProcedencia } from './procedencia.js';

const PISO_TASA = 0.01;

export const DEFAULTS = {
  supuestos: {
    fleteIda: 0, fleteDevolucion: 0, feeDevolucion: 0,
    pctProductoPerdidoEnDevolucion: 0,
    comisionRecaudoPct: 0, comisionRecaudoFijo: 0,
    empaquePorPedido: 0, costoAtencionConversacion: 0,
    cesionUtilidadPorUnidadExtra: 0.20,
    redondeo: { granularidad: 1000, terminacion: 900, direccion: 'arriba' },
  },
  mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 0 },
  publicidad: { presupuestoDia: 0 },
  overhead: { costosFijosMes: 0, diasOperacionMes: 30 },
  mezcla: { 1: 1, 2: 0, 3: 0 },
};

function normalizarEscalera(cruda) {
  if (!Array.isArray(cruda)) return [];
  return cruda
    .map((f) => ({ cantidad: Math.floor(num(f?.cantidad, 0)), precio: num(f?.precio, 0) }))
    .filter((f) => f.cantidad > 1 && f.precio > 0)
    .sort((a, b) => a.cantidad - b.cantidad);
}

function normalizarMezcla(cruda, avisos) {
  const dada = cruda ?? {};
  const vals = { 1: num(dada[1], NaN), 2: num(dada[2], NaN), 3: num(dada[3], NaN) };
  const presentes = [1, 2, 3].filter((n) => Number.isFinite(vals[n]));
  if (presentes.length === 0) return { ...DEFAULTS.mezcla };
  const positivos = presentes.map((n) => Math.max(0, vals[n]));
  const suma = positivos.reduce((a, b) => a + b, 0);
  if (suma <= 0) return { ...DEFAULTS.mezcla };
  const out = { 1: 0, 2: 0, 3: 0 };
  for (const n of [1, 2, 3]) out[n] = Math.max(0, Number.isFinite(vals[n]) ? vals[n] : 0) / suma;
  if (Math.abs(suma - 1) > 1e-9) avisos.push(aviso('mezcla_renormalizada', 'aviso', 'La mezcla de ventas no sumaba 1; se reescaló.'));
  return out;
}

export function normalizarEntrada(entrada = {}) {
  const e = entrada ?? {};
  const avisos = [];

  const s = { ...DEFAULTS.supuestos, ...(e.supuestos ?? {}) };
  const redondeo = { ...DEFAULTS.supuestos.redondeo, ...((e.supuestos ?? {}).redondeo ?? {}) };
  const m = { ...DEFAULTS.mercado, ...(e.mercado ?? {}) };
  const pub = { ...DEFAULTS.publicidad, ...(e.publicidad ?? {}) };
  const ov = { ...DEFAULTS.overhead, ...(e.overhead ?? {}) };
  const prod = e.producto ?? {};
  const obj = e.objetivo ?? {};

  const tCruda = num(m.tasaEntrega, DEFAULTS.mercado.tasaEntrega);
  const kCruda = num(m.tasaCierre, DEFAULTS.mercado.tasaCierre);
  const tasaEntrega = clamp(tCruda, PISO_TASA, 1);
  const tasaCierre = clamp(kCruda, PISO_TASA, 1);
  if (tCruda < PISO_TASA) avisos.push(aviso('entrega_en_piso', 'aviso', 'La tasa de entrega se limitó al 1%.'));
  if (kCruda < PISO_TASA) avisos.push(aviso('cierre_en_piso', 'aviso', 'La tasa de cierre se limitó al 1%.'));

  const mezcla = normalizarMezcla(e.mezcla, avisos);

  const costoUnitario = num(prod.costoUnitario, 0);
  const precioBase = prod.precioBase == null ? null : num(prod.precioBase, 0);
  const escaleraPrecios = normalizarEscalera(prod.escaleraPrecios);

  // La granularidad se calcula antes que la terminación para poder acotar
  // terminacion a [0, granularidad - 1] (una terminación >= granularidad daba precios raros).
  const granRedondeo = Math.max(1, num(redondeo.granularidad, 1000));

  const modo = obj.modo === 'evaluar' || obj.modo === 'sugerir'
    ? obj.modo
    : (precioBase == null ? 'sugerir' : 'evaluar');

  const TIPOS_REGLA = new Set(['margen_neto', 'utilidad_fija', 'markup']);
  const reglaCruda = obj.regla ?? {};
  const regla = {
    tipo: TIPOS_REGLA.has(reglaCruda.tipo) ? reglaCruda.tipo : 'margen_neto',
    valor: reglaCruda.valor === null ? null : num(reglaCruda.valor, 0.25),
  };

  const ctx = {
    costoUnitario, precioBase, escaleraPrecios,
    fleteIda: num(s.fleteIda), fleteDevolucion: num(s.fleteDevolucion), feeDevolucion: num(s.feeDevolucion),
    pctProductoPerdidoEnDevolucion: clamp(num(s.pctProductoPerdidoEnDevolucion), 0, 1),
    comisionRecaudoPct: clamp(num(s.comisionRecaudoPct), 0, 0.99),
    comisionRecaudoFijo: num(s.comisionRecaudoFijo),
    empaquePorPedido: num(s.empaquePorPedido),
    costoAtencionConversacion: num(s.costoAtencionConversacion),
    cesionUtilidadPorUnidadExtra: clamp(num(s.cesionUtilidadPorUnidadExtra, 0.20), 0, 1),
    redondeo: {
      granularidad: granRedondeo,
      terminacion: clamp(Math.max(0, num(redondeo.terminacion, 900)), 0, granRedondeo - 1),
      direccion: ['arriba', 'cercano', 'abajo'].includes(redondeo.direccion) ? redondeo.direccion : 'arriba',
    },
    tasaEntrega, tasaCierre,
    costoConversacion: num(m.costoConversacion, 0),
    presupuestoDia: num(pub.presupuestoDia, 0),
    costosFijosMes: num(ov.costosFijosMes, 0),
    diasOperacionMes: Math.max(1, num(ov.diasOperacionMes, 30)),
    mezcla,
    objetivo: { modo, regla },
  };

  const entradaNormalizada = {
    producto: { costoUnitario, precioBase, escaleraPrecios },
    supuestos: {
      fleteIda: ctx.fleteIda, fleteDevolucion: ctx.fleteDevolucion, feeDevolucion: ctx.feeDevolucion,
      pctProductoPerdidoEnDevolucion: ctx.pctProductoPerdidoEnDevolucion,
      comisionRecaudoPct: ctx.comisionRecaudoPct, comisionRecaudoFijo: ctx.comisionRecaudoFijo,
      empaquePorPedido: ctx.empaquePorPedido, costoAtencionConversacion: ctx.costoAtencionConversacion,
      cesionUtilidadPorUnidadExtra: ctx.cesionUtilidadPorUnidadExtra, redondeo: ctx.redondeo,
    },
    mercado: { tasaEntrega, tasaCierre, costoConversacion: ctx.costoConversacion },
    publicidad: { presupuestoDia: ctx.presupuestoDia },
    overhead: { costosFijosMes: ctx.costosFijosMes, diasOperacionMes: ctx.diasOperacionMes },
    mezcla, objetivo: ctx.objetivo,
  };

  const procedencia = inferirProcedencia(entrada);
  return { ctx, entradaNormalizada, avisos, procedencia };
}
