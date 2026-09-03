import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarEntrada } from '../src/normalizar.js';
import { crearCostos } from '../src/costos.js';
import { crearPublicidad } from '../src/publicidad.js';
import { crearRentabilidad } from '../src/rentabilidad.js';
import { crearCombos } from '../src/combos.js';

const cerca = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

function mod(entrada) {
  const { ctx } = normalizarEntrada(entrada);
  const costos = crearCostos(ctx);
  const rent = crearRentabilidad(ctx, costos, crearPublicidad(ctx));
  return { ctx, m: crearCombos(ctx, costos, rent) };
}

const BASE = {
  producto: { costoUnitario: 37500 },
  supuestos: { fleteIda: 20000 },
  mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 },
  objetivo: { modo: 'sugerir', utilidadObjetivo: 40000 },
};

test('precioCrudo reproduce los números de la auditoría (supuestos nuevos en 0)', () => {
  const { m } = mod(BASE);
  assert.ok(cerca(m.precioCrudo(1), 104166.6667));
  assert.ok(cerca(m.precioCrudo(2), 173666.6667));
  assert.ok(cerca(m.precioCrudo(3), 243166.6667));
});

test('sugerirPrecioCombo redondea hacia arriba a terminación 900, sin quedar bajo el crudo', () => {
  const { m } = mod(BASE);
  // precioCrudo(1) = 104166.67 ; 105000-900=104100 < crudo -> sube -> 106000-900
  assert.equal(m.sugerirPrecioCombo(1), 105100);
});

test('modo sugerir sin escalera: los 3 combos son sugeridos', () => {
  const { m } = mod(BASE);
  for (const n of [1, 2, 3]) {
    const { combo } = m.evaluarCombo(n);
    assert.equal(combo.esSugerido, true);
    assert.equal(combo.n, n);
    assert.ok(combo.ingreso > 0);
    assert.equal(combo.precioSugerido, combo.ingreso); // sin escalera: el ingreso ES el sugerido
  }
});

test('modo sugerir con escalera: usa el precio de la escalera, marca esSugerido:false y reporta precioSugerido igual', () => {
  const { m } = mod({ ...BASE, producto: { costoUnitario: 37500, escaleraPrecios: [{ cantidad: 2, precio: 170000 }] } });
  const { combo } = m.evaluarCombo(2);
  assert.equal(combo.ingreso, 170000);
  assert.equal(combo.esSugerido, false);
  // precioSugerido se calcula igual aunque la escalera fije el precio (para Fase 3)
  assert.equal(typeof combo.precioSugerido, 'number');
  assert.ok(combo.precioSugerido > 0 && combo.precioSugerido !== 170000);
});

test('modo evaluar sin fila de escalera para n=2: precioBase*2 + aviso', () => {
  const { m } = mod({ ...BASE, producto: { costoUnitario: 37500, precioBase: 119900 }, objetivo: { modo: 'evaluar' } });
  const { combo, avisos } = m.evaluarCombo(2);
  assert.equal(combo.ingreso, 239800);
  assert.ok(avisos.find((a) => a.codigo === 'combo_sin_precio'));
});

test('el combo trae costo desglosado y utilidad en 3 denominadores', () => {
  const { m } = mod(BASE);
  const { combo } = m.evaluarCombo(1);
  assert.ok('cogs' in combo.costo && 'colchonDevoluciones' in combo.costo);
  assert.ok('porPedidoGenerado' in combo.utilidad && 'porVentaEntregada' in combo.utilidad && 'final' in combo.utilidad);
});

test('semaforoDe clasifica por margen neto', () => {
  const { m } = mod(BASE);
  assert.equal(m.semaforoDe(0.35).nivel, 'premium');
  assert.equal(m.semaforoDe(0.22).nivel, 'sano');
  assert.equal(m.semaforoDe(0.12).nivel, 'apretado');
  assert.equal(m.semaforoDe(0.03).nivel, 'muy-apretado');
  assert.equal(m.semaforoDe(1e-9).nivel, 'muy-apretado'); // pct > 0 estricto
  assert.equal(m.semaforoDe(0).nivel, 'pierde');          // exactamente 0 => pierde
  assert.equal(m.semaforoDe(-0.1).nivel, 'pierde');
  assert.equal(m.semaforoDe(null).nivel, 'sin-dato');
});
