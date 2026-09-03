import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarEntrada } from '../src/normalizar.js';

test('aplica defaults cuando la entrada está casi vacía', () => {
  const { ctx } = normalizarEntrada({ producto: { costoUnitario: 37500 }, objetivo: { modo: 'sugerir', utilidadObjetivo: 40000 } });
  assert.equal(ctx.fleteIda, 0);
  assert.equal(ctx.cesionUtilidadPorUnidadExtra, 0.20);
  assert.equal(ctx.tasaEntrega, 0.75);
  assert.equal(ctx.diasOperacionMes, 30);
  assert.deepEqual(ctx.mezcla, { 1: 1, 2: 0, 3: 0 });
  assert.equal(ctx.redondeo.direccion, 'arriba');
});

test('clampa tasas al piso y avisa', () => {
  const { ctx, avisos } = normalizarEntrada({ producto: { costoUnitario: 1 }, mercado: { tasaEntrega: 0, tasaCierre: -1 } });
  assert.equal(ctx.tasaEntrega, 0.01);
  assert.equal(ctx.tasaCierre, 0.01);
  assert.ok(avisos.find((a) => a.codigo === 'entrega_en_piso'));
  assert.ok(avisos.find((a) => a.codigo === 'cierre_en_piso'));
});

test('renormaliza la mezcla y avisa', () => {
  const { ctx, avisos } = normalizarEntrada({ producto: { costoUnitario: 1 }, mezcla: { 1: 2, 2: 1, 3: 1 } });
  assert.deepEqual(ctx.mezcla, { 1: 0.5, 2: 0.25, 3: 0.25 });
  assert.ok(avisos.find((a) => a.codigo === 'mezcla_renormalizada'));
});

test('resuelve el modo por precioBase', () => {
  assert.equal(normalizarEntrada({ producto: { costoUnitario: 1, precioBase: 100000 } }).ctx.objetivo.modo, 'evaluar');
  assert.equal(normalizarEntrada({ producto: { costoUnitario: 1, precioBase: null } }).ctx.objetivo.modo, 'sugerir');
  assert.equal(normalizarEntrada({ producto: { costoUnitario: 1, precioBase: 100000 }, objetivo: { modo: 'sugerir', utilidadObjetivo: 1 } }).ctx.objetivo.modo, 'sugerir');
});

test('normaliza y ordena la escalera de precios, descarta filas basura', () => {
  const { ctx } = normalizarEntrada({ producto: { costoUnitario: 1, escaleraPrecios: [
    { cantidad: 3, precio: 240000 }, { cantidad: 2, precio: 170000 }, { cantidad: 1, precio: 90000 }, { cantidad: 4, precio: 0 },
  ] } });
  assert.deepEqual(ctx.escaleraPrecios, [{ cantidad: 2, precio: 170000 }, { cantidad: 3, precio: 240000 }]);
});

test('clampa comisionRecaudoPct y pctProductoPerdido', () => {
  const { ctx } = normalizarEntrada({ producto: { costoUnitario: 1 }, supuestos: { comisionRecaudoPct: 5, pctProductoPerdidoEnDevolucion: 9 } });
  assert.equal(ctx.comisionRecaudoPct, 0.99);
  assert.equal(ctx.pctProductoPerdidoEnDevolucion, 1);
});

test('no lanza con entrada undefined', () => {
  assert.doesNotThrow(() => normalizarEntrada());
  assert.doesNotThrow(() => normalizarEntrada(null));
});

test('no lanza con valores adversarios (Symbol) en la entrada', () => {
  assert.doesNotThrow(() => normalizarEntrada({
    producto: { costoUnitario: Symbol('x') },
    supuestos: { fleteIda: Symbol() },
    mercado: { tasaEntrega: Symbol() },
  }));
});

test('acota redondeo.terminacion a [0, granularidad - 1]', () => {
  const { ctx } = normalizarEntrada({
    producto: { costoUnitario: 1 },
    supuestos: { redondeo: { terminacion: 5000, granularidad: 1000 } },
  });
  assert.equal(ctx.redondeo.granularidad, 1000);
  assert.ok(ctx.redondeo.terminacion < ctx.redondeo.granularidad);
  assert.equal(ctx.redondeo.terminacion, 999);
});
