import { aviso } from './util.js';

/** Chequeos estáticos sobre el ctx y los combos ya armados. */
export function revisar(ctx, combos) {
  const avisos = [];

  if (!(ctx.costoUnitario > 0)) {
    avisos.push(aviso('costo_faltante', 'error', 'Falta el costo del producto.'));
  }

  for (const c of combos) {
    if (c.ingreso != null && c.ingreso < ctx.costoUnitario * c.n + ctx.fleteIda) {
      avisos.push(aviso('precio_bajo_costo', 'error', `El precio del combo de ${c.n} no cubre producto + flete.`));
      break;
    }
  }

  const cpf1 = ctx.fleteIda + ctx.fleteDevolucion + ctx.feeDevolucion
    + ctx.pctProductoPerdidoEnDevolucion * ctx.costoUnitario;
  if (cpf1 === 0) {
    avisos.push(aviso('devolucion_sin_costo', 'aviso', 'No se modeló ningún costo de devolución; la contraentrega parece sin riesgo.'));
  }

  if (ctx.costoConversacion <= 0) {
    avisos.push(aviso('sin_pauta', 'aviso', 'Sin costo por conversación: no se puede evaluar CAC ni la proyección.'));
  }

  const porUnidad = combos.filter((c) => c.ingreso != null).map((c) => c.ingreso / c.n);
  for (let i = 1; i < porUnidad.length; i++) {
    if (porUnidad[i] > porUnidad[i - 1] + 1e-6) {
      avisos.push(aviso('escalera_incoherente', 'aviso', 'Un combo mayor cuesta por unidad más que uno menor.'));
      break;
    }
  }

  return avisos;
}
