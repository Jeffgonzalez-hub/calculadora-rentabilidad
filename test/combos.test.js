// test/combos.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarEntrada } from '../src/normalizar.js';
import { crearCostos } from '../src/costos.js';
import { crearPublicidad } from '../src/publicidad.js';
import { crearRentabilidad } from '../src/rentabilidad.js';
import { crearCombos } from '../src/combos.js';

const cerca = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

function mod(entrada) {
  const { ctx } = normalizarEntrada(entrada);
  const costos = crearCostos(ctx);
  const rent = crearRentabilidad(ctx, costos, crearPublicidad(ctx));
  return { ctx, m: crearCombos(ctx, costos, rent) };
}

// --- regla margen_neto (el default de V2) ---

const BASE_NETO = {
  producto: { costoUnitario: 37500 },
  supuestos: { fleteIda: 20000 },
  mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 },
  objetivo: { modo: 'sugerir' }, // sin regla -> default margen_neto, valor 0.25
};

test('margen_neto es la regla por defecto (sin especificar objetivo.regla)', () => {
  const { ctx } = mod(BASE_NETO);
  assert.deepEqual(ctx.objetivo.regla, { tipo: 'margen_neto', valor: 0.25 });
});

test('margen_neto: precioCrudo(1) reproduce K0(1)+cac sobre (1-q-m)', () => {
  // K0(1) = cogs(37500) + fleteIda(20000) + colchón((0.25/0.75)*20000=6666.667) = 64166.667
  // cac = 4000/(0.2*0.75) = 26666.667 ; q=0, m=0.25 -> /0.75
  const { m } = mod(BASE_NETO);
  assert.ok(cerca(m.precioCrudo(1), 121111.111));
});

test('margen_neto: el mismo % de margen aplica a n=2 y n=3 (identidad exacta)', () => {
  const { m, ctx } = mod(BASE_NETO);
  const rent = crearRentabilidad(ctx, crearCostos(ctx), crearPublicidad(ctx));
  for (const n of [1, 2, 3]) {
    const pCrudo = m.precioCrudo(n);
    assert.ok(cerca(rent.margen(n, pCrudo).neto, 0.25, 1e-9), `n=${n}`);
  }
});

test('margen_neto: sin CAC (costoConversacion=0), precioCrudo cae al margen operativo (sin +cac)', () => {
  const { m } = mod({ ...BASE_NETO, mercado: { ...BASE_NETO.mercado, costoConversacion: 0 } });
  // K0(1) = 64166.667 ; sin cac -> /0.75
  assert.ok(cerca(m.precioCrudo(1), 85555.556));
});

test('margen_neto: no_alcanzable (1-q-m<=0) -> precioCrudo devuelve null, no Infinity/negativo', () => {
  const { m } = mod({
    ...BASE_NETO,
    supuestos: { fleteIda: 20000, comisionRecaudoPct: 0.80 },
    objetivo: { modo: 'sugerir', regla: { tipo: 'margen_neto', valor: 0.25 } },
  });
  assert.equal(m.precioCrudo(1), null); // 1 - 0.80 - 0.25 = -0.05 <= 0
});

// --- regla utilidad_fija (mecanismo histórico de V1, ahora explícito) ---

const BASE_UTILIDAD_FIJA = {
  producto: { costoUnitario: 37500 },
  supuestos: { fleteIda: 20000 },
  mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 },
  objetivo: { modo: 'sugerir', regla: { tipo: 'utilidad_fija', valor: 40000 } },
};

test('utilidad_fija: precioCrudo reproduce los números de la auditoría V1', () => {
  const { m } = mod(BASE_UTILIDAD_FIJA);
  assert.ok(cerca(m.precioCrudo(1), 104166.6667));
  assert.ok(cerca(m.precioCrudo(2), 173666.6667));
  assert.ok(cerca(m.precioCrudo(3), 243166.6667));
});

test('utilidad_fija: sugerirPrecioCombo redondea hacia arriba, sin quedar bajo el crudo', () => {
  const { m } = mod(BASE_UTILIDAD_FIJA);
  assert.equal(m.sugerirPrecioCombo(1), 105100);
});

// --- regla markup (referencia rápida, ignora estructura de costos) ---

test('markup: precioCrudo(n) = C*n*f, sin flete ni devoluciones', () => {
  const { m } = mod({
    ...BASE_UTILIDAD_FIJA,
    objetivo: { modo: 'sugerir', regla: { tipo: 'markup', valor: 2 } },
  });
  assert.equal(m.precioCrudo(1), 75000);
  assert.equal(m.precioCrudo(2), 150000);
});

// --- comportamiento independiente de la regla ---

test('modo sugerir sin escalera: los 3 combos son sugeridos', () => {
  const { m } = mod(BASE_NETO);
  for (const n of [1, 2, 3]) {
    const { combo } = m.evaluarCombo(n);
    assert.equal(combo.esSugerido, true);
    assert.equal(combo.n, n);
    assert.ok(combo.ingreso > 0);
    assert.equal(combo.precioSugerido, combo.ingreso);
  }
});

test('modo sugerir con escalera: usa el precio de la escalera, marca esSugerido:false', () => {
  const { m } = mod({ ...BASE_NETO, producto: { costoUnitario: 37500, escaleraPrecios: [{ cantidad: 2, precio: 170000 }] } });
  const { combo } = m.evaluarCombo(2);
  assert.equal(combo.ingreso, 170000);
  assert.equal(combo.esSugerido, false);
  assert.equal(typeof combo.precioSugerido, 'number');
});

test('modo evaluar sin fila de escalera para n=2: precioBase*2 + aviso', () => {
  const { m } = mod({ ...BASE_NETO, producto: { costoUnitario: 37500, precioBase: 119900 }, objetivo: { modo: 'evaluar' } });
  const { combo, avisos } = m.evaluarCombo(2);
  assert.equal(combo.ingreso, 239800);
  assert.ok(avisos.find((a) => a.codigo === 'combo_sin_precio'));
});

test('el combo trae costo desglosado y utilidad en 3 denominadores', () => {
  const { m } = mod(BASE_NETO);
  const { combo } = m.evaluarCombo(1);
  assert.ok('cogs' in combo.costo && 'colchonDevoluciones' in combo.costo);
  assert.ok('porPedidoGenerado' in combo.utilidad && 'porVentaEntregada' in combo.utilidad && 'final' in combo.utilidad);
});

test('semaforoDe clasifica por margen neto', () => {
  const { m } = mod(BASE_NETO);
  assert.equal(m.semaforoDe(0.35).nivel, 'premium');
  assert.equal(m.semaforoDe(0.22).nivel, 'sano');
  assert.equal(m.semaforoDe(0.12).nivel, 'apretado');
  assert.equal(m.semaforoDe(0.03).nivel, 'muy-apretado');
  assert.equal(m.semaforoDe(1e-9).nivel, 'muy-apretado');
  assert.equal(m.semaforoDe(0).nivel, 'pierde');
  assert.equal(m.semaforoDe(-0.1).nivel, 'pierde');
  assert.equal(m.semaforoDe(null).nivel, 'sin-dato');
});
