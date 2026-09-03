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
    escaleraPrecios, precioBase,
  } = ctx;

  const utotal = (n) => objetivo.utilidadObjetivo * (1 + (n - 1) * (1 - d));

  const precioCrudo = (n) =>
    (costos.cogs(n) + fleteIda + comisionRecaudoFijo + empaquePorPedido
      + costos.colchonDevoluciones(n) + utotal(n)) / (1 - comisionRecaudoPct);

  const sugerirPrecioCombo = (n) => redondear(precioCrudo(n), redondeo);

  const filaEscalera = (n) => (n === 1 ? null : escaleraPrecios.find((f) => f.cantidad === n) ?? null);

  const semaforoDe = (margenNeto) => {
    if (margenNeto == null) return { nivel: 'sin-dato', pct: null };
    const pct = margenNeto * 100;
    const hit = UMBRALES.find((u) => margenNeto >= u.min);
    if (hit) return { nivel: hit.nivel, pct };
    // pct > 0 => 'muy-apretado'; exactamente 0 o negativo => 'pierde'
    return { nivel: margenNeto > 0 ? 'muy-apretado' : 'pierde', pct };
  };

  const evaluarCombo = (n) => {
    const avisos = [];
    let ingreso;
    let esSugerido = false;
    const fila = filaEscalera(n);
    // Se calcula SIEMPRE (también cuando la escalera fija el precio) para que Fase 3
    // pueda comparar el precio de catálogo contra el que sugiere el motor.
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
      roas: null,               // lo completa index.js
      descuentoMaximoPct: null, // lo completa index.js
      semaforo: semaforoDe(margen.neto),
    };
    return { combo, avisos };
  };

  return { sugerirPrecioCombo, precioCrudo, evaluarCombo, semaforoDe };
}
