export const ENTRADA_SNAPSHOT = {
  producto: { costoUnitario: 37500, precioBase: null, escaleraPrecios: [] },
  supuestos: { fleteIda: 20000 },
  mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 },
  publicidad: { presupuestoDia: 20000 },
  overhead: { costosFijosMes: 0, diasOperacionMes: 30 },
  objetivo: { modo: 'sugerir', regla: { tipo: 'utilidad_fija', valor: 40000 } },
};

/** Redondea todos los números de una estructura a `d` decimales, para comparar snapshots sin ruido de float. */
export function redondearProfundo(obj, d = 2) {
  const f = 10 ** d;
  if (typeof obj === 'number') return Number.isFinite(obj) ? Math.round(obj * f) / f : obj;
  if (Array.isArray(obj)) return obj.map((x) => redondearProfundo(x, d));
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, redondearProfundo(v, d)]));
  }
  return obj;
}
