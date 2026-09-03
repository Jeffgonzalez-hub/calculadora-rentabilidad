/** Costos del modelo COD. Factory que cierra sobre el ctx normalizado. */
export function crearCostos(ctx) {
  const {
    costoUnitario: C, fleteIda, fleteDevolucion, feeDevolucion,
    pctProductoPerdidoEnDevolucion: pctPerd,
    comisionRecaudoPct, comisionRecaudoFijo, empaquePorPedido,
    tasaEntrega: t,
  } = ctx;

  const cogs = (n) => C * n;

  const costoPedidoFallido = (n) =>
    fleteIda + fleteDevolucion + feeDevolucion + pctPerd * C * n;

  const colchonDevoluciones = (n) =>
    ((1 - t) / t) * costoPedidoFallido(n);

  const comisionRecaudo = (precio) =>
    comisionRecaudoPct * precio + comisionRecaudoFijo;

  const costoTotalPorVenta = (n, precio, cac) =>
    cogs(n) + fleteIda + comisionRecaudo(precio) + empaquePorPedido
    + colchonDevoluciones(n) + cac;

  return { cogs, costoPedidoFallido, colchonDevoluciones, comisionRecaudo, costoTotalPorVenta };
}
