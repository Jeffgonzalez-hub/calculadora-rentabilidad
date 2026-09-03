import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarEntrada } from '../src/normalizar.js';
import { crearPublicidad } from '../src/publicidad.js';

const cerca = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const ctxDe = (mercado) => normalizarEntrada({ producto: { costoUnitario: 1 }, mercado }).ctx;

test('cac = (cc + ca) / (k*t)', () => {
  const p = crearPublicidad(ctxDe({ tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 }));
  assert.ok(cerca(p.cac(), 4000 / (0.20 * 0.75))); // 26666.666...
  assert.ok(cerca(p.pautaPorPedido(), 4000 / 0.20));
  assert.ok(cerca(p.pautaPorVenta(), 4000 / (0.20 * 0.75)));
});

test('cac incluye costoAtencionConversacion', () => {
  const ctx = normalizarEntrada({ producto: { costoUnitario: 1 }, supuestos: { costoAtencionConversacion: 1000 }, mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 } }).ctx;
  assert.ok(cerca(crearPublicidad(ctx).cac(), 5000 / (0.20 * 0.75)));
});

test('roasActual = (t*precio*k)/cc', () => {
  const p = crearPublicidad(ctxDe({ tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 }));
  assert.ok(cerca(p.roasActual(100000), (0.75 * 100000 * 0.20) / 4000));
});

test('sin costo por conversación: todo null, nunca Infinity', () => {
  const p = crearPublicidad(ctxDe({ costoConversacion: 0 }));
  assert.equal(p.disponible, false);
  assert.equal(p.cac(), null);
  assert.equal(p.pautaPorPedido(), null);
  assert.equal(p.roasActual(100000), null);
});
