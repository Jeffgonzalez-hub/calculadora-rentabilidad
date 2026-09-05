// src/index.js
import { normalizarEntrada, DEFAULTS } from './normalizar.js';
import { crearCostos } from './costos.js';
import { crearPublicidad } from './publicidad.js';
import { crearRentabilidad } from './rentabilidad.js';
import { crearCombos } from './combos.js';
import { crearEquilibrio } from './equilibrio.js';
import { revisar } from './validacion.js';
import { construirRecomendacion } from './recomendacion.js';
import { peorEstado, CLAVES_ECONOMICAS } from './procedencia.js';
import { sensibilidadUnaVariable, tornado, matrizEntregaCierre, VARIABLES } from './escenarios.js';
import { aviso } from './util.js';

// precioRecomendado hereda el peor estado de todo lo que participa en su fórmula
// (§A.6/§A.7) — costosFijosMes/diasOperacionMes son "diagnóstico" (§A.4.1): no
// entran en el precio, así que no degradan su procedencia.
const CLAVES_QUE_AFECTAN_EL_PRECIO = CLAVES_ECONOMICAS.filter((k) => k !== 'costosFijosMes' && k !== 'diasOperacionMes');

export { normalizarEntrada, DEFAULTS };

function elegirMejorCombo(combos) {
  const conFinal = combos.filter((c) => c.utilidad.final != null);
  const pool = conFinal.length ? conFinal : combos;
  const clave = conFinal.length ? 'final' : 'porVentaEntregada';
  const mejor = pool.reduce((a, b) => (b.utilidad[clave] > a.utilidad[clave] ? b : a));
  const criterio = conFinal.length
    ? 'mayor utilidad limpia por venta entregada'
    : 'mayor utilidad por venta entregada (sin descontar pauta)';
  return { n: mejor.n, criterio };
}

function calcularProyeccion(ctx, combos, rent) {
  const {
    costoConversacion: cc, costoAtencionConversacion: ca, tasaCierre: k, tasaEntrega: t,
    presupuestoDia: B, costosFijosMes, diasOperacionMes, mezcla,
  } = ctx;

  if (!(cc > 0)) {
    return { pedidosDia: 0, ventasEntregadasDia: 0, utilidadDia: null, utilidadMes: null };
  }
  if (!(B > 0)) {
    const fijoDia = costosFijosMes / diasOperacionMes;
    return {
      pedidosDia: 0, ventasEntregadasDia: 0,
      utilidadDia: -fijoDia, utilidadMes: -fijoDia * diasOperacionMes,
    };
  }

  const conversacionesDia = B / cc;
  const pedidosDia = conversacionesDia * k;
  const ventasEntregadasDia = pedidosDia * t;
  const uPPpond = combos.reduce((acc, c) => acc + (mezcla[c.n] ?? 0) * rent.utilidadPorPedido(c.n, c.ingreso), 0);
  const utilidadDia = pedidosDia * uPPpond - B - conversacionesDia * ca - costosFijosMes / diasOperacionMes;
  return { pedidosDia, ventasEntregadasDia, utilidadDia, utilidadMes: utilidadDia * diasOperacionMes };
}

export function analizar(entrada, { conEscenarios = false } = {}) {
  const { ctx, entradaNormalizada, avisos: avisosNorm, procedencia } = normalizarEntrada(entrada);
  const avisos = [...avisosNorm];

  const costos = crearCostos(ctx);
  const publicidad = crearPublicidad(ctx);
  const rent = crearRentabilidad(ctx, costos, publicidad);
  const combosMod = crearCombos(ctx, costos, rent);
  const eq = crearEquilibrio(ctx, costos, rent, publicidad);

  const combos = [];
  for (const n of [1, 2, 3]) {
    const { combo, avisos: av } = combosMod.evaluarCombo(n);
    combo.roas = {
      actual: publicidad.roasActual(combo.ingreso),
      equilibrio: eq.roasMinimo(n, combo.ingreso),
    };
    combo.descuentoMaximoPct = eq.descuentoMaximoPct(n, combo.ingreso);
    combos.push(combo);
    avisos.push(...av);
  }

  avisos.push(...revisar(ctx, combos, procedencia));

  const precioCrudoDe1 = combosMod.precioCrudo(1);
  const recomendacion = construirRecomendacion(ctx, procedencia, combos[0], rent, publicidad, precioCrudoDe1);
  avisos.push(...recomendacion.avisos);

  // §A.5: "procedencia de un derivado = el peor estado entre sus insumos" — cac y
  // el precio recomendado son los dos derivados que el spec pide exponer por nombre.
  procedencia.cac = peorEstado(procedencia.costoConversacion, procedencia.costoAtencionConversacion);
  procedencia.precioRecomendado = peorEstado(...CLAVES_QUE_AFECTAN_EL_PRECIO.map((k) => procedencia[k]));

  const ing1 = combos[0].ingreso;
  const equilibrio = {
    precioMinimo: combos.map((c) => ({ n: c.n, valor: eq.precioMinimo(c.n) })),
    precioMinimoOperativo: combos.map((c) => ({ n: c.n, valor: eq.precioMinimoOperativo(c.n) })),
    tasaEntregaMinima: eq.tasaEntregaMinima(1, ing1),
    tasaCierreMinima: eq.tasaCierreMinima(1, ing1),
    costoConversacionMaximo: eq.costoConversacionMaximo(1, ing1),
    roasMinimo: eq.roasMinimo(1, ing1),
    unidadesDiaParaFijos: eq.unidadesDiaParaFijos(combos, ctx.mezcla),
  };

  const equilibrioNulos =
    equilibrio.precioMinimo.some((p) => p.valor == null)
    || equilibrio.roasMinimo == null
    || equilibrio.unidadesDiaParaFijos == null
    || (publicidad.disponible
      && [equilibrio.tasaEntregaMinima, equilibrio.tasaCierreMinima, equilibrio.costoConversacionMaximo]
        .some((v) => v == null));
  if (equilibrioNulos) {
    avisos.push(aviso('equilibrio_inalcanzable', 'aviso', 'Algún punto de equilibrio quedó fuera de rango.'));
  }

  const proyeccion = calcularProyeccion(ctx, combos, rent);
  const mejorCombo = elegirMejorCombo(combos);

  let escenarios = null;
  if (conEscenarios) {
    const A = (e) => analizar(e, { conEscenarios: false });
    escenarios = {
      sensibilidad: Object.fromEntries(VARIABLES.map((v) => [v, sensibilidadUnaVariable(entradaNormalizada, v, A)])),
      tornado: tornado(entradaNormalizada, A),
      matrizEntregaCierre: matrizEntregaCierre(entradaNormalizada, A),
    };
  }

  return { entradaNormalizada, procedencia, avisos, combos, mejorCombo, equilibrio, recomendacion, proyeccion, escenarios };
}
