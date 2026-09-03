import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarEntrada } from '../src/normalizar.js';
import { revisar } from '../src/validacion.js';

const ctxDe = (entrada) => normalizarEntrada(entrada).ctx;
const tiene = (avs, cod) => avs.some((a) => a.codigo === cod);

test('costo faltante es error', () => {
  const av = revisar(ctxDe({ producto: { costoUnitario: 0 }, mercado: { costoConversacion: 4000 } }), []);
  const f = av.find((a) => a.codigo === 'costo_faltante');
  assert.ok(f && f.nivel === 'error');
});

test('precio bajo costo es error', () => {
  const ctx = ctxDe({ producto: { costoUnitario: 37500 }, supuestos: { fleteIda: 20000 }, mercado: { costoConversacion: 4000 } });
  const combos = [{ n: 1, ingreso: 40000 }]; // < 37500 + 20000
  assert.ok(tiene(revisar(ctx, combos), 'precio_bajo_costo'));
});

test('devolución sin costo modelado avisa aunque haya flete de ida', () => {
  // flete de ida presente (lo normal) pero sin flete/fee de devolución ni pérdida de producto
  const ctx = ctxDe({ producto: { costoUnitario: 37500 }, supuestos: { fleteIda: 20000 }, mercado: { costoConversacion: 4000 } });
  assert.ok(tiene(revisar(ctx, [{ n: 1, ingreso: 100000 }]), 'devolucion_sin_costo'));
});

test('con riesgo de devolución modelado NO avisa', () => {
  const ctx = ctxDe({ producto: { costoUnitario: 37500 }, supuestos: { fleteIda: 20000, fleteDevolucion: 10000 }, mercado: { costoConversacion: 4000 } });
  assert.ok(!tiene(revisar(ctx, [{ n: 1, ingreso: 100000 }]), 'devolucion_sin_costo'));
});

test('sin pauta avisa', () => {
  const ctx = ctxDe({ producto: { costoUnitario: 37500 }, supuestos: { fleteIda: 20000 }, mercado: { costoConversacion: 0 } });
  assert.ok(tiene(revisar(ctx, [{ n: 1, ingreso: 100000 }]), 'sin_pauta'));
});

test('escalera incoherente: un combo mayor con peor precio por unidad', () => {
  const ctx = ctxDe({ producto: { costoUnitario: 37500 }, supuestos: { fleteIda: 20000 }, mercado: { costoConversacion: 4000 } });
  const combos = [{ n: 1, ingreso: 100000 }, { n: 2, ingreso: 210000 }]; // 105000/u > 100000/u
  assert.ok(tiene(revisar(ctx, combos), 'escalera_incoherente'));
});

test('caso sano: sin avisos de error', () => {
  const ctx = ctxDe({ producto: { costoUnitario: 37500 }, supuestos: { fleteIda: 20000 }, mercado: { costoConversacion: 4000 } });
  const combos = [{ n: 1, ingreso: 104100 }, { n: 2, ingreso: 173100 }, { n: 3, ingreso: 242100 }];
  assert.equal(revisar(ctx, combos).filter((a) => a.nivel === 'error').length, 0);
});
