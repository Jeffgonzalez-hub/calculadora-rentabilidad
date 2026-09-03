/**
 * Puntos de equilibrio. Al despejar denominadores, utilidadFinal = 0 es lineal
 * en cada palanca por separado, así que todo sale en forma cerrada.
 */
export function crearEquilibrio(ctx, costos, rent, publicidad) {
  const {
    tasaEntrega: t, tasaCierre: k, costoConversacion: cc,
    costoAtencionConversacion: ca, comisionRecaudoPct, comisionRecaudoFijo,
    fleteIda, empaquePorPedido, costosFijosMes, diasOperacionMes,
  } = ctx;
  const cac = publicidad.cac();

  const precioMinimo = (n) => {
    if (cac == null) return null;
    return (costos.cogs(n) + fleteIda + comisionRecaudoFijo + empaquePorPedido
      + costos.colchonDevoluciones(n) + cac) / (1 - comisionRecaudoPct);
  };

  const descuentoMaximoPct = (n, precio) => {
    const pm = precioMinimo(n);
    if (pm == null || !(precio > 0)) return null;
    return Math.max(0, 1 - pm / precio);
  };

  const tasaEntregaMinima = (n, precio) => {
    // No depende de que haya pauta: con cc = 0 el término (cc+ca)/k se anula y
    // queda CPF/(bruto+CPF), un valor válido. Solo los range-checks de abajo lo nulean.
    const CPF = costos.costoPedidoFallido(n);
    const bruto = rent.brutoPorPedido(n, precio); // no depende de t
    const den = bruto + CPF;
    if (den <= 0) return null;
    const tm = (CPF + (cc + ca) / k) / den;
    return tm > 0 && tm <= 1 ? tm : null;
  };

  const tasaCierreMinima = (n, precio) => {
    // Sin pauta (cc = 0): si ca = 0 el numerador se anula y km = 0 => se auto-nulea
    // vía el range-check; si ca > 0 el valor sigue siendo válido.
    const uPVE = rent.utilidadPorVentaEntregada(n, precio);
    if (!(uPVE > 0)) return null;
    const km = (cc + ca) / (t * uPVE);
    return km > 0 && km <= 1 ? km : null;
  };

  const costoConversacionMaximo = (n, precio) => {
    const uPVE = rent.utilidadPorVentaEntregada(n, precio);
    const v = k * t * uPVE - ca;
    return v > 0 ? v : null;
  };

  const roasMinimo = (n, precio) => {
    const ccMax = costoConversacionMaximo(n, precio);
    return ccMax != null && ccMax > 0 ? (t * precio * k) / ccMax : null;
  };

  const unidadesDiaParaFijos = (combos, mezcla) => {
    const fijoDia = costosFijosMes / diasOperacionMes;
    if (!(fijoDia > 0)) return 0;
    const uPond = combos.reduce((acc, c) => {
      // sin pauta => CAC 0 => utilidadFinal es null y el denominador correcto ES
      // porVentaEntregada (mismo valor), no un swap silencioso de denominador.
      const u = c.utilidad.final ?? c.utilidad.porVentaEntregada ?? 0;
      return acc + (mezcla[c.n] ?? 0) * u;
    }, 0);
    return uPond > 0 ? fijoDia / uPond : null;
  };

  return {
    precioMinimo, descuentoMaximoPct, tasaEntregaMinima, tasaCierreMinima,
    costoConversacionMaximo, roasMinimo, unidadesDiaParaFijos,
  };
}
