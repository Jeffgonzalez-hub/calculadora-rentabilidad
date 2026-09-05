import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizar } from '../src/index.js';

const BASE = {
  producto: { costoUnitario: 37500, precioBase: null, escaleraPrecios: [] },
  supuestos: { fleteIda: 20000 },
  mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 },
  objetivo: { modo: 'sugerir', regla: { tipo: 'utilidad_fija', valor: 40000 } },
};

const finito = (v) => v == null || Number.isFinite(v);

function todoFinitoONull(obj) {
  if (obj == null) return true;
  if (typeof obj === 'number') return finito(obj);
  if (Array.isArray(obj)) return obj.every(todoFinitoONull);
  if (typeof obj === 'object') return Object.values(obj).every(todoFinitoONull);
  return true;
}

test('tasaEntrega = 0 -> clamp + aviso, sin NaN ni Infinity', () => {
  const r = analizar({ ...BASE, mercado: { ...BASE.mercado, tasaEntrega: 0 } });
  assert.ok(r.avisos.find((a) => a.codigo === 'entrega_en_piso'));
  assert.ok(todoFinitoONull(r));
});

test('escaleraPrecios vacía en modo sugerir -> 3 combos sugeridos', () => {
  const r = analizar(BASE);
  assert.deepEqual(r.combos.map((c) => c.esSugerido), [true, true, true]);
});

test('mezcla que no suma 1 -> renormaliza + aviso', () => {
  const r = analizar({ ...BASE, mezcla: { 1: 2, 2: 1, 3: 1 } });
  assert.ok(r.avisos.find((a) => a.codigo === 'mezcla_renormalizada'));
  const m = r.entradaNormalizada.mezcla;
  assert.ok(Math.abs(m[1] + m[2] + m[3] - 1) < 1e-9);
});

test('costoUnitario = 0 -> aviso costo_faltante, markup null', () => {
  const r = analizar({ ...BASE, producto: { costoUnitario: 0, precioBase: null, escaleraPrecios: [] } });
  assert.ok(r.avisos.find((a) => a.codigo === 'costo_faltante'));
  assert.equal(r.combos[0].markup.sobreProducto, null);
});

test('costoConversacion = 0 -> cac/roas/utilidad.final null, aviso sin_pauta', () => {
  const r = analizar({ ...BASE, mercado: { ...BASE.mercado, costoConversacion: 0 } });
  assert.equal(r.combos[0].cac, null);
  assert.equal(r.combos[0].roas.actual, null);
  assert.equal(r.combos[0].utilidad.final, null);
  assert.ok(r.avisos.find((a) => a.codigo === 'sin_pauta'));
  assert.ok(todoFinitoONull(r));
});

test('entrega 1% -> el precio sugerido es enorme pero finito, sin crash', () => {
  const r = analizar({ ...BASE, mercado: { ...BASE.mercado, tasaEntrega: 0.01 } });
  assert.ok(Number.isFinite(r.combos[0].ingreso) && r.combos[0].ingreso > 1_000_000);
});
