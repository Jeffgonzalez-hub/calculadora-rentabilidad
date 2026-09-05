import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarEntrada } from '../src/normalizar.js';
import { crearCostos } from '../src/costos.js';
import { crearPublicidad } from '../src/publicidad.js';
import { crearRentabilidad } from '../src/rentabilidad.js';

const cerca = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

function motor(over = {}) {
  const { ctx } = normalizarEntrada({
    producto: { costoUnitario: 37500 },
    supuestos: { fleteIda: 20000, ...over.supuestos },
    mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000, ...over.mercado },
  });
  const costos = crearCostos(ctx);
  return crearRentabilidad(ctx, costos, crearPublicidad(ctx));
}

const PRECIO = 104166.6667; // precioCrudo(1) de los defaults del HTML

test('bruto por pedido con comisión 0', () => {
  assert.ok(cerca(motor().brutoPorPedido(1, PRECIO), PRECIO - 37500 - 20000));
});

test('utilidad por pedido y por venta entregada', () => {
  const r = motor();
  assert.ok(cerca(r.utilidadPorPedido(1, PRECIO), 0.75 * (PRECIO - 57500) - 0.25 * 20000));
  assert.ok(cerca(r.utilidadPorVentaEntregada(1, PRECIO), 40000)); // reconcilia con la utilidad objetivo
});

test('utilidad final resta el CAC', () => {
  assert.ok(cerca(motor().utilidadFinal(1, PRECIO), 40000 - 4000 / (0.20 * 0.75)));
});

test('margen bruto y neto son fracciones sobre el precio', () => {
  const m = motor().margen(1, PRECIO);
  assert.ok(m.bruto > 0 && m.bruto < 1);
  assert.ok(cerca(m.neto, motor().utilidadFinal(1, PRECIO) / PRECIO));
});

test('markup sobre producto y sobre producto+flete', () => {
  const mk = motor().markup(1, PRECIO);
  assert.ok(cerca(mk.sobreProducto, PRECIO / 37500));
  assert.ok(cerca(mk.sobreProductoYFlete, PRECIO / 57500));
});

test('sin pauta: utilidadFinal y margen neto null, bruto sí calcula', () => {
  const r = motor({ mercado: { costoConversacion: 0 } });
  assert.equal(r.utilidadFinal(1, PRECIO), null);
  assert.equal(r.margen(1, PRECIO).neto, null);
  assert.ok(r.margen(1, PRECIO).bruto > 0);
});

test('costo unitario 0: markup null, no divide por cero', () => {
  const { ctx } = normalizarEntrada({ producto: { costoUnitario: 0 }, supuestos: { fleteIda: 0 }, mercado: { costoConversacion: 4000 } });
  const r0 = crearRentabilidad(ctx, crearCostos(ctx), crearPublicidad(ctx));
  assert.equal(r0.markup(1, 50000).sobreProducto, null);
  assert.equal(r0.markup(1, 50000).sobreProductoYFlete, null);
});

test('margenOperativo(n,P) = utilidadPorVentaEntregada(n,P) / P', () => {
  const rent = motor(); // usa el helper ya existente en este archivo
  const precio = 120100;
  const esperado = rent.utilidadPorVentaEntregada(1, precio) / precio;
  assert.ok(Math.abs(rent.margenOperativo(1, precio) - esperado) < 1e-9);
});

test('margenOperativo: precio <= 0 -> null', () => {
  const rent = motor();
  assert.equal(rent.margenOperativo(1, 0), null);
});

test('margenOperativo NO depende de si hay CAC (a diferencia de margen.neto)', () => {
  const conPauta = motor({ mercado: { costoConversacion: 4000 } });
  const sinPauta = motor({ mercado: { costoConversacion: 0 } });
  assert.ok(Math.abs(conPauta.margenOperativo(1, 120100) - sinPauta.margenOperativo(1, 120100)) < 1e-9);
});
