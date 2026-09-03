/** Rentabilidad por combo. Factory sobre ctx + costos + publicidad. */
export function crearRentabilidad(ctx, costos, publicidad) {
  const { fleteIda, empaquePorPedido, tasaEntrega: t } = ctx;
  const { cogs, costoPedidoFallido, comisionRecaudo } = costos;
  const cac = publicidad.cac();

  const brutoPorPedido = (n, precio) =>
    precio - cogs(n) - fleteIda - comisionRecaudo(precio) - empaquePorPedido;

  const utilidadPorPedido = (n, precio) =>
    t * brutoPorPedido(n, precio) - (1 - t) * costoPedidoFallido(n);

  const utilidadPorVentaEntregada = (n, precio) =>
    utilidadPorPedido(n, precio) / t;

  const utilidadFinal = (n, precio) =>
    (cac == null ? null : utilidadPorVentaEntregada(n, precio) - cac);

  const margen = (n, precio) => {
    if (!(precio > 0)) return { bruto: null, neto: null };
    // margen.bruto excluye empaquePorPedido a propósito (spec); brutoPorPedido sí lo incluye.
    const brutoAntes = precio - cogs(n) - fleteIda - comisionRecaudo(precio);
    const final = utilidadFinal(n, precio);
    return { bruto: brutoAntes / precio, neto: final == null ? null : final / precio };
  };

  const markup = (n, precio) => {
    const base = cogs(n);
    const baseFlete = cogs(n) + fleteIda;
    return {
      sobreProducto: base > 0 ? precio / base : null,
      sobreProductoYFlete: baseFlete > 0 ? precio / baseFlete : null,
    };
  };

  return { brutoPorPedido, utilidadPorPedido, utilidadPorVentaEntregada, utilidadFinal, margen, markup, cac };
}
