import { num } from './util.js';

/**
 * Redondea un precio sugerido a un múltiplo de `granularidad` menos `terminacion`
 * (p.ej. precios que terminan en …900). `direccion`:
 *  - 'arriba'  (default): el precio final queda >= el valor crudo — nunca por debajo
 *                         del objetivo de utilidad, aunque haya que subir un escalón.
 *  - 'cercano': al múltiplo más próximo.
 *  - 'abajo':   al múltiplo inferior.
 * Un valor <= 0 devuelve 0.
 */
export function redondear(v, { granularidad, terminacion, direccion } = {}) {
  const g = Math.max(1, num(granularidad, 1000));
  const term = Math.max(0, num(terminacion, 900));
  const val = num(v, 0);
  if (val <= 0) return 0;

  if (direccion === 'cercano') return Math.max(0, Math.round(val / g) * g - term);
  if (direccion === 'abajo') return Math.max(0, Math.floor(val / g) * g - term);

  // 'arriba': asegura que el resultado no quede por debajo de val y nunca sea negativo.
  // `while` (no `if`) por si terminacion >= granularidad hace falta subir varios escalones.
  let base = Math.ceil(val / g) * g;
  while (base - term < val) base += g;
  return Math.max(0, base - term);
}
