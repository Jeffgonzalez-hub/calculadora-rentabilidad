// test/adapter-resultado-a-vista.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizar } from '../src/index.js';
import { formToEntrada, CAMPOS, resultadoToVista, analizarDesdeFormulario } from '../ui/adapter.js';
import { PERFIL_DEFECTO } from '../ui/perfil.js';

function formDefecto(over = {}) {
  const f = {};
  for (const c of CAMPOS) f[c.id] = String(c.defecto ?? '');
  return { ...f, ...over };
}
const FORM = formDefecto({ costoUnitario: '24000', margenObjetivo: '25' });

function vistaDe(form, perfil = PERFIL_DEFECTO) {
  return resultadoToVista(analizar(formToEntrada(form, perfil)));
}

test('vista: sin veredicto; con combos/desglose/equilibrio/proyeccion; escenarios null', () => {
  const v = vistaDe(FORM);
  assert.equal('veredicto' in v, false);
  for (const k of ['avisos', 'resumenAvisos', 'combos', 'desglose', 'equilibrio', 'proyeccion']) {
    assert.ok(k in v, `falta vista.${k}`);
  }
  assert.equal(v.escenarios, null);
  assert.equal(v.combos.length, 3);
});

test('equilibrio: incluye la fila de precio mínimo operativo', () => {
  const v = vistaDe(FORM);
  const fila = v.equilibrio.find((f) => f.clave === 'precioMinimoOperativo');
  assert.ok(fila, 'falta la fila precioMinimoOperativo');
  assert.match(fila.limite, /^\$/);
});

test('combos: formato, no editables (V2 UI no tiene modo evaluar)', () => {
  const v = vistaDe(FORM);
  assert.match(v.combos[0].precio, /^\$/);
  assert.equal(v.combos[0].editable, false);
});

test('analizarDesdeFormulario: devuelve vista + hero', () => {
  const { vista, hero, entradaNormalizada, avisos } = analizarDesdeFormulario(FORM, PERFIL_DEFECTO);
  assert.ok(vista && hero);
  assert.equal(hero.estado, 'estimacion_neto'); // costo REAL + perfil con supuestos
  assert.ok(entradaNormalizada && Array.isArray(avisos));
});

test('costo vacío -> hero.estado sin_costo, sin precio', () => {
  const { hero } = analizarDesdeFormulario(formDefecto({ costoUnitario: '' }), PERFIL_DEFECTO);
  assert.equal(hero.estado, 'sin_costo');
  assert.equal(hero.muestraPrecio, false);
});

test('margen vacío (costo lleno) -> hero.estado sin_objetivo, sin precio, CTA al margen', () => {
  const { hero } = analizarDesdeFormulario(formDefecto({ costoUnitario: '24000', margenObjetivo: '' }), PERFIL_DEFECTO);
  assert.equal(hero.estado, 'sin_objetivo');
  assert.equal(hero.muestraPrecio, false);
  assert.equal(hero.cta.destino, 'margen');
});

test('avisos: el degradante FALTANTE del perfil llega a la vista', () => {
  const v = vistaDe(FORM); // perfil default: comisionRecaudoPct etc. FALTANTE
  assert.ok(v.avisos.some((a) => a.codigo === 'datos_faltantes_en_cero'));
});

test('C4: estados bloqueados no exponen un número fabricado (sin_costo / no_calculable)', () => {
  const sinCosto = analizarDesdeFormulario(formDefecto({ costoUnitario: '' }), PERFIL_DEFECTO).hero;
  assert.equal(sinCosto.estado, 'sin_costo');
  assert.equal(sinCosto.muestraPrecio, false);
  assert.equal(sinCosto.precio, null);
  assert.equal(sinCosto.precioMinimoOperativo, null);

  const perfilSinFlete = { ...structuredClone(PERFIL_DEFECTO), fleteIda: { valor: null, estado: 'FALTANTE' } };
  const noCalc = analizarDesdeFormulario(formDefecto({ costoUnitario: '24000' }), perfilSinFlete).hero;
  assert.equal(noCalc.estado, 'no_calculable');
  assert.equal(noCalc.muestraPrecio, false);
  assert.equal(noCalc.precio, null);
  assert.equal(noCalc.precioMinimoOperativo, null);
});
