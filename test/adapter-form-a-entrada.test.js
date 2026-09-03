import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPOS, formToEntrada } from '../ui/adapter.js';

// Un form "vacío" = todos los campos como los deja el navegador al arrancar: el string del defecto.
function formDefecto(over = {}) {
  const f = { modo: 'sugerir' };
  for (const c of CAMPOS) f[c.id] = String(c.defecto ?? '');
  return { ...f, ...over };
}

test('CAMPOS: cubre los campos del spec, con grupo y modo', () => {
  const ids = CAMPOS.map((c) => c.id);
  for (const req of ['costoUnitario', 'utilidadObjetivo', 'precioBase', 'precio2', 'precio3',
    'fleteIda', 'fleteDevolucion', 'tasaEntrega', 'tasaCierre', 'costoConversacion', 'presupuestoDia',
    'comisionRecaudoPct', 'comisionRecaudoFijo', 'feeDevolucion', 'pctProductoPerdido', 'empaque',
    'costoAtencionConv', 'cesionCombo', 'costosFijosMes', 'diasOperacionMes',
    'mezcla1', 'mezcla2', 'mezcla3', 'redondeoGranularidad', 'redondeoTerminacion', 'redondeoDireccion']) {
    assert.ok(ids.includes(req), `falta CAMPOS.${req}`);
  }
  assert.ok(CAMPOS.find((c) => c.id === 'utilidadObjetivo').modo === 'sugerir');
  assert.ok(CAMPOS.find((c) => c.id === 'precioBase').modo === 'evaluar');
});

test('moneda: distintos formatos → mismo número', () => {
  const e = formToEntrada(formDefecto({ costoUnitario: '$37.500' }));
  assert.equal(e.producto.costoUnitario, 37500);
  assert.equal(formToEntrada(formDefecto({ costoUnitario: '37500' })).producto.costoUnitario, 37500);
  assert.equal(formToEntrada(formDefecto({ costoUnitario: '37.500,50' })).producto.costoUnitario, 37500.5);
  assert.equal(formToEntrada(formDefecto({ costoUnitario: 'abc' })).producto.costoUnitario,
    Number(CAMPOS.find((c) => c.id === 'costoUnitario').defecto));
});

test('porcentaje: se divide entre 100', () => {
  const e = formToEntrada(formDefecto({ tasaEntrega: '75', tasaCierre: '7,5' }));
  assert.equal(e.mercado.tasaEntrega, 0.75);
  assert.equal(e.mercado.tasaCierre, 0.075);
});

test('modo sugerir: precioBase null, escalera vacía, utilidadObjetivo se usa', () => {
  const e = formToEntrada(formDefecto({ modo: 'sugerir', utilidadObjetivo: '40000' }));
  assert.equal(e.producto.precioBase, null);
  assert.deepEqual(e.producto.escaleraPrecios, []);
  assert.equal(e.objetivo.modo, 'sugerir');
  assert.equal(e.objetivo.utilidadObjetivo, 40000);
});

test('modo evaluar: precioBase + escalera de las filas con precio', () => {
  const e = formToEntrada(formDefecto({ modo: 'evaluar', precioBase: '119900', precio2: '198900', precio3: '' }));
  assert.equal(e.objetivo.modo, 'evaluar');
  assert.equal(e.producto.precioBase, 119900);
  assert.deepEqual(e.producto.escaleraPrecios, [{ cantidad: 2, precio: 198900 }]);
});

test('mezcla: los 3 campos, sin dividir', () => {
  const e = formToEntrada(formDefecto({ mezcla1: '50', mezcla2: '30', mezcla3: '20' }));
  assert.deepEqual(e.mezcla, { 1: 50, 2: 30, 3: 20 });
});

test('redondeoDireccion inválida → arriba', () => {
  const e = formToEntrada(formDefecto({ redondeoDireccion: 'lateral' }));
  assert.equal(e.supuestos.redondeo.direccion, 'arriba');
});

test('avanzado: comisión %/fijo, empaque, fijos, días — mapean al lugar correcto', () => {
  const e = formToEntrada(formDefecto({
    comisionRecaudoPct: '3', comisionRecaudoFijo: '1500', empaque: '800',
    costosFijosMes: '3000000', diasOperacionMes: '26',
  }));
  assert.equal(e.supuestos.comisionRecaudoPct, 0.03);
  assert.equal(e.supuestos.comisionRecaudoFijo, 1500);
  assert.equal(e.supuestos.empaquePorPedido, 800);
  assert.equal(e.overhead.costosFijosMes, 3000000);
  assert.equal(e.overhead.diasOperacionMes, 26);
});
