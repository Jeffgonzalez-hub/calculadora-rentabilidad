export const VARIABLES = ['costoConversacion', 'tasaEntrega', 'costoPedidoFallido', 'precio', 'tasaCierre'];

/** Devuelve una copia de la entrada con `variable` escalada por `factor`. */
function escalar(entrada, variable, factor) {
  const e = structuredClone(entrada);
  e.mercado = e.mercado ?? {};
  e.supuestos = e.supuestos ?? {};
  e.producto = e.producto ?? {};
  e.objetivo = e.objetivo ?? {};

  if (variable === 'costoConversacion') e.mercado.costoConversacion = (e.mercado.costoConversacion ?? 0) * factor;
  else if (variable === 'tasaEntrega') e.mercado.tasaEntrega = (e.mercado.tasaEntrega ?? 0.75) * factor;
  else if (variable === 'tasaCierre') e.mercado.tasaCierre = (e.mercado.tasaCierre ?? 0.20) * factor;
  else if (variable === 'costoPedidoFallido') {
    for (const k of ['fleteIda', 'fleteDevolucion', 'feeDevolucion', 'pctProductoPerdidoEnDevolucion']) {
      if (e.supuestos[k] != null) e.supuestos[k] *= factor;
    }
  } else if (variable === 'precio') {
    // "subir/bajar el precio": en modo evaluar mueve precioBase y la escalera;
    // en modo sugerir mueve la utilidad objetivo (proxy razonable).
    if (e.producto.precioBase != null) e.producto.precioBase *= factor;
    if (Array.isArray(e.producto.escaleraPrecios)) {
      e.producto.escaleraPrecios = e.producto.escaleraPrecios.map((f) => ({ ...f, precio: f.precio * factor }));
    }
    if ((e.objetivo.modo ?? 'sugerir') === 'sugerir' && e.objetivo.utilidadObjetivo != null) {
      e.objetivo.utilidadObjetivo *= factor;
    }
  }
  return e;
}

export function sensibilidadUnaVariable(entrada, variable, analizar) {
  const pasos = [];
  for (let i = -5; i <= 5; i++) {
    const delta = i / 10;
    const r = analizar(escalar(entrada, variable, 1 + delta));
    const c = r.combos[0];
    pasos.push({
      delta,
      utilidadFinal: c.utilidad.final,
      margenNeto: c.margen.neto,
      utilidadMes: r.proyeccion.utilidadMes,
      cruzaCero: false,
    });
  }
  for (let i = 1; i < pasos.length; i++) {
    const a = pasos[i - 1].utilidadFinal;
    const b = pasos[i].utilidadFinal;
    if (a != null && b != null && a !== 0 && Math.sign(a) !== Math.sign(b)) {
      pasos[i].cruzaCero = true;
      break;
    }
  }
  return pasos;
}

export function tornado(entrada, analizar) {
  const base = analizar(entrada).combos[0].utilidad.final;
  const filas = VARIABLES.map((variable) => {
    const abajo = analizar(escalar(entrada, variable, 0.9)).combos[0].utilidad.final;
    const arriba = analizar(escalar(entrada, variable, 1.1)).combos[0].utilidad.final;
    return {
      variable,
      impactoAbajo: abajo != null && base != null ? abajo - base : null,
      impactoArriba: arriba != null && base != null ? arriba - base : null,
    };
  });
  const mag = (f) => Math.max(Math.abs(f.impactoAbajo ?? 0), Math.abs(f.impactoArriba ?? 0));
  filas.sort((a, b) => mag(b) - mag(a));
  return filas;
}

export function matrizEntregaCierre(entrada, analizar) {
  const entregas = [0.5, 0.6, 0.7, 0.8, 0.9];
  const cierres = [0.10, 0.15, 0.20, 0.25, 0.30];
  const cerca = (arr, v) => arr.reduce((p, c) => (Math.abs(c - v) < Math.abs(p - v) ? c : p), arr[0]);
  const actualT = cerca(entregas, entrada?.mercado?.tasaEntrega ?? 0.75);
  const actualK = cerca(cierres, entrada?.mercado?.tasaCierre ?? 0.20);

  const celdas = entregas.map((te) => cierres.map((tk) => {
    const e = structuredClone(entrada);
    e.mercado = { ...(e.mercado ?? {}), tasaEntrega: te, tasaCierre: tk };
    return {
      entrega: te,
      cierre: tk,
      utilidadMes: analizar(e).proyeccion.utilidadMes,
      actual: te === actualT && tk === actualK,
    };
  }));

  return { ejes: { entrega: entregas, cierre: cierres }, celdas };
}
