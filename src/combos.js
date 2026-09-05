// src/combos.js
import { redondear } from './redondeo.js';
import { aviso } from './util.js';

/** Umbrales del semáforo de margen neto (fracción sobre el precio). */
const UMBRALES = [
  { min: 0.30, nivel: 'premium' },
  { min: 0.20, nivel: 'sano' },
  { min: 0.10, nivel: 'apretado' },
];

export function crearCombos(ctx, costos, rent) {
  const {
    objetivo, cesionUtilidadPorUnidadExtra: d, comisionRecaudoPct,
    comisionRecaudoFijo, fleteIda, empaquePorPedido, redondeo,
    escaleraPrecios, precioBase, costoUnitario,
  } = ctx;

  const regla = objetivo.regla ?? { tipo: 'margen_neto', valor: 0.25 };

  // K0(n) = cogs(n) + fleteIda + comisiónFija(Q) + empaque(E) + colchón(n) —
  // "recuperación de costos por venta entregada", sin precio y sin adquisición (§A.6).
  const K0 = (n) => costos.cogs(n) + fleteIda + comisionRecaudoFijo + empaquePorPedido + costos.colchonDevoluciones(n);

  // --- regla margen_neto (default V2): P_crudo = (K0(n)+cac) / (1-q-m), o K0(n)/(1-q-m) sin CAC. ---
  const precioCrudoMargenNeto = (n) => {
    const m = regla.valor;
    if (m == null) return null; // sin_objetivo: index.js/recomendacion.js lo maneja aparte
    const denominador = 1 - comisionRecaudoPct - m;
    if (denominador <= 0) return null; // no_alcanzable — nunca Infinity/negativo
    const cac = rent.cac;
    const numerador = cac == null ? K0(n) : K0(n) + cac;
    return numerador / denominador;
  };

  // --- regla utilidad_fija (mecanismo histórico de V1: "quiero ganar $U por venta entregada"). ---
  const utotalFija = (n) => regla.valor * (1 + (n - 1) * (1 - d));
  const precioCrudoUtilidadFija = (n) =>
    (costos.cogs(n) + fleteIda + comisionRecaudoFijo + empaquePorPedido
      + costos.colchonDevoluciones(n) + utotalFija(n)) / (1 - comisionRecaudoPct);

  // --- regla markup: referencia rápida, ignora flete/devoluciones/CAC (§A.10). ---
  const precioCrudoMarkup = (n) => costoUnitario * n * regla.valor;

  const precioCrudo = (n) => {
    if (regla.tipo === 'utilidad_fija') return precioCrudoUtilidadFija(n);
    if (regla.tipo === 'markup') return precioCrudoMarkup(n);
    return precioCrudoMargenNeto(n);
  };

  const sugerirPrecioCombo = (n) => redondear(precioCrudo(n), redondeo);

  const filaEscalera = (n) => (n === 1 ? null : escaleraPrecios.find((f) => f.cantidad === n) ?? null);

  const semaforoDe = (margenNeto) => {
    if (margenNeto == null) return { nivel: 'sin-dato', pct: null };
    const pct = margenNeto * 100;
    const hit = UMBRALES.find((u) => margenNeto >= u.min);
    if (hit) return { nivel: hit.nivel, pct };
    return { nivel: margenNeto > 0 ? 'muy-apretado' : 'pierde', pct };
  };

  const evaluarCombo = (n) => {
    const avisos = [];
    let ingreso;
    let esSugerido = false;
    const fila = filaEscalera(n);
    const precioSugerido = sugerirPrecioCombo(n);

    if (objetivo.modo === 'sugerir') {
      if (fila) { ingreso = fila.precio; }
      else { ingreso = precioSugerido; esSugerido = true; }
    } else {
      if (n === 1) { ingreso = precioBase ?? 0; }
      else if (fila) { ingreso = fila.precio; }
      else {
        ingreso = (precioBase ?? 0) * n;
        avisos.push(aviso('combo_sin_precio', 'aviso', `El combo de ${n} no tiene precio definido; se asumió ${n}× el precio de 1.`));
      }
    }

    const cac = rent.cac;
    const margen = rent.margen(n, ingreso);
    const combo = {
      n,
      ingreso,
      precioSugerido,
      esSugerido,
      costo: {
        cogs: costos.cogs(n),
        fleteIda,
        comisionRecaudo: costos.comisionRecaudo(ingreso),
        empaque: empaquePorPedido,
        colchonDevoluciones: costos.colchonDevoluciones(n),
        total: cac == null ? null : costos.costoTotalPorVenta(n, ingreso, cac),
      },
      utilidad: {
        porPedidoGenerado: rent.utilidadPorPedido(n, ingreso),
        porVentaEntregada: rent.utilidadPorVentaEntregada(n, ingreso),
        final: rent.utilidadFinal(n, ingreso),
      },
      margen,
      markup: rent.markup(n, ingreso),
      cac,
      roas: null,
      descuentoMaximoPct: null,
      semaforo: semaforoDe(margen.neto),
    };
    return { combo, avisos };
  };

  return { sugerirPrecioCombo, precioCrudo, evaluarCombo, semaforoDe };
}
