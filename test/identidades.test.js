import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizar } from '../src/index.js';

const cerca = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

const BASE = {
  producto: { costoUnitario: 37500, precioBase: null, escaleraPrecios: [] },
  supuestos: { fleteIda: 20000 },
  mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 },
  publicidad: { presupuestoDia: 20000 },
  objetivo: { modo: 'sugerir', utilidadObjetivo: 40000 },
};

test('identidad ingreso - costoTotal == utilidad.final (varios supuestos)', () => {
  for (const over of [
    {},
    { supuestos: { fleteIda: 20000, fleteDevolucion: 15000, feeDevolucion: 2000, pctProductoPerdidoEnDevolucion: 0.4, comisionRecaudoPct: 0.03, comisionRecaudoFijo: 1500, empaquePorPedido: 800 } },
    { mercado: { tasaEntrega: 0.6, tasaCierre: 0.15, costoConversacion: 6000 } },
  ]) {
    const r = analizar({ ...BASE, ...over, supuestos: { ...BASE.supuestos, ...over.supuestos }, mercado: { ...BASE.mercado, ...over.mercado } });
    for (const c of r.combos) assert.ok(cerca(c.ingreso - c.costo.total, c.utilidad.final, 1e-5), `combo ${c.n}`);
  }
});

test('en precioMinimo(n) la utilidad final es 0', () => {
  const r = analizar(BASE);
  const rEval = (n, precioTotal) => analizar({
    ...BASE,
    producto: { costoUnitario: 37500, precioBase: precioTotal / n, escaleraPrecios: [] },
    objetivo: { modo: 'evaluar' },
  }).combos.find((c) => c.n === n);
  for (const pm of r.equilibrio.precioMinimo) {
    if (pm.valor == null) continue;
    assert.ok(cerca(rEval(pm.n, pm.valor).utilidad.final, 0, 1), `n=${pm.n}`);
  }
});

test('compat HTML: precio sugerido reconcilia con la utilidad objetivo (± granularidad)', () => {
  const r = analizar(BASE);
  const rEval = (precio) => analizar({
    ...BASE, producto: { costoUnitario: 37500, precioBase: precio, escaleraPrecios: [] }, objetivo: { modo: 'evaluar' },
  }).combos[0];
  const c1 = r.combos[0];
  const uPVE = rEval(c1.ingreso).utilidad.porVentaEntregada;
  assert.ok(uPVE >= 40000 - 1e-6);          // redondeo hacia arriba -> nunca por debajo
  assert.ok(uPVE < 40000 + 1000);           // dentro de una granularidad
});

test('monotonía: subir devolución nunca sube la utilidad final', () => {
  const P = { ...BASE, producto: { costoUnitario: 37500, precioBase: 130000, escaleraPrecios: [] }, objetivo: { modo: 'evaluar' } };
  const bajo = analizar({ ...P, supuestos: { fleteIda: 20000, fleteDevolucion: 5000 } }).combos[0].utilidad.final;
  const alto = analizar({ ...P, supuestos: { fleteIda: 20000, fleteDevolucion: 25000 } }).combos[0].utilidad.final;
  assert.ok(alto <= bajo);
});

test('monotonía: subir el costo por conversación nunca sube la utilidad final', () => {
  const bajo = analizar({ ...BASE, mercado: { ...BASE.mercado, costoConversacion: 3000 } }).combos[0].utilidad.final;
  const alto = analizar({ ...BASE, mercado: { ...BASE.mercado, costoConversacion: 8000 } }).combos[0].utilidad.final;
  assert.ok(alto <= bajo);
});

import { readFileSync } from 'node:fs';
import { ENTRADA_SNAPSHOT, redondearProfundo } from './identidades.snapshot-util.mjs';

test('snapshot de regresión: Resultado para los defaults del HTML', () => {
  const esperado = JSON.parse(readFileSync(new URL('./fixtures/snapshot-defaults-html.json', import.meta.url)));
  const actual = redondearProfundo(analizar(ENTRADA_SNAPSHOT, { conEscenarios: false }), 2);
  assert.deepEqual(actual, esperado);
});
