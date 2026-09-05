// test/adapter-form-a-entrada.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPOS, formToEntrada, perfilToVista } from '../ui/adapter.js';
import { PERFIL_DEFECTO } from '../ui/perfil.js';

function formDefecto(over = {}) {
  const f = {};
  for (const c of CAMPOS) f[c.id] = String(c.defecto ?? '');
  return { ...f, ...over };
}

test('CAMPOS: la vista básica son exactamente 2 campos', () => {
  assert.equal(CAMPOS.length, 2);
  const ids = CAMPOS.map((c) => c.id).sort();
  assert.deepEqual(ids, ['costoUnitario', 'margenObjetivo']);
  const margen = CAMPOS.find((c) => c.id === 'margenObjetivo');
  assert.equal(margen.defecto, 25);
  assert.deepEqual(margen.presets, [15, 20, 25, 30]);
});

test('formToEntrada: costo lleno -> procedencia.costoUnitario REAL; regla margen_neto con el margen en fracción', () => {
  const e = formToEntrada(formDefecto({ costoUnitario: '24000', margenObjetivo: '25' }), PERFIL_DEFECTO);
  assert.equal(e.producto.costoUnitario, 24000);
  assert.equal(e.objetivo.modo, 'sugerir');
  assert.deepEqual(e.objetivo.regla, { tipo: 'margen_neto', valor: 0.25 });
  assert.equal(e.procedencia.costoUnitario, 'REAL');
  assert.equal(e.procedencia['objetivo.regla.valor'], 'CONFIG');
});

test('formToEntrada: costo vacío -> costoUnitario null y procedencia FALTANTE (no 0)', () => {
  const e = formToEntrada(formDefecto({ costoUnitario: '' }), PERFIL_DEFECTO);
  assert.equal(e.producto.costoUnitario, null);
  assert.equal(e.procedencia.costoUnitario, 'FALTANTE');
});

test('formToEntrada: margen vacío -> regla.valor null (el motor lo resuelve como sin_objetivo)', () => {
  const e = formToEntrada(formDefecto({ costoUnitario: '24000', margenObjetivo: '' }), PERFIL_DEFECTO);
  assert.equal(e.objetivo.regla.valor, null);
  assert.equal(e.objetivo.regla.tipo, 'margen_neto');
});

test('formToEntrada: el perfil entra tal cual (valores + procedencia) sin recalcular', () => {
  const perfil = { ...JSON.parse(JSON.stringify(PERFIL_DEFECTO)), comisionRecaudoPct: { valor: 0.05, estado: 'REAL' } };
  const e = formToEntrada(formDefecto({ costoUnitario: '24000' }), perfil);
  assert.equal(e.supuestos.fleteIda, 20000);
  assert.equal(e.supuestos.fleteDevolucion, null);
  assert.equal(e.supuestos.comisionRecaudoPct, 0.05);
  assert.equal(e.mercado.tasaEntrega, 0.75);
  assert.equal(e.overhead.diasOperacionMes, 30);
  assert.equal(e.procedencia.fleteIda, 'SUPUESTO');
  assert.equal(e.procedencia.comisionRecaudoPct, 'REAL');
  assert.equal(e.procedencia.fleteDevolucion, 'FALTANTE');
});

test('formToEntrada: nunca manda objetivo.utilidadObjetivo (campo muerto de V1)', () => {
  const e = formToEntrada(formDefecto({ costoUnitario: '24000' }), PERFIL_DEFECTO);
  assert.equal('utilidadObjetivo' in e.objetivo, false);
});

test('perfilToVista: cuenta de confianza + filas por clave + lista de prioridades', () => {
  const v = perfilToVista(PERFIL_DEFECTO);
  assert.deepEqual(v.confianza, { real: 0, supuesto: 5, falta: 8 });
  assert.equal(v.filas.length, Object.keys(PERFIL_DEFECTO).length);
  const flete = v.filas.find((f) => f.clave === 'fleteIda');
  assert.equal(flete.estado, 'SUPUESTO');
  assert.equal(flete.titulo, 'Flete de ida');
  assert.ok(flete.ayuda.length > 0);
  assert.match(flete.valorTexto, /20\.000/);      // formateado
  const faltante = v.filas.find((f) => f.clave === 'comisionRecaudoPct');
  assert.equal(faltante.valorTexto, '');           // FALTANTE -> input vacío, nunca "$0"
  // prioridades: solo FALTANTE, ordenadas por PRIORIDADES, con etiqueta de impacto
  assert.ok(v.prioridades.length >= 3);
  assert.ok(v.prioridades.every((p) => p.estado === 'FALTANTE'));
  assert.equal(v.prioridades[0].clave, 'comisionRecaudoPct');
});
