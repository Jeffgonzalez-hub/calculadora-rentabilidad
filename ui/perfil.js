/**
 * Perfil económico de JDSMPlus: cada parámetro con su valor y su estado
 * (REAL / SUPUESTO / FALTANTE). Persiste en localStorage. CERO fórmulas:
 * solo guarda, lee y remapea a la forma que espera entrada del motor.
 */

const CLAVE_STORAGE = 'calc-rentabilidad-perfil-v2';
const ESTADOS_PERFIL = new Set(['REAL', 'SUPUESTO', 'FALTANTE']);

// Defaults de docs/diseno-v2.md §A.2 (tabla de parámetros).
export const PERFIL_DEFECTO = Object.freeze({
  fleteIda: { valor: 20000, estado: 'SUPUESTO' },
  tasaEntrega: { valor: 0.75, estado: 'SUPUESTO' },
  tasaCierre: { valor: 0.20, estado: 'SUPUESTO' },
  costoConversacion: { valor: 4000, estado: 'SUPUESTO' },
  diasOperacionMes: { valor: 30, estado: 'SUPUESTO' },
  fleteDevolucion: { valor: null, estado: 'FALTANTE' },
  feeDevolucion: { valor: null, estado: 'FALTANTE' },
  pctProductoPerdidoEnDevolucion: { valor: null, estado: 'FALTANTE' },
  comisionRecaudoPct: { valor: null, estado: 'FALTANTE' },
  comisionRecaudoFijo: { valor: null, estado: 'FALTANTE' },
  empaquePorPedido: { valor: null, estado: 'FALTANTE' },
  costoAtencionConversacion: { valor: null, estado: 'FALTANTE' },
  costosFijosMes: { valor: null, estado: 'FALTANTE' },
});

// Orden de la lista "esto es lo que más cambiaría tu precio" (§B.5).
// 'precio' = entra en la fórmula del precio recomendado; 'diagnostico' = solo
// afecta la métrica de "unidades/día para fijos", no el precio.
export const PRIORIDADES = Object.freeze([
  { clave: 'comisionRecaudoPct', impacto: 'precio' },
  { clave: 'pctProductoPerdidoEnDevolucion', impacto: 'precio' },
  { clave: 'empaquePorPedido', impacto: 'precio' },
  { clave: 'fleteDevolucion', impacto: 'precio' },
  { clave: 'feeDevolucion', impacto: 'precio' },
  { clave: 'comisionRecaudoFijo', impacto: 'precio' },
  { clave: 'costoAtencionConversacion', impacto: 'precio' },
  { clave: 'costosFijosMes', impacto: 'diagnostico' },
]);

export const ETIQUETAS = Object.freeze({
  fleteIda: { titulo: 'Flete de ida', ayuda: 'Lo que pagás por enviarle el pedido al cliente. Se paga entregue o no.' },
  tasaEntrega: { titulo: 'Tasa de entrega', ayuda: '% de pedidos generados que terminan entregados y pagados.' },
  tasaCierre: { titulo: 'Tasa de cierre', ayuda: '% de conversaciones que terminan en un pedido.' },
  costoConversacion: { titulo: 'Costo por conversación', ayuda: 'Pauta invertida ÷ conversaciones generadas.' },
  diasOperacionMes: { titulo: 'Días de operación al mes', ayuda: 'Para repartir los costos fijos y proyectar.' },
  fleteDevolucion: { titulo: 'Flete de devolución', ayuda: 'Lo que cuesta que la guía vuelva cuando el pedido rebota.' },
  feeDevolucion: { titulo: 'Fee fijo por devolución', ayuda: 'Cargo fijo del operador logístico cuando una guía se devuelve.' },
  pctProductoPerdidoEnDevolucion: { titulo: '% de producto perdido en una devolución', ayuda: 'Qué parte del costo del producto no recuperás cuando vuelve.' },
  comisionRecaudoPct: { titulo: 'Comisión de recaudo (%)', ayuda: '% que la pasarela / transportadora cobra sobre el valor recaudado.' },
  comisionRecaudoFijo: { titulo: 'Comisión de recaudo (fija)', ayuda: 'Monto fijo por pedido entregado que cobra la pasarela.' },
  empaquePorPedido: { titulo: 'Empaque por pedido', ayuda: 'Caja, relleno, etiqueta — el costo de armar el paquete.' },
  costoAtencionConversacion: { titulo: 'Costo de atender la conversación', ayuda: 'Tiempo del asesor o de la herramienta, aparte del costo de la pauta.' },
  costosFijosMes: { titulo: 'Costos fijos al mes', ayuda: 'Sueldos, software, arriendo — lo que pagás vendas o no.' },
});

// Mapa clave del perfil -> rama de entrada del motor.
const RAMA = {
  fleteIda: 'supuestos', fleteDevolucion: 'supuestos', feeDevolucion: 'supuestos',
  pctProductoPerdidoEnDevolucion: 'supuestos', comisionRecaudoPct: 'supuestos',
  comisionRecaudoFijo: 'supuestos', empaquePorPedido: 'supuestos', costoAtencionConversacion: 'supuestos',
  tasaEntrega: 'mercado', tasaCierre: 'mercado', costoConversacion: 'mercado',
  costosFijosMes: 'overhead', diasOperacionMes: 'overhead',
};

function clonDefecto() {
  return JSON.parse(JSON.stringify(PERFIL_DEFECTO));
}

export function cargarPerfil() {
  try {
    const crudo = typeof localStorage !== 'undefined' ? localStorage.getItem(CLAVE_STORAGE) : null;
    if (!crudo) return clonDefecto();
    const guardado = JSON.parse(crudo);
    const out = clonDefecto();
    for (const k of Object.keys(out)) {
      const g = guardado?.[k];
      // estado inválido/desconocido -> se descarta la entrada y queda el default de esa clave.
      if (g && (typeof g.valor === 'number' || g.valor === null) && ESTADOS_PERFIL.has(g.estado)) {
        out[k] = { valor: g.valor, estado: g.estado };
      }
    }
    return out;
  } catch {
    return clonDefecto();
  }
}

export function guardarPerfil(perfil) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify(perfil));
    return true;
  } catch {
    return false;
  }
}

export function restablecerPerfil() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(CLAVE_STORAGE);
  } catch { /* nada: igual devolvemos los defaults */ }
  return clonDefecto();
}

export function perfilAEntrada(perfil) {
  const supuestos = {};
  const mercado = {};
  const overhead = {};
  const procedencia = {};
  const ramas = { supuestos, mercado, overhead };
  for (const [clave, rama] of Object.entries(RAMA)) {
    const campo = perfil[clave] ?? PERFIL_DEFECTO[clave];
    ramas[rama][clave] = campo.valor; // number | null — el motor entiende null como FALTANTE
    procedencia[clave] = campo.estado;
  }
  return { supuestos, mercado, overhead, procedencia };
}

export function contarConfianza(perfil) {
  const c = { real: 0, supuesto: 0, falta: 0 };
  for (const clave of Object.keys(PERFIL_DEFECTO)) {
    const estado = (perfil[clave] ?? PERFIL_DEFECTO[clave]).estado;
    if (estado === 'REAL') c.real++;
    else if (estado === 'SUPUESTO') c.supuesto++;
    else c.falta++;
  }
  return c;
}
