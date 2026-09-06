// test/identidad-margen-neto.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizar } from '../src/index.js';

const cerca = (a, b, eps) => Math.abs(a - b) < eps;

// Fixture de §A.11: C=24000, Fi=Fd=20000, fd=0, rho=0, q=5%, Q=0, E=0,
// t=75%, k=20%, cc=4000, ca=0, m=25%.
const FIXTURE = {
  producto: { costoUnitario: 24000 },
  supuestos: { fleteIda: 20000, fleteDevolucion: 20000, comisionRecaudoPct: 0.05 },
  mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 },
  objetivo: { regla: { tipo: 'margen_neto', valor: 0.25 } },
};

test('§A.11 con CAC: P_crudo(1) = 120000.00 exacto; margenNeto(1, P_crudo) = 25.00% exacto', () => {
  const r = analizar(FIXTURE);
  assert.ok(cerca(r.recomendacion.precioCrudo, 120000, 1e-6));
  assert.ok(cerca(r.recomendacion.margenObjetivo, 0.25, 1e-9));
  // margenNeto evaluado en el crudo (no en el redondeado): reconstruido a mano
  // con la misma fórmula de §A.6, para no acoplar el test a un campo interno.
  const K0_1 = 24000 + 20000 + (0.25 / 0.75) * (20000 + 20000);
  const cac = 4000 / (0.20 * 0.75);
  const margenNetoEnCrudo = (r.recomendacion.precioCrudo * (1 - 0.05) - K0_1 - cac) / r.recomendacion.precioCrudo;
  assert.ok(cerca(margenNetoEnCrudo, 0.25, 1e-9));
});

test('§A.11 con CAC: precio redondeado = $120.100; margenNeto logrado >= 25% (25.058%)', () => {
  const r = analizar(FIXTURE);
  assert.equal(r.recomendacion.precio, 120100);
  assert.ok(r.recomendacion.margenLogrado >= 0.25 - 1e-9);
  assert.ok(cerca(r.recomendacion.margenLogrado, 0.25058, 1e-4));
  assert.equal(r.recomendacion.tipoMargen, 'neto');
});

test('§A.11 sin CAC (cc=0): P_crudo=81904.76, precio=$82.100, margenOperativo=25.00% exacto en el crudo', () => {
  const sinCac = { ...FIXTURE, mercado: { ...FIXTURE.mercado, costoConversacion: 0 } };
  const r = analizar(sinCac);
  assert.ok(cerca(r.recomendacion.precioCrudo, 81904.7619, 1e-2));
  assert.equal(r.recomendacion.precio, 82100);
  assert.equal(r.recomendacion.tipoMargen, 'operativo');
  const K0_1 = 24000 + 20000 + (0.25 / 0.75) * (20000 + 20000);
  const margenOperativoEnCrudo = (r.recomendacion.precioCrudo * (1 - 0.05) - K0_1) / r.recomendacion.precioCrudo;
  assert.ok(cerca(margenOperativoEnCrudo, 0.25, 1e-9));
  assert.match(r.recomendacion.estado, /^(estimacion_bruto|ok_bruto)$/);
});

test('§A.11 combos n=2,3: la identidad de margen se cumple EN EL CRUDO; el redondeo solo sube el margen realizado, nunca lo baja', () => {
  const r = analizar(FIXTURE);
  const cac = 4000 / (0.20 * 0.75);            // 26666.667
  const q = 0.05, m = 0.25;
  for (const n of [2, 3]) {
    const combo = r.combos.find((c) => c.n === n);
    // K0(n) reconstruido con §A.6 — CPF no depende de n (rho=0): colchón = (0.25/0.75)*40000 = 13333.333
    const K0 = 24000 * n + 20000 + (0.25 / 0.75) * 40000;
    const pCrudo = (K0 + cac) / (1 - q - m);
    const margenNetoEnCrudo = (pCrudo * (1 - q) - K0 - cac) / pCrudo;
    assert.ok(cerca(margenNetoEnCrudo, m, 1e-9), `n=${n}: identidad en el crudo = ${margenNetoEnCrudo}`);
    // el precio del combo que devuelve el motor es el crudo redondeado hacia arriba:
    assert.ok(combo.ingreso >= pCrudo - 1e-6, `n=${n}: ingreso ${combo.ingreso} quedó por debajo del crudo ${pCrudo}`);
    // ...así que el margen realizado nunca cae por debajo del objetivo, y no se dispara:
    assert.ok(combo.margen.neto >= m - 1e-9, `n=${n}: margen realizado ${combo.margen.neto} < objetivo`);
    assert.ok(combo.margen.neto <= m + 1000 / pCrudo + 1e-9, `n=${n}: margen realizado ${combo.margen.neto} se disparó`);
  }
});

test('§A.11 sensibilidad de t: P_crudo(65%) > P_crudo(75%) > P_crudo(85%) (monotonía)', () => {
  const t65 = analizar({ ...FIXTURE, mercado: { ...FIXTURE.mercado, tasaEntrega: 0.65 } }).recomendacion.precioCrudo;
  const t75 = analizar(FIXTURE).recomendacion.precioCrudo;
  const t85 = analizar({ ...FIXTURE, mercado: { ...FIXTURE.mercado, tasaEntrega: 0.85 } }).recomendacion.precioCrudo;
  assert.ok(t65 > t75);
  assert.ok(t75 > t85);
});

test('§A.11 sensibilidad de t: precios redondeados esperados exactos (65%/75%/85%)', () => {
  const precioA = (t) => analizar({ ...FIXTURE, mercado: { ...FIXTURE.mercado, tasaEntrega: t } }).recomendacion.precio;
  assert.equal(precioA(0.65), 138100);
  assert.equal(precioA(0.75), 120100);
  assert.equal(precioA(0.85), 107100);
});
