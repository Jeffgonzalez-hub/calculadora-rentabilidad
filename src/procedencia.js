/**
 * Deriva el estado REAL/SUPUESTO/FALTANTE de cada parámetro económico a partir
 * de `entrada`. `entrada.procedencia` (si el llamador la da) siempre gana; si
 * no, un valor `null`/ausente es FALTANTE y un número es SUPUESTO — nunca REAL:
 * REAL solo lo declara quien conoce el origen del dato (el adaptador de UI).
 */

export const PARAMS_ECONOMICOS = [
  { clave: 'costoUnitario', ruta: ['producto', 'costoUnitario'] },
  { clave: 'fleteIda', ruta: ['supuestos', 'fleteIda'] },
  { clave: 'fleteDevolucion', ruta: ['supuestos', 'fleteDevolucion'] },
  { clave: 'feeDevolucion', ruta: ['supuestos', 'feeDevolucion'] },
  { clave: 'pctProductoPerdidoEnDevolucion', ruta: ['supuestos', 'pctProductoPerdidoEnDevolucion'] },
  { clave: 'comisionRecaudoPct', ruta: ['supuestos', 'comisionRecaudoPct'] },
  { clave: 'comisionRecaudoFijo', ruta: ['supuestos', 'comisionRecaudoFijo'] },
  { clave: 'empaquePorPedido', ruta: ['supuestos', 'empaquePorPedido'] },
  { clave: 'costoAtencionConversacion', ruta: ['supuestos', 'costoAtencionConversacion'] },
  { clave: 'tasaEntrega', ruta: ['mercado', 'tasaEntrega'] },
  { clave: 'tasaCierre', ruta: ['mercado', 'tasaCierre'] },
  { clave: 'costoConversacion', ruta: ['mercado', 'costoConversacion'] },
  { clave: 'costosFijosMes', ruta: ['overhead', 'costosFijosMes'] },
  { clave: 'diasOperacionMes', ruta: ['overhead', 'diasOperacionMes'] },
];

export const CLAVES_ECONOMICAS = PARAMS_ECONOMICOS.map((p) => p.clave);

const ESTADOS_VALIDOS = new Set(['REAL', 'SUPUESTO', 'FALTANTE', 'CONFIG']);
const ORDEN = { REAL: 0, SUPUESTO: 1, FALTANTE: 2 };

function leerRuta(obj, ruta) {
  let v = obj;
  for (const k of ruta) {
    v = v?.[k];
    if (v === undefined) return undefined;
  }
  return v;
}

export function inferirProcedencia(entrada) {
  const e = entrada ?? {};
  const dadas = e.procedencia ?? {};
  const out = {};

  // Eco de cualquier clasificación explícita y válida (incluye claves CONFIG
  // como 'objetivo.regla.valor' que no viven en PARAMS_ECONOMICOS).
  for (const [k, v] of Object.entries(dadas)) {
    if (ESTADOS_VALIDOS.has(v)) out[k] = v;
  }

  // Inferencia para las económicas que el llamador no haya clasificado.
  for (const { clave, ruta } of PARAMS_ECONOMICOS) {
    if (out[clave]) continue;
    const crudo = leerRuta(e, ruta);
    out[clave] = crudo == null ? 'FALTANTE' : 'SUPUESTO';
  }

  return out;
}

/** Peor estado entre varios (para procedencia de derivados). CONFIG no participa. */
export function peorEstado(...estados) {
  return estados.reduce((peor, act) => (ORDEN[act] > ORDEN[peor] ? act : peor), 'REAL');
}
