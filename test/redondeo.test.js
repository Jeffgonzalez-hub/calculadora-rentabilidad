import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redondear } from '../src/redondeo.js';

const R = { granularidad: 1000, terminacion: 900, direccion: 'arriba' };

test("'arriba' garantiza precio final >= valor crudo", () => {
  // ceil(104.167)=105 -> 105000-900=104100 < 104166.67 -> sube un escalón -> 106000-900
  assert.equal(redondear(104166.67, R), 105100);
  // ceil(104)=104 -> 104000-900=103100 < 104000 -> sube -> 105000-900
  assert.equal(redondear(104000, R), 104100);
});

test("'arriba': un valor que ya termina en …900 se queda igual", () => {
  assert.equal(redondear(103100, R), 103100); // 104000-900=103100, no es < 103100
});

test('dirección cercano y abajo', () => {
  assert.equal(redondear(104400, { ...R, direccion: 'cercano' }), 103100); // round(104.4)=104
  assert.equal(redondear(104600, { ...R, direccion: 'cercano' }), 104100); // round(104.6)=105
  assert.equal(redondear(104900, { ...R, direccion: 'abajo' }), 103100);   // floor(104.9)=104
});

test('valor <= 0 devuelve 0', () => {
  assert.equal(redondear(0, R), 0);
  assert.equal(redondear(-5, R), 0);
});

test('terminación 0 = múltiplo puro hacia arriba', () => {
  assert.equal(redondear(104166.67, { granularidad: 1000, terminacion: 0, direccion: 'arriba' }), 105000);
});

test("'arriba' con terminacion >= granularidad: nunca negativo ni bajo el crudo", () => {
  // redondeo.js debe clampar aunque el ctx normalizado ya no deje llegar aquí una
  // terminacion >= granularidad — el helper es público y hay que blindarlo.
  for (const v of [100, 3000, 5000, 104166.67, 1_500_000]) {
    const r = redondear(v, { granularidad: 1000, terminacion: 5000, direccion: 'arriba' });
    assert.ok(r >= 0, `negativo para v=${v}: ${r}`);
    assert.ok(r >= v - 1e-9, `bajo el crudo para v=${v}: ${r} < ${v}`);
  }
});
