import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pesos, pesosCompacto, pct, ratio, oGuion, numero } from '../ui/formato.js';

test('pesos: entero COP con separador de miles es-CO', () => {
  assert.equal(pesos(105100), '$105.100');
  assert.equal(pesos(0), '$0');
  assert.equal(pesos(104166.67), '$104.167');
  assert.equal(pesos(-2140), '-$2.140');
});

test('pesosCompacto: k / M con coma decimal', () => {
  assert.equal(pesosCompacto(321000), '$321k');
  assert.equal(pesosCompacto(-1200000), '-$1,2M');
  assert.equal(pesosCompacto(850), '$850');
});

test('pct: recibe fracción, devuelve porcentaje', () => {
  assert.equal(pct(0.75), '75 %');
  assert.equal(pct(0.592, 1), '59,2 %');
  assert.equal(pct(0.132), '13 %');
});

test('ratio: sufijo × con coma', () => {
  assert.equal(ratio(2.83), '2,8×');
  assert.equal(ratio(2.0), '2,0×');
});

test('oGuion: null → raya', () => {
  assert.equal(oGuion(null, pesos), '—');
  assert.equal(oGuion(0, pesos), '$0');
  assert.equal(oGuion(13333, pesos), '$13.333');
});

test('numero: un decimal es-CO', () => {
  assert.equal(numero(1), '1,0');
  assert.equal(numero(0.75), '0,8');
});
