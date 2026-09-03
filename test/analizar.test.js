import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizar } from '../src/index.js';

const cerca = (a, b, eps = 1e-2) => Math.abs(a - b) < eps;

const DEFAULTS_HTML = {
  producto: { costoUnitario: 37500, precioBase: null, escaleraPrecios: [] },
  supuestos: { fleteIda: 20000 },
  mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 },
  publicidad: { presupuestoDia: 20000 },
  overhead: { costosFijosMes: 0, diasOperacionMes: 30 },
  objetivo: { modo: 'sugerir', utilidadObjetivo: 40000 },
};

test('devuelve la forma completa de Resultado', () => {
  const r = analizar(DEFAULTS_HTML);
  assert.ok(Array.isArray(r.combos) && r.combos.length === 3);
  assert.ok(r.entradaNormalizada && Array.isArray(r.avisos));
  assert.ok(r.mejorCombo && r.equilibrio && r.proyeccion);
});

test('escenarios: null por defecto, presentes solo con { conEscenarios: true }', () => {
  assert.equal(analizar(DEFAULTS_HTML).escenarios, null);
  const r = analizar(DEFAULTS_HTML, { conEscenarios: true });
  assert.ok(r.escenarios && r.escenarios.tornado && r.escenarios.sensibilidad);
});

test('cada combo trae roas y descuentoMaximoPct completos', () => {
  const r = analizar(DEFAULTS_HTML);
  for (const c of r.combos) {
    assert.ok(c.roas && typeof c.roas.actual === 'number');
    assert.ok(typeof c.descuentoMaximoPct === 'number');
  }
});

test('identidad: ingreso - costo.total == utilidad.final para cada combo', () => {
  const r = analizar(DEFAULTS_HTML);
  for (const c of r.combos) {
    assert.ok(cerca(c.ingreso - c.costo.total, c.utilidad.final, 1e-6));
  }
});

test('proyección mensual con los defaults del HTML', () => {
  const r = analizar(DEFAULTS_HTML);
  // conversacionesDia = 20000/4000 = 5; pedidosDia = 1; ventasEntregadasDia = 0.75
  assert.ok(cerca(r.proyeccion.pedidosDia, 1));
  assert.ok(cerca(r.proyeccion.ventasEntregadasDia, 0.75));
  // identidad: utilidadMes ~= ventasEntregadasMes * utilidadFinalPonderada - costosFijosMes
  const vem = r.proyeccion.ventasEntregadasDia * 30;
  const uFinal = r.combos[0].utilidad.final; // mezcla por defecto = todo combo 1
  assert.ok(cerca(r.proyeccion.utilidadMes, vem * uFinal, 1e-2));
});

test('sin pauta: utilidad.final null, proyección mensual null, no lanza', () => {
  const r = analizar({ ...DEFAULTS_HTML, mercado: { ...DEFAULTS_HTML.mercado, costoConversacion: 0 } });
  assert.equal(r.combos[0].utilidad.final, null);
  assert.equal(r.proyeccion.utilidadMes, null);
  assert.ok(r.avisos.find((a) => a.codigo === 'sin_pauta'));
});

test('entrada vacía no lanza y avisa costo_faltante', () => {
  assert.doesNotThrow(() => analizar({}));
  assert.ok(analizar({}).avisos.find((a) => a.codigo === 'costo_faltante'));
});

test('mejorCombo elige por utilidad limpia', () => {
  const r = analizar(DEFAULTS_HTML);
  const mejorReal = [...r.combos].sort((a, b) => (b.utilidad.final ?? -Infinity) - (a.utilidad.final ?? -Infinity))[0].n;
  assert.equal(r.mejorCombo.n, mejorReal);
});

test('identidad de proyección con fijos y mezcla no trivial', () => {
  const r = analizar({
    ...DEFAULTS_HTML,
    overhead: { costosFijosMes: 3_000_000, diasOperacionMes: 30 },
    mezcla: { 1: 0.5, 2: 0.3, 3: 0.2 },
  });
  const vem = r.proyeccion.ventasEntregadasDia * 30;
  const uFinalPond = r.combos.reduce(
    (acc, c) => acc + (r.entradaNormalizada.mezcla[c.n] ?? 0) * c.utilidad.final, 0,
  );
  assert.ok(cerca(r.proyeccion.utilidadMes, vem * uFinalPond - 3_000_000, 1e-2));
});

test('unidadesDiaParaFijos null (utilidad ponderada <= 0 con fijos) dispara equilibrio_inalcanzable', () => {
  const r = analizar({
    producto: { costoUnitario: 37500, precioBase: 45000, escaleraPrecios: [] },
    supuestos: { fleteIda: 20000 },
    mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 },
    publicidad: { presupuestoDia: 20000 },
    overhead: { costosFijosMes: 3_000_000, diasOperacionMes: 30 },
    objetivo: { modo: 'evaluar' },
  });
  assert.equal(r.equilibrio.unidadesDiaParaFijos, null);
  assert.ok(r.avisos.find((a) => a.codigo === 'equilibrio_inalcanzable'));
});

test('presupuesto 0 con pauta y fijos: solo corren los fijos, no todo-null', () => {
  const r = analizar({
    ...DEFAULTS_HTML,
    publicidad: { presupuestoDia: 0 },
    overhead: { costosFijosMes: 3_000_000, diasOperacionMes: 30 },
  });
  assert.equal(r.proyeccion.pedidosDia, 0);
  assert.equal(r.proyeccion.ventasEntregadasDia, 0);
  assert.ok(cerca(r.proyeccion.utilidadDia, -100000));
  assert.ok(cerca(r.proyeccion.utilidadMes, -3_000_000));
});
