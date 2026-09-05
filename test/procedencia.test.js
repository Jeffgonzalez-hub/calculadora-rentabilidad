// test/procedencia.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferirProcedencia, peorEstado, CLAVES_ECONOMICAS } from '../src/procedencia.js';

test('CLAVES_ECONOMICAS cubre costoUnitario y fleteIda (los dos críticos)', () => {
  assert.ok(CLAVES_ECONOMICAS.includes('costoUnitario'));
  assert.ok(CLAVES_ECONOMICAS.includes('fleteIda'));
});

test('valor null/ausente -> FALTANTE; valor numérico sin clasificar -> SUPUESTO', () => {
  const p = inferirProcedencia({
    producto: { costoUnitario: 24000 },
    supuestos: { fleteIda: 20000, fleteDevolucion: null },
    mercado: { tasaEntrega: 0.75 },
  });
  assert.equal(p.costoUnitario, 'SUPUESTO');   // número, sin clasificar explícitamente
  assert.equal(p.fleteIda, 'SUPUESTO');
  assert.equal(p.fleteDevolucion, 'FALTANTE'); // explícitamente null
  assert.equal(p.tasaEntrega, 'SUPUESTO');
  assert.equal(p.comisionRecaudoPct, 'FALTANTE'); // ni siquiera está la clave -> ausente -> null -> FALTANTE
});

test('entrada.procedencia explícita siempre gana sobre la inferencia', () => {
  const p = inferirProcedencia({
    producto: { costoUnitario: 24000 },
    procedencia: { costoUnitario: 'REAL' },
  });
  assert.equal(p.costoUnitario, 'REAL');
});

test('claves CONFIG arbitrarias (fuera de CLAVES_ECONOMICAS) se hacen eco tal cual', () => {
  const p = inferirProcedencia({
    producto: { costoUnitario: 24000 },
    procedencia: { costoUnitario: 'REAL', 'objetivo.regla.valor': 'CONFIG' },
  });
  assert.equal(p['objetivo.regla.valor'], 'CONFIG');
});

test('un valor de procedencia desconocido (typo) se ignora y cae a inferencia', () => {
  const p = inferirProcedencia({
    producto: { costoUnitario: 24000 },
    procedencia: { costoUnitario: 'REALX' },
  });
  assert.equal(p.costoUnitario, 'SUPUESTO'); // "REALX" no es válido -> se infiere del valor (número)
});

test('no lanza con entrada undefined/null', () => {
  assert.doesNotThrow(() => inferirProcedencia());
  assert.doesNotThrow(() => inferirProcedencia(null));
});

test('peorEstado: REAL < SUPUESTO < FALTANTE', () => {
  assert.equal(peorEstado('REAL', 'REAL'), 'REAL');
  assert.equal(peorEstado('REAL', 'SUPUESTO'), 'SUPUESTO');
  assert.equal(peorEstado('SUPUESTO', 'FALTANTE'), 'FALTANTE');
  assert.equal(peorEstado('FALTANTE', 'REAL', 'SUPUESTO'), 'FALTANTE');
});

test('peorEstado sin argumentos es REAL (identidad neutra)', () => {
  assert.equal(peorEstado(), 'REAL');
});
