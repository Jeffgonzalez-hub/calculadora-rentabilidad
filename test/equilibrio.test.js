import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarEntrada } from '../src/normalizar.js';
import { crearCostos } from '../src/costos.js';
import { crearPublicidad } from '../src/publicidad.js';
import { crearRentabilidad } from '../src/rentabilidad.js';
import { crearEquilibrio } from '../src/equilibrio.js';

const cerca = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

function mod(over = {}) {
  const { ctx } = normalizarEntrada({
    producto: { costoUnitario: 37500 },
    supuestos: { fleteIda: 20000, ...over.supuestos },
    mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000, ...over.mercado },
    overhead: over.overhead,
  });
  const costos = crearCostos(ctx);
  const rent = crearRentabilidad(ctx, costos, crearPublicidad(ctx));
  return { ctx, rent, costos, eq: crearEquilibrio(ctx, costos, rent, crearPublicidad(ctx)) };
}

const PRECIO = 104166.6667;

test('en precioMinimo(n) la utilidad final es 0', () => {
  const { rent, eq } = mod();
  const pm = eq.precioMinimo(1);
  assert.ok(cerca(rent.utilidadFinal(1, pm), 0));
});

test('descuentoMaximoPct: bajar el precio a precioMinimo deja utilidad 0', () => {
  const { eq } = mod();
  const d = eq.descuentoMaximoPct(1, PRECIO);
  assert.ok(d > 0 && d < 1);
  assert.ok(cerca(PRECIO * (1 - d), eq.precioMinimo(1)));
});

test('sustituir la tasa de entrega mínima deja utilidad final ~0', () => {
  const { eq } = mod();
  const tmin = eq.tasaEntregaMinima(1, PRECIO);
  const { ctx: ctx2 } = normalizarEntrada({
    producto: { costoUnitario: 37500 }, supuestos: { fleteIda: 20000 },
    mercado: { tasaEntrega: tmin, tasaCierre: 0.20, costoConversacion: 4000 },
  });
  const c2 = crearCostos(ctx2);
  const r2 = crearRentabilidad(ctx2, c2, crearPublicidad(ctx2));
  assert.ok(cerca(r2.utilidadFinal(1, PRECIO), 0, 1));
});

test('costoConversacionMaximo: usarlo como cc deja utilidad final ~0', () => {
  const { eq } = mod();
  const ccMax = eq.costoConversacionMaximo(1, PRECIO);
  const { ctx: ctx2 } = normalizarEntrada({
    producto: { costoUnitario: 37500 }, supuestos: { fleteIda: 20000 },
    mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: ccMax },
  });
  const c2 = crearCostos(ctx2);
  const r2 = crearRentabilidad(ctx2, c2, crearPublicidad(ctx2));
  assert.ok(cerca(r2.utilidadFinal(1, PRECIO), 0, 1));
});

test('unidadesDiaParaFijos: fijos / utilidad final ponderada', () => {
  const { rent, eq } = mod({ overhead: { costosFijosMes: 3000000, diasOperacionMes: 30 } });
  const combos = [{ n: 1, utilidad: { final: rent.utilidadFinal(1, PRECIO), porVentaEntregada: rent.utilidadPorVentaEntregada(1, PRECIO) } }];
  const u = eq.unidadesDiaParaFijos(combos, { 1: 1, 2: 0, 3: 0 });
  assert.ok(cerca(u, (3000000 / 30) / rent.utilidadFinal(1, PRECIO)));
});

test('sin fijos: unidadesDiaParaFijos es 0', () => {
  const { eq, rent } = mod();
  assert.equal(eq.unidadesDiaParaFijos([{ n: 1, utilidad: { final: rent.utilidadFinal(1, PRECIO) } }], { 1: 1 }), 0);
});

test('sin pauta: precioMinimo null; tasaEntregaMinima ya no depende de la pauta', () => {
  const { eq } = mod({ mercado: { costoConversacion: 0 } });
  assert.equal(eq.precioMinimo(1), null); // usa el CAC, que es null sin pauta
  // con cc = 0 (y ca = 0) tasaEntregaMinima = CPF/(bruto+CPF), un valor válido
  assert.ok(cerca(eq.tasaEntregaMinima(1, PRECIO), 0.3));
  // con cc = ca = 0 el numerador de km se anula => se auto-nulea
  assert.equal(eq.tasaCierreMinima(1, PRECIO), null);
});

test('equilibrio fuera de rango devuelve null, nunca > 1', () => {
  // precio altísimo -> tasa de entrega mínima ínfima pero válida; precio ínfimo -> imposible
  const { eq } = mod();
  assert.equal(eq.tasaEntregaMinima(1, 1), null);
});

test('precioMinimoOperativo: K0(1)/(1-q), siempre calculable (no depende de CAC)', () => {
  const { eq } = mod({ mercado: { costoConversacion: 0 } }); // sin pauta -> precioMinimo (con CAC) es null
  assert.equal(eq.precioMinimo(1), null);
  // K0(1) = cogs(37500)+fleteIda(20000)+colchón((0.25/0.75)*20000=6666.667) = 64166.667 ; q=0 -> /1
  assert.ok(cerca(eq.precioMinimoOperativo(1), 64166.667));
});

test('precioMinimoOperativo: en ese precio, utilidadPorVentaEntregada es 0', () => {
  const { eq, rent } = mod();
  const pmo = eq.precioMinimoOperativo(1);
  assert.ok(cerca(rent.utilidadPorVentaEntregada(1, pmo), 0, 1));
});

test('precioMinimoOperativo: siempre <= precioMinimo cuando hay CAC (adquisición se suma aparte)', () => {
  const { eq } = mod();
  const pmo = eq.precioMinimoOperativo(1);
  const pm = eq.precioMinimo(1);
  assert.ok(pm != null && pmo < pm);
});
