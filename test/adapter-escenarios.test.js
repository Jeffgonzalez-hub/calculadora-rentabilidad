import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPOS, analizarDesdeFormulario, escenariosDesdeFormulario } from '../ui/adapter.js';

function formDefecto(over = {}) {
  const f = { modo: 'sugerir' };
  for (const c of CAMPOS) f[c.id] = String(c.defecto ?? '');
  return { ...f, ...over };
}
const FORM = formDefecto({ costoUnitario: '37500', fleteIda: '20000', fleteDevolucion: '8000',
  tasaEntrega: '75', tasaCierre: '20', costoConversacion: '4000', presupuestoDia: '20000', utilidadObjetivo: '40000' });

test('analizarDesdeFormulario: vista completa, escenarios null', () => {
  const { vista, entradaNormalizada, avisos } = analizarDesdeFormulario(FORM);
  assert.equal(vista.combos.length, 3);
  assert.equal(vista.escenarios, null);
  assert.ok(entradaNormalizada && Array.isArray(avisos));
});

test('escenariosDesdeFormulario: forma de la vista de escenarios', () => {
  const e = escenariosDesdeFormulario(FORM);
  assert.equal(e.sensibilidad.variables.length, 5);
  for (const v of e.sensibilidad.variables) {
    assert.equal(v.puntos.length, 11);
    assert.equal(v.puntos[0].xPct, 0);
    assert.equal(v.puntos[10].xPct, 100);
    assert.ok(v.puntos.every((p) => p.yPct >= 0 && p.yPct <= 100));
    assert.ok('cruceXPct' in v);
  }
  assert.equal(e.tornado.length, 5);
  const mag = (f) => Math.max(f.abajoPct, f.arribaPct);
  for (let i = 1; i < e.tornado.length; i++) assert.ok(mag(e.tornado[i - 1]) >= mag(e.tornado[i]) - 0.001);
  assert.ok(e.tornado[0].abajoPct <= 100 && e.tornado[0].arribaPct <= 100);
  assert.equal(e.matriz.celdas.length, 5);
  assert.equal(e.matriz.celdas[0].length, 5);
  const actuales = e.matriz.celdas.flat().filter((c) => c.actual).length;
  assert.equal(actuales, 1);
  assert.ok(e.matriz.actual.fila >= 0 && e.matriz.actual.col >= 0);
});

test('escenarios: signo del tornado — subir un costo baja la utilidad', () => {
  const e = escenariosDesdeFormulario(FORM);
  const cc = e.tornado.find((f) => f.clave === 'costoConversacion');
  assert.equal(cc.dirArriba, 'neg'); // +10% de costoConversacion → utilidad baja
});

test('C1 · sin pauta (costoConversacion 0): nada de "$0" fabricado en escenarios', () => {
  const e = escenariosDesdeFormulario(formDefecto({ ...FORM, costoConversacion: '0' }));

  // sensibilidad: todas las variables sin dato → serie vacía / no disponible
  for (const v of e.sensibilidad.variables) {
    assert.equal(v.puntos.length, 0);
    assert.equal(v.disponible, false);
    assert.equal(v.cruceXPct, null);
    assert.equal(v.ejeY.ceroPct, 50);
    assert.equal(v.ejeY.max, '—');
    assert.equal(v.ejeY.min, '—');
  }

  // matriz: cada celda sin dato → clase mx-sin-dato y valor "—"
  const planas = e.matriz.celdas.flat();
  assert.ok(planas.length === 25);
  assert.ok(planas.every((c) => c.clase === 'mx-sin-dato' && c.valor === '—'));

  // walk genérico: ningún string "$0" en toda la vista de escenarios
  const vistos = [];
  (function walk(x) {
    if (x == null) return;
    if (typeof x === 'string') { vistos.push(x); return; }
    if (typeof x === 'object') for (const k of Object.keys(x)) walk(x[k]);
  })(e);
  assert.ok(!vistos.includes('$0'), `apareció "$0" en: ${vistos.filter((s) => s === '$0').length} lugar(es)`);
  assert.ok(!vistos.some((s) => /^-?\$0$/.test(s)), 'apareció un "$0"/"-$0" fabricado');
});
