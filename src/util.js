/** Helpers compartidos del motor. Sin dependencias. */

/** Number finito o el valor por defecto. */
export const num = (v, def = 0) => {
  if (typeof v === 'symbol') return def; // Number(Symbol()) lanza TypeError; analizar debe ser total
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

/** Acota v al rango [lo, hi]. */
export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/** Un aviso estructurado para resultado.avisos. */
export const aviso = (codigo, nivel, mensaje) => ({ codigo, nivel, mensaje });

/**
 * Monto en pesos colombianos, formateado. Sin usar hoy en el motor;
 * reservado para los mensajes de aviso de la UI de Fase 2.
 */
export const pesos = (n) => `$${Math.round(num(n)).toLocaleString('es-CO')}`;
