// test/recomendacion-8-estados.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizar } from '../src/index.js';

const BASE_REAL_TODO = {
  producto: { costoUnitario: 24000 },
  supuestos: { fleteIda: 20000, fleteDevolucion: 20000, feeDevolucion: 0, pctProductoPerdidoEnDevolucion: 0, comisionRecaudoPct: 0.05, comisionRecaudoFijo: 0, empaquePorPedido: 0, costoAtencionConversacion: 0 },
  mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 },
  procedencia: {
    costoUnitario: 'REAL', fleteIda: 'REAL', fleteDevolucion: 'REAL', feeDevolucion: 'REAL',
    pctProductoPerdidoEnDevolucion: 'REAL', comisionRecaudoPct: 'REAL', comisionRecaudoFijo: 'REAL',
    empaquePorPedido: 'REAL', costoAtencionConversacion: 'REAL', tasaEntrega: 'REAL', tasaCierre: 'REAL',
    costoConversacion: 'REAL', costosFijosMes: 'REAL', diasOperacionMes: 'REAL',
  },
};

test('sin_costo: costoUnitario ausente', () => {
  const r = analizar({ mercado: { costoConversacion: 4000 } });
  assert.equal(r.recomendacion.estado, 'sin_costo');
  assert.equal(r.recomendacion.precio, null);
});

test('sin_objetivo: regla.valor null', () => {
  const r = analizar({ producto: { costoUnitario: 24000 }, objetivo: { regla: { tipo: 'margen_neto', valor: null } } });
  assert.equal(r.recomendacion.estado, 'sin_objetivo');
  assert.equal(r.recomendacion.precio, null);
});

test('no_calculable: fleteIda FALTANTE', () => {
  const r = analizar({ producto: { costoUnitario: 24000 }, supuestos: { fleteIda: null } });
  assert.equal(r.recomendacion.estado, 'no_calculable');
  assert.equal(r.recomendacion.precio, null);
  assert.equal(r.recomendacion.parametroFaltante, 'fleteIda');
});

test('no_alcanzable: comisión de recaudo + margen suman >= 100%', () => {
  const r = analizar({ producto: { costoUnitario: 24000 }, supuestos: { fleteIda: 20000, comisionRecaudoPct: 0.80 }, objetivo: { regla: { tipo: 'margen_neto', valor: 0.25 } } });
  assert.equal(r.recomendacion.estado, 'no_alcanzable');
  assert.equal(r.recomendacion.precio, null);
});

test('ok_neto: todo REAL, CAC disponible', () => {
  const r = analizar(BASE_REAL_TODO);
  assert.equal(r.recomendacion.estado, 'ok_neto');
  assert.ok(r.recomendacion.precio > 0);
});

test('estimacion_neto: CAC disponible, algo no REAL', () => {
  const r = analizar({ producto: { costoUnitario: 24000 }, procedencia: { costoUnitario: 'REAL' }, supuestos: { fleteIda: 20000, fleteDevolucion: 20000, comisionRecaudoPct: 0.05 }, mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 } });
  assert.equal(r.recomendacion.estado, 'estimacion_neto');
});

test('ok_bruto: todo REAL, sin CAC (costoConversacion=0)', () => {
  const r = analizar({ ...BASE_REAL_TODO, mercado: { ...BASE_REAL_TODO.mercado, costoConversacion: 0 } });
  assert.equal(r.recomendacion.estado, 'ok_bruto');
});

test('estimacion_bruto: sin CAC, algo no REAL', () => {
  const r = analizar({ producto: { costoUnitario: 24000 }, procedencia: { costoUnitario: 'REAL' }, supuestos: { fleteIda: 20000, fleteDevolucion: 20000, comisionRecaudoPct: 0.05 }, mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 0 } });
  assert.equal(r.recomendacion.estado, 'estimacion_bruto');
});
