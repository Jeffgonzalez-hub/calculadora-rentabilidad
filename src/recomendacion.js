// src/recomendacion.js
import { CLAVES_ECONOMICAS } from './procedencia.js';
import { aviso } from './util.js';

function vacia(estado, avisosRec, procedencia, cacDisponible, parametroFaltante) {
  return {
    estado, precio: null, precioCrudo: null,
    tipoMargen: cacDisponible ? 'neto' : 'operativo',
    margenObjetivo: null, margenLogrado: null, utilidadPorVentaEntregada: null,
    confianza: { supuestos: [], faltantesAsumidosCero: [], cacDisponible },
    avisos: avisosRec,
    ...(parametroFaltante ? { parametroFaltante } : {}),
  };
}

/**
 * Aplica el flujo de decisión de §A.7: hasta 4 chequeos que bloquean el precio
 * (nunca lo calculan "por si acaso"), y solo después clasifica `ok_*` vs
 * `estimacion_*` según cuántos parámetros no son REAL. `combo1` ya viene evaluado por
 * `crearCombos(...).evaluarCombo(1)` — este módulo no vuelve a calcular precios,
 * solo decide si ese número se puede mostrar como recomendación y con qué estado.
 * `precioCrudoDe1` es el precio SIN redondear de 1 unidad, que el llamador
 * calcula una vez con `combosMod.precioCrudo(1)` (número o `null`).
 */
export function construirRecomendacion(ctx, procedencia, combo1, rent, publicidad, precioCrudoDe1) {
  const cacDisponible = publicidad.disponible;
  const regla = ctx.objetivo.regla;

  if (procedencia.costoUnitario === 'FALTANTE') {
    return vacia('sin_costo', [aviso('sin_costo', 'error', 'Falta el costo del proveedor para poder calcular un precio.')], procedencia, cacDisponible);
  }
  if (regla == null || regla.valor == null) {
    return vacia('sin_objetivo', [aviso('sin_objetivo', 'error', 'Elegí el margen que querés ganar para calcular un precio.')], procedencia, cacDisponible);
  }
  if (procedencia.fleteIda === 'FALTANTE') {
    return vacia('no_calculable', [aviso('no_calculable', 'error', 'Falta el flete de ida: sin ese dato no se puede calcular el colchón de devoluciones ni un precio confiable.')], procedencia, cacDisponible, 'fleteIda');
  }
  if (regla.tipo === 'margen_neto' && (1 - ctx.comisionRecaudoPct - regla.valor) <= 0) {
    const qPct = Math.round(ctx.comisionRecaudoPct * 100);
    const mPct = Math.round(regla.valor * 100);
    return vacia('no_alcanzable', [aviso('no_alcanzable', 'error', `Un margen del ${mPct}% no es posible con una comisión de recaudo del ${qPct}%.`)], procedencia, cacDisponible);
  }

  const tipoMargen = cacDisponible ? 'neto' : 'operativo';
  const margenLogrado = cacDisponible ? combo1.margen.neto : rent.margenOperativo(1, combo1.ingreso);
  const margenObjetivo = regla.tipo === 'margen_neto' ? regla.valor : null;

  const supuestos = CLAVES_ECONOMICAS.filter((k) => procedencia[k] === 'SUPUESTO');
  const faltantesAsumidosCero = CLAVES_ECONOMICAS.filter((k) => procedencia[k] === 'FALTANTE');
  const todoReal = CLAVES_ECONOMICAS.every((k) => procedencia[k] === 'REAL');

  const esEstimacion = regla.tipo === 'markup' || !todoReal;
  const estado = (esEstimacion ? 'estimacion_' : 'ok_') + (cacDisponible ? 'neto' : 'bruto');

  const avisosRec = [];
  if (regla.tipo === 'margen_neto' && regla.valor === 0) {
    avisosRec.push(aviso('margen_cero', 'aviso', 'El margen objetivo es 0%: este precio recupera costos pero no deja utilidad.'));
  }

  return {
    estado,
    precio: combo1.ingreso,
    precioCrudo: precioCrudoDe1,
    tipoMargen, margenObjetivo, margenLogrado,
    utilidadPorVentaEntregada: combo1.utilidad.porVentaEntregada,
    confianza: { supuestos, faltantesAsumidosCero, cacDisponible },
    avisos: avisosRec,
  };
}
