/** Helpers de formato para la vista. Puros, sin DOM. Formato es-CO. */

const CO = 'es-CO';

/** Entero COP: "$105.100". Negativo: "-$2.140". */
export function pesos(n) {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString(CO);
}

/** Compacto para celdas chicas: "$321k", "-$1,2M". < 1000 → pesos(). */
export function pesosCompacto(n) {
  const v = Math.round(Number(n) || 0);
  const abs = Math.abs(v);
  const sig = v < 0 ? '-$' : '$';
  if (abs >= 1_000_000) return sig + (abs / 1_000_000).toLocaleString(CO, { maximumFractionDigits: 1 }) + 'M';
  if (abs >= 10_000) return sig + Math.round(abs / 1000).toLocaleString(CO) + 'k';
  return pesos(v);
}

/** Fracción → porcentaje. pct(0.75) → "75 %". */
export function pct(fr, dec = 0) {
  const v = (Number(fr) || 0) * 100;
  return v.toLocaleString(CO, { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' %';
}

/** "2,8×". */
export function ratio(n, dec = 1) {
  const v = Number(n) || 0;
  return v.toLocaleString(CO, { minimumFractionDigits: dec, maximumFractionDigits: dec }) + '×';
}

/** null/undefined → "—"; si no, fmt(v). */
export function oGuion(v, fmt) {
  return v == null ? '—' : fmt(v);
}

/** "1,0". */
export function numero(n, dec = 1) {
  return (Number(n) || 0).toLocaleString(CO, { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
