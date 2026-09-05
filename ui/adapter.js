// ui/adapter.js
/**
 * Adapter puro (sin DOM). Único módulo que habla los dos vocabularios:
 * form (vista básica) <-> entrada del motor, y Resultado <-> vista.
 * CERO fórmulas de negocio: formatea y remapea; los números salen del motor.
 */
import { analizar, DEFAULTS } from '../src/index.js';
import { perfilAEntrada, contarConfianza, PERFIL_DEFECTO, PRIORIDADES, ETIQUETAS } from './perfil.js';
import { pesos, pesosCompacto, pct, ratio, oGuion, numero } from './formato.js';

// Vista básica: solo costo del proveedor + margen objetivo. Todo lo demás vive
// en el Perfil económico (ui/perfil.js), no en el formulario.
export const CAMPOS = [
  { id: 'costoUnitario', tipo: 'moneda', label: 'Costo del proveedor', ayuda: 'Lo que te cuesta una unidad, sin flete.', defecto: '' },
  { id: 'margenObjetivo', tipo: 'porcentaje', label: 'Margen que quiero ganar', ayuda: 'Sobre el precio de venta, ya descontada la publicidad.', defecto: 25, presets: [15, 20, 25, 30] },
];

function parseNum(str, defecto = null) {
  if (str == null) return defecto;
  const limpio = String(str).replace(/[^\d,.\-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (limpio === '') return defecto;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : defecto;
}

/** form (strings del DOM) + perfil -> entrada anidada que consume analizar(). */
export function formToEntrada(form, perfil = PERFIL_DEFECTO) {
  const costoTexto = form.costoUnitario == null ? '' : String(form.costoUnitario).trim();
  const costoUnitario = costoTexto === '' ? null : parseNum(costoTexto, null);
  // Margen vacío -> null (estado sin_objetivo del motor). El input arranca en 25
  // pero el usuario lo puede borrar; no lo forzamos a un default acá.
  const margenTexto = form.margenObjetivo == null ? '' : String(form.margenObjetivo).trim();
  const margenPct = margenTexto === '' ? null : parseNum(margenTexto, null);

  const { supuestos, mercado, overhead, procedencia: procPerfil } = perfilAEntrada(perfil);

  return {
    producto: { costoUnitario, escaleraPrecios: [] },
    supuestos,
    mercado,
    overhead,
    objetivo: { modo: 'sugerir', regla: { tipo: 'margen_neto', valor: margenPct == null ? null : margenPct / 100 } },
    procedencia: {
      ...procPerfil,
      costoUnitario: costoUnitario == null ? 'FALTANTE' : 'REAL',
      'objetivo.regla.valor': 'CONFIG',
    },
  };
}

/** perfil -> vista de la pantalla de Perfil económico (filas + confianza + prioridades). */
export function perfilToVista(perfil) {
  const fmt = (clave, valor) => {
    if (valor == null) return '';
    if (clave === 'tasaEntrega' || clave === 'tasaCierre' || clave === 'pctProductoPerdidoEnDevolucion' || clave === 'comisionRecaudoPct') {
      return pct(valor, valor * 100 % 1 === 0 ? 0 : 1);
    }
    if (clave === 'diasOperacionMes') return numero(valor, 0);
    return pesos(valor);
  };

  const filas = Object.keys(PERFIL_DEFECTO).map((clave) => {
    const campo = perfil[clave] ?? PERFIL_DEFECTO[clave];
    return {
      clave,
      titulo: ETIQUETAS[clave].titulo,
      ayuda: ETIQUETAS[clave].ayuda,
      estado: campo.estado,
      valor: campo.valor,
      valorTexto: fmt(clave, campo.valor),
    };
  });

  const impactoDe = Object.fromEntries(PRIORIDADES.map((p) => [p.clave, p.impacto]));
  const prioridades = PRIORIDADES
    .map((p) => filas.find((f) => f.clave === p.clave))
    .filter((f) => f && f.estado === 'FALTANTE')
    .map((f) => ({ ...f, impacto: impactoDe[f.clave] }));

  return { confianza: contarConfianza(perfil), filas, prioridades };
}

// --- Resultado.recomendacion -> vista del hero card (los 8 estados de §B.7) ---

const ACENTO_POR_ESTADO = {
  sin_costo: 'neutro', sin_objetivo: 'neutro',
  no_calculable: 'rojo', no_alcanzable: 'rojo',
  ok_neto: 'verde', estimacion_neto: 'ambar',
  ok_bruto: 'rojo', estimacion_bruto: 'rojo',
};

function chipsDe(rec) {
  if (rec.tipoMargen == null) return [];
  const tipo = rec.tipoMargen === 'neto'
    ? { texto: 'NETO', tono: 'verde' }
    : { texto: 'BRUTO', tono: 'ambar' };
  const confia = rec.estado.startsWith('ok_')
    ? { texto: 'REAL', tono: 'verde' }
    : { texto: 'ESTIMADO', tono: 'ambar' };
  return [tipo, confia];
}

function lineaConfianza(rec) {
  const s = rec.confianza.supuestos.length;
  const f = rec.confianza.faltantesAsumidosCero.length;
  const partes = [];
  if (s > 0) partes.push(`${s} supuesto${s === 1 ? '' : 's'} usado${s === 1 ? '' : 's'}`);
  if (f > 0) partes.push(`${f} dato${f === 1 ? '' : 's'} faltante${f === 1 ? '' : 's'} — no asumido${f === 1 ? '' : 's'} en $0, se avisan abajo`);
  if (!rec.confianza.cacDisponible) partes.unshift('falta el costo por conversación (CAC): precio en modo operativo, no neto');
  return partes.join(' · ');
}

function porQueDe(rec) {
  if (rec.estado === 'no_calculable') {
    return 'El flete de ida entra directo en el costo que cada venta entregada tiene que cubrir, incluida su parte del colchón por devoluciones. Sin ese número no hay un precio honesto que darte — por eso lo bloqueamos en vez de asumir $0.';
  }
  if (rec.estado === 'sin_costo') return 'Escribí el costo del proveedor para empezar.';
  if (rec.estado === 'sin_objetivo') return 'Elegí el margen que querés ganar.';
  if (rec.estado === 'no_alcanzable') return 'El margen que pediste más la comisión de recaudo se comen todo el precio. Bajá el margen o revisá la comisión.';
  const sinCac = !rec.confianza.cacDisponible;
  return sinCac
    ? 'Este precio junta el costo del producto, el flete de ida y vuelta, y un colchón para las devoluciones que no llegan — pero todavía NO incluye lo que cuesta conseguir la venta, porque ese dato falta.'
    : 'Este precio junta el costo del producto, el flete de ida y vuelta, un colchón para las devoluciones que no llegan, y lo que cuesta conseguir cada venta — todo dividido entre el margen que querés ganar.';
}

function ctaDe(rec) {
  switch (rec.estado) {
    case 'sin_costo': return { texto: 'Escribí el costo del proveedor', destino: 'costo' };
    case 'sin_objetivo': return { texto: 'Elegí el margen', destino: 'margen' };
    case 'no_calculable': return { texto: `Completá ${rec.parametroFaltante === 'fleteIda' ? 'el flete de ida' : rec.parametroFaltante} en el Perfil económico`, destino: 'perfil', clave: rec.parametroFaltante };
    case 'no_alcanzable': return { texto: 'Ajustá el margen o la comisión', destino: 'margen' };
    case 'ok_neto': return null;
    default: return { texto: 'Mejorar precisión', destino: 'perfil' };
  }
}

function advertenciaDe(rec) {
  if (rec.estado !== 'ok_bruto' && rec.estado !== 'estimacion_bruto') return '';
  return 'Este precio NO incluye publicidad — es margen operativo, no margen neto garantizado. '
    + 'Cuando cargués tu costo real de conseguir cada venta, el margen neto real puede quedar bastante por debajo de este número.';
}

export function recomendacionToVista(resultado) {
  const rec = resultado.recomendacion;
  const pmo1 = (resultado.equilibrio.precioMinimoOperativo ?? []).find((p) => p.n === 1)?.valor ?? null;
  const muestraPrecio = rec.precio != null;

  const tituloBloqueo = {
    sin_costo: 'Escribí el costo del proveedor',
    sin_objetivo: 'Elegí el margen que querés ganar',
    no_calculable: `Falta ${rec.parametroFaltante === 'fleteIda' ? 'el flete de ida' : rec.parametroFaltante} para calcular`,
    no_alcanzable: `Un margen del ${Math.round((rec.margenObjetivo ?? 0) * 100)}% no es posible con esta comisión de recaudo`,
  };

  const lineaMargen = muestraPrecio
    ? `Margen ${rec.tipoMargen} objetivo ${pct(rec.margenObjetivo ?? 0, 0)} → logrado ${oGuion(rec.margenLogrado, (x) => '≈ ' + pct(x, 1))}`
    : '';
  const lineaUtilidad = muestraPrecio
    ? (rec.tipoMargen === 'neto'
        ? `Utilidad neta estimada por venta entregada ${oGuion(rec.utilidadNeta, (x) => '≈ ' + pesos(x))}`
        : `Utilidad operativa estimada por venta entregada ${oGuion(rec.utilidadPorVentaEntregada, (x) => '≈ ' + pesos(x))} — sin restar publicidad`)
    : '';

  return {
    estado: rec.estado,
    muestraPrecio,
    precio: muestraPrecio ? pesos(rec.precio) : null,
    acento: ACENTO_POR_ESTADO[rec.estado] ?? 'neutro',
    chips: muestraPrecio ? chipsDe(rec) : [],
    titulo: muestraPrecio ? '' : (tituloBloqueo[rec.estado] ?? 'Sin recomendación'),
    lineaMargen,
    lineaUtilidad,
    advertencia: advertenciaDe(rec),
    confianza: muestraPrecio ? lineaConfianza(rec) : '',
    porQue: porQueDe(rec),
    cta: ctaDe(rec),
    precioMinimoOperativo: pmo1 == null ? null : pesos(pmo1),
  };
}

// --- Resultado del motor → vista que pinta el renderer ---

const ANCHO_SEMAFORO = { premium: 100, sano: 75, apretado: 48, 'muy-apretado': 25, pierde: 12, 'sin-dato': 0 };
const ETIQUETA_SEMAFORO = {
  premium: 'Margen premium', sano: 'Margen sano', apretado: 'Apretado',
  'muy-apretado': 'Muy apretado', pierde: 'Pierde plata', 'sin-dato': 'Sin datos',
};
const LABEL_PARTE = {
  cogs: 'Producto', fleteIda: 'Flete', comisionRecaudo: 'Comisión de recaudo',
  empaque: 'Empaque', colchonDevoluciones: 'Colchón devoluciones', utilidad: 'Tu utilidad',
};
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const pctFr = (f, d = 0) => pct(f, d);

function vistaAvisos(avisos) {
  const lista = avisos.map((a) => ({ ...a, clase: a.nivel === 'error' ? 'av-error' : 'av-aviso' }));
  const resumen = { errores: 0, avisos: 0 };
  for (const a of lista) resumen[a.nivel === 'error' ? 'errores' : 'avisos']++;
  return { lista, resumen };
}

function vistaCombos(r) {
  return r.combos.map((c) => ({
    n: c.n,
    titulo: `${c.n} unidad${c.n > 1 ? 'es' : ''}`,
    esMejor: c.n === r.mejorCombo.n,
    precio: pesos(c.ingreso),
    precioRaw: c.ingreso,
    precioUnidad: pesos(c.ingreso / c.n),
    esSugerido: c.esSugerido,
    precioSugerido: pesos(c.precioSugerido),
    editable: false,
    gana: oGuion(c.utilidad.final, pesos),
    margenNeto: oGuion(c.margen.neto, pctFr),
    margenBruto: oGuion(c.margen.bruto, pctFr),
    markup: oGuion(c.markup.sobreProducto, ratio),
    cac: oGuion(c.cac, pesos),
    descuentoMax: oGuion(c.descuentoMaximoPct, pctFr),
    semaforo: {
      nivel: c.semaforo.nivel,
      clase: 'sem-' + c.semaforo.nivel,
      anchoPct: ANCHO_SEMAFORO[c.semaforo.nivel] ?? 0,
      etiqueta: ETIQUETA_SEMAFORO[c.semaforo.nivel] ?? '',
    },
  }));
}

function vistaDesglose(r, comboN = 1) {
  const c = r.combos.find((x) => x.n === comboN) || r.combos[0];
  const ing = c.ingreso;
  const claves = ['cogs', 'fleteIda', 'comisionRecaudo', 'empaque', 'colchonDevoluciones'];
  const base = claves.map((k) => c.costo[k]);
  const sumaCostos = base.reduce((a, b) => a + b, 0);
  const utilidad = ing - sumaCostos;
  const perdida = utilidad < 0; // algún componente > precio (caso precio_bajo_costo)
  const montos = [...base, utilidad];
  const partes = [...claves, 'utilidad'].map((k, i) => {
    let anchoPct;
    if (k === 'utilidad') {
      // en pérdida la utilidad es negativa: no ocupa barra.
      anchoPct = perdida ? 0 : ing > 0 ? clamp((montos[i] / ing) * 100, 0, 100) : 0;
    } else if (perdida) {
      // reparto proporcional de las 5 partes de costo sobre su propia suma (≈100 %).
      anchoPct = sumaCostos > 0 ? (montos[i] / sumaCostos) * 100 : 0;
    } else {
      anchoPct = ing > 0 ? clamp((montos[i] / ing) * 100, 0, 100) : 0;
    }
    return { clave: k, label: LABEL_PARTE[k], monto: pesos(montos[i]), anchoPct, clase: 'part-' + (i + 1) };
  });
  return {
    comboN: c.n,
    clase: perdida ? 'barra-perdida' : '',
    precio: pesos(ing),
    precioRaw: ing,
    partes,
    cac: oGuion(c.cac, pesos),
    notaCac: 'No es costo de la unidad: es lo que cuesta traer al cliente que paga (pauta + atención ÷ cierre ÷ entrega).',
  };
}

function filaEquilibrio(clave, label, limite, actual, tipo, dir) {
  // tipo: 'moneda' | 'pct' | 'ratio' | 'numero'.  dir: 'min' (actual debe superar el límite) | 'max' (actual debe estar por debajo).
  const fmt = tipo === 'moneda' ? pesos
    : tipo === 'ratio' ? ratio
    : tipo === 'numero' ? ((x) => numero(x, 1))
    : (x) => pct(x, 1);
  const alcanzable = limite != null;
  let clase = 'eq-ok';
  let holguraPct = 0;
  if (alcanzable && actual != null && limite > 0) {
    const rel = Math.abs(actual - limite) / limite;
    const perdiendo = dir === 'min' ? actual < limite : actual > limite;
    clase = perdiendo ? 'eq-malo' : rel < 0.15 ? 'eq-ajustado' : 'eq-ok';
    // una fila que ya cruzó al lado perdedor no tiene "holgura": barra en 0.
    holguraPct = perdiendo ? 0 : clamp(rel * 100, 0, 100);
  }
  return {
    clave, label,
    limite: alcanzable ? fmt(limite) : '—',
    actualLabel: actual == null ? '' : dir === 'max' ? 'hoy pagás' : 'tu valor',
    actual: actual == null ? '' : fmt(actual),
    holguraPct, clase, alcanzable,
  };
}

function vistaEquilibrio(r) {
  const eq = r.equilibrio;
  const m = r.entradaNormalizada.mercado;
  const ing1 = r.combos[0].ingreso;
  // El motor devuelve 0 (no null) cuando no hay costos fijos: sin fijos no hay meta de unidades → "—".
  const uFijos = eq.unidadesDiaParaFijos;
  const pmo1 = (r.equilibrio.precioMinimoOperativo ?? []).find((p) => p.n === 1)?.valor ?? null;
  const filas = [
    filaEquilibrio('precioMinimoOperativo', 'Precio mínimo operativo (1u)', pmo1, ing1, 'moneda', 'min'),
    filaEquilibrio('precioMinimo', 'Precio mínimo con CAC (1u)', r.equilibrio.precioMinimo[0]?.valor, ing1, 'moneda', 'min'),
    filaEquilibrio('entregaMinima', 'Entrega mínima', eq.tasaEntregaMinima, m.tasaEntrega, 'pct', 'min'),
    filaEquilibrio('cierreMinimo', 'Cierre mínimo', eq.tasaCierreMinima, m.tasaCierre, 'pct', 'min'),
    filaEquilibrio('costoConvMax', 'Costo/conversación máx', eq.costoConversacionMaximo, m.costoConversacion, 'moneda', 'max'),
    filaEquilibrio('roasMinimo', 'ROAS mínimo', eq.roasMinimo, r.combos[0].roas.actual, 'ratio', 'min'),
    filaEquilibrio('unidadesDiaFijos', 'Unidades/día para fijos', uFijos > 0 ? uFijos : null, null, 'numero', 'min'),
  ];
  // etiqueta de actual más específica
  filas[0].actualLabel = filas[1].actualLabel = 'vendés a';
  filas[2].actualLabel = filas[3].actualLabel = 'tu tasa';
  filas[5].actualLabel = 'tu ROAS';
  return filas;
}

function vistaProyeccion(r) {
  const p = r.proyeccion;
  if (p.utilidadMes == null) {
    return {
      disponible: false,
      nota: 'Cargá presupuesto de pauta y costo por conversación para proyectar.',
      pedidosDia: '—', ventasEntregadasDia: '—', utilidadDia: '—', utilidadMes: '—',
    };
  }
  return {
    disponible: true,
    // sub-1 por día: 2 decimales para no perder el "0,75" en un "0,8".
    pedidosDia: numero(p.pedidosDia, 2),
    ventasEntregadasDia: numero(p.ventasEntregadasDia, 2),
    utilidadDia: pesos(p.utilidadDia),
    utilidadDiaRaw: p.utilidadDia,
    utilidadMes: pesos(p.utilidadMes),
    utilidadMesRaw: p.utilidadMes,
    nota: 'Ya restados pauta, atención y costos fijos.',
  };
}

export function resultadoToVista(resultado, comboSeleccionado = 1) {
  const av = vistaAvisos(resultado.avisos);
  return {
    meta: { comboSeleccionado },
    avisos: av.lista,
    resumenAvisos: av.resumen,
    combos: vistaCombos(resultado),
    desglose: vistaDesglose(resultado, comboSeleccionado),
    equilibrio: vistaEquilibrio(resultado),
    proyeccion: vistaProyeccion(resultado),
    escenarios: null,
  };
}

// --- Escenarios: resultado.escenarios → vista.escenarios ---

const LABELS_VAR = {
  costoConversacion: 'Costo por conversación',
  tasaEntrega: 'Tasa de entrega',
  costoPedidoFallido: 'Costo de devolución',
  precio: 'Precio',
  tasaCierre: 'Tasa de cierre',
};
const signo = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);
const pesosConSigno = (n) => (n < 0 ? '−' : '+') + pesos(Math.abs(n));

function vistaSensibilidad(sens) {
  const variables = Object.entries(sens).map(([clave, pasos]) => {
    const label = LABELS_VAR[clave] || clave;
    // el motor devuelve null en cada paso cuando no hay datos de pauta.
    const conDato = pasos.filter((p) => p.utilidadFinal != null);
    if (conDato.length === 0) {
      return {
        clave, label, puntos: [], cruceXPct: null, disponible: false,
        ejeY: { ceroPct: 50, max: '—', min: '—' },
      };
    }
    const vals = conDato.map((p) => p.utilidadFinal);
    let min = Math.min(...vals), max = Math.max(...vals);
    const plana = !(max > min);
    if (plana) { min -= 1; max += 1; } // serie plana ⇒ línea horizontal al medio
    const margen = (max - min) * 0.08;
    min -= margen; max += margen;
    const norm = (v) => ((v - min) / (max - min)) * 100;
    const puntos = [];
    pasos.forEach((p, i) => {
      if (p.utilidadFinal == null) return; // saltar huecos, no graficarlos
      puntos.push({
        xPct: i * 10,
        yPct: plana ? 50 : clamp(100 - norm(p.utilidadFinal), 0, 100),
        valor: oGuion(p.utilidadFinal, pesos),
        valorRaw: p.utilidadFinal,
        delta: (p.delta > 0 ? '+' : '') + pct(p.delta, 0),
      });
    });
    let cruceXPct = null;
    for (let i = 1; i < puntos.length; i++) {
      const a = puntos[i - 1].valorRaw, b = puntos[i].valorRaw;
      if (a == null || b == null || a === 0) continue;
      if (signo(a) !== signo(b)) {
        const t = a / (a - b); // 0..1 entre los dos puntos
        cruceXPct = clamp(puntos[i - 1].xPct + t * (puntos[i].xPct - puntos[i - 1].xPct), 0, 100);
        break;
      }
    }
    return {
      clave, label,
      puntos: puntos.map(({ valorRaw, ...p }) => p),
      cruceXPct,
      disponible: true,
      ejeY: {
        ceroPct: plana ? 50 : clamp(100 - norm(0), 0, 100),
        max: pesosCompacto(max), min: pesosCompacto(min),
      },
    };
  });
  return { variables };
}

function vistaTornado(filas) {
  const maxMag = Math.max(1, ...filas.map((f) => Math.max(Math.abs(f.impactoAbajo ?? 0), Math.abs(f.impactoArriba ?? 0))));
  // barras divergentes desde x=50: cada lado dispone de 50 unidades de ancho.
  return filas.map((f) => ({
    clave: f.variable,
    label: LABELS_VAR[f.variable] || f.variable,
    abajoPct: clamp((Math.abs(f.impactoAbajo ?? 0) / maxMag) * 50, 0, 50),
    arribaPct: clamp((Math.abs(f.impactoArriba ?? 0) / maxMag) * 50, 0, 50),
    abajo: f.impactoAbajo == null ? '—' : pesosConSigno(f.impactoAbajo),
    arriba: f.impactoArriba == null ? '—' : pesosConSigno(f.impactoArriba),
    dirAbajo: (f.impactoAbajo ?? 0) < 0 ? 'neg' : 'pos',
    dirArriba: (f.impactoArriba ?? 0) < 0 ? 'neg' : 'pos',
  }));
}

function vistaMatriz(mx) {
  // rampa divergente calculada solo con celdas que tienen dato.
  const conDato = mx.celdas.flat().map((c) => c.utilidadMes).filter((v) => v != null);
  const esc = Math.max(1, ...conDato.map((v) => Math.abs(v)));
  const clase = (v) => {
    const r = v / esc;
    if (r <= -0.5) return 'mx-n2';
    if (r < -0.05) return 'mx-n1';
    if (r <= 0.05) return 'mx-0';
    if (r < 0.5) return 'mx-p1';
    return 'mx-p2';
  };
  let actual = { fila: 0, col: 0 };
  const celdas = mx.celdas.map((fila, i) => fila.map((c, j) => {
    if (c.actual) actual = { fila: i, col: j };
    return {
      valor: oGuion(c.utilidadMes, pesosCompacto),
      clase: c.utilidadMes == null ? 'mx-sin-dato' : clase(c.utilidadMes),
      actual: !!c.actual,
    };
  }));
  return {
    ejeEntrega: mx.ejes.entrega.map((x) => pct(x)),
    ejeCierre: mx.ejes.cierre.map((x) => pct(x)),
    celdas, actual,
  };
}

function vistaEscenarios(esc) {
  if (!esc) return null;
  return {
    sensibilidad: vistaSensibilidad(esc.sensibilidad),
    tornado: vistaTornado(esc.tornado),
    matriz: vistaMatriz(esc.matrizEntregaCierre),
  };
}

// --- Funciones públicas ---

export function analizarDesdeFormulario(form, perfil, comboSeleccionado = 1) {
  const entrada = formToEntrada(form, perfil);
  const resultado = analizar(entrada, { conEscenarios: false });
  return {
    vista: resultadoToVista(resultado, comboSeleccionado),
    hero: recomendacionToVista(resultado),
    entradaNormalizada: resultado.entradaNormalizada,
    avisos: resultado.avisos,
  };
}

export function escenariosDesdeFormulario(form, perfil) {
  const entrada = formToEntrada(form, perfil);
  const resultado = analizar(entrada, { conEscenarios: true });
  return vistaEscenarios(resultado.escenarios);
}
