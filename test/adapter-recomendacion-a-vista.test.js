// test/adapter-recomendacion-a-vista.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizar } from '../src/index.js';
import { recomendacionToVista } from '../ui/adapter.js';

const CON_CAC = { supuestos: { fleteIda: 20000, fleteDevolucion: 20000, comisionRecaudoPct: 0.05 }, mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 } };

function vistaDe(entrada) {
  return recomendacionToVista(analizar(entrada));
}

test('sin_costo: no muestra precio, acento neutro, CTA al campo de costo', () => {
  const v = vistaDe({ mercado: { costoConversacion: 4000 } });
  assert.equal(v.estado, 'sin_costo');
  assert.equal(v.muestraPrecio, false);
  assert.equal(v.precio, null);
  assert.equal(v.acento, 'neutro');
  assert.equal(v.cta.destino, 'costo');
});

test('no_calculable: no muestra precio, nombra el parámetro que falta, CTA al perfil', () => {
  const v = vistaDe({ producto: { costoUnitario: 24000 }, supuestos: { fleteIda: null }, mercado: CON_CAC.mercado });
  assert.equal(v.estado, 'no_calculable');
  assert.equal(v.muestraPrecio, false);
  assert.match(v.titulo, /flete de ida/i);
  assert.equal(v.cta.destino, 'perfil');
});

test('no_alcanzable: sin precio, muestra el mínimo operativo como escape', () => {
  const v = vistaDe({
    producto: { costoUnitario: 24000 }, procedencia: { costoUnitario: 'REAL' },
    supuestos: { fleteIda: 20000, comisionRecaudoPct: 0.80 }, mercado: CON_CAC.mercado,
    objetivo: { regla: { tipo: 'margen_neto', valor: 0.25 } },
  });
  assert.equal(v.estado, 'no_alcanzable');
  assert.equal(v.muestraPrecio, false);
  assert.equal(v.acento, 'rojo');
  assert.match(v.precioMinimoOperativo, /^\$/);
});

test('estimacion_neto: precio dominante, chips NETO + ESTIMADO, acento ámbar, CTA mejorar precisión', () => {
  const v = vistaDe({ producto: { costoUnitario: 24000 }, procedencia: { costoUnitario: 'REAL' }, ...CON_CAC });
  assert.equal(v.estado, 'estimacion_neto');
  assert.equal(v.muestraPrecio, true);
  assert.match(v.precio, /^\$\d/);
  assert.deepEqual(v.chips.map((c) => c.texto), ['NETO', 'ESTIMADO']);
  assert.equal(v.acento, 'ambar');
  assert.match(v.lineaMargen, /25/);
  assert.match(v.confianza, /supuesto/i);
  assert.match(v.confianza, /asumidos? en \$0/i);   // §B (C3): "asumidos en $0 — este precio es un piso"
  assert.match(v.confianza, /piso/i);
  assert.equal(v.cta.destino, 'perfil');
});

test('estimacion_bruto: chips BRUTO + ESTIMADO, franja de advertencia de CAC obligatoria', () => {
  const v = vistaDe({ producto: { costoUnitario: 24000 }, procedencia: { costoUnitario: 'REAL' }, supuestos: CON_CAC.supuestos, mercado: { ...CON_CAC.mercado, costoConversacion: 0 } });
  assert.equal(v.estado, 'estimacion_bruto');
  assert.deepEqual(v.chips.map((c) => c.texto), ['BRUTO', 'ESTIMADO']);
  assert.match(v.advertencia, /no incluye|no cubre/i);
  assert.match(v.advertencia, /CAC|publicidad/i);
  assert.match(v.lineaMargen, /operativo/i);
});

test('ningún estado renderiza un precio "$0" fabricado', () => {
  for (const entrada of [
    { mercado: { costoConversacion: 4000 } },                                             // sin_costo
    { producto: { costoUnitario: 24000 }, supuestos: { fleteIda: null } },                // no_calculable
    { producto: { costoUnitario: 24000 }, objetivo: { regla: { tipo: 'margen_neto', valor: null } } }, // sin_objetivo
  ]) {
    const v = vistaDe(entrada);
    assert.equal(v.precio, null);
    assert.equal(v.muestraPrecio, false);
  }
});

test('porQue: siempre presente y menciona los componentes económicos', () => {
  const v = vistaDe({ producto: { costoUnitario: 24000 }, procedencia: { costoUnitario: 'REAL' }, ...CON_CAC });
  assert.ok(v.porQue.length > 0);
  assert.match(v.porQue, /flete|colch[oó]n|devoluc/i);
});
