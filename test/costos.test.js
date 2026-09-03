import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarEntrada } from '../src/normalizar.js';
import { crearCostos } from '../src/costos.js';

const ctxDe = (over = {}) => normalizarEntrada({
  producto: { costoUnitario: 37500 },
  supuestos: { fleteIda: 20000, ...over.supuestos },
  mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000, ...over.mercado },
}).ctx;

const cerca = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('cogs escala lineal con n', () => {
  const c = crearCostos(ctxDe());
  assert.equal(c.cogs(1), 37500);
  assert.equal(c.cogs(3), 112500);
});

test('costoPedidoFallido: solo fletes cuando no hay pérdida de producto', () => {
  const c = crearCostos(ctxDe());
  assert.equal(c.costoPedidoFallido(1), 20000);
  assert.equal(c.costoPedidoFallido(3), 20000); // pct = 0 -> no escala
});

test('costoPedidoFallido escala con n cuando hay pérdida de producto', () => {
  const c = crearCostos(ctxDe({ supuestos: { fleteIda: 20000, fleteDevolucion: 15000, feeDevolucion: 3000, pctProductoPerdidoEnDevolucion: 0.5 } }));
  // 20000 + 15000 + 3000 + 0.5*37500*2 = 38000 + 37500 = 75500
  assert.equal(c.costoPedidoFallido(2), 75500);
});

test('colchonDevoluciones = ((1-t)/t) * costoPedidoFallido', () => {
  const c = crearCostos(ctxDe());
  assert.ok(cerca(c.colchonDevoluciones(1), (0.25 / 0.75) * 20000)); // 6666.666...
});

test('comisionRecaudo mezcla porcentaje y fijo', () => {
  const c = crearCostos(ctxDe({ supuestos: { fleteIda: 20000, comisionRecaudoPct: 0.03, comisionRecaudoFijo: 1500 } }));
  assert.ok(cerca(c.comisionRecaudo(100000), 3000 + 1500));
});

test('costoTotalPorVenta suma todos los componentes + cac', () => {
  const c = crearCostos(ctxDe());
  const total = c.costoTotalPorVenta(1, 104166.6667, 26666.6667);
  // 37500 + 20000 + 0 + 0 + 6666.667 + 26666.667 = 90833.334
  assert.ok(cerca(total, 90833.3334, 1e-3));
});
