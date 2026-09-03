import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizar } from '../src/index.js';
import { formToEntrada, CAMPOS, resultadoToVista } from '../ui/adapter.js';

function formDefecto(over = {}) {
  const f = { modo: 'sugerir' };
  for (const c of CAMPOS) f[c.id] = String(c.defecto ?? '');
  return { ...f, ...over };
}
// escenario "defaults del HTML" (mismo del snapshot de Fase 1)
const FORM_BASE = formDefecto({ costoUnitario: '37500', fleteIda: '20000', fleteDevolucion: '0',
  tasaEntrega: '75', tasaCierre: '20', costoConversacion: '4000', presupuestoDia: '20000',
  utilidadObjetivo: '40000' });

function vistaDe(form) {
  const entrada = formToEntrada(form);
  return resultadoToVista(analizar(entrada, { conEscenarios: false }), entrada.objetivo.modo);
}

test('bloques presentes; escenarios null en esta task', () => {
  const v = vistaDe(FORM_BASE);
  for (const k of ['meta', 'veredicto', 'avisos', 'resumenAvisos', 'combos', 'desglose', 'equilibrio', 'proyeccion']) {
    assert.ok(k in v, `falta vista.${k}`);
  }
  assert.equal(v.escenarios, null);
  assert.equal(v.combos.length, 3);
});

test('veredicto: defaults → gana, mejor combo n=3', () => {
  const v = vistaDe(FORM_BASE);
  assert.equal(v.veredicto.estado, 'gana');
  assert.equal(v.veredicto.clase, 'ver-gana');
  assert.equal(v.veredicto.gananciaComboN, 3);
  assert.match(v.veredicto.mejorCombo.precio, /^\$/);
  assert.ok(v.veredicto.lineas.length >= 2);
});

test('combos: formato y semáforo', () => {
  const v = vistaDe(FORM_BASE);
  assert.equal(v.combos[0].precio, '$105.100');
  assert.equal(v.combos[0].editable, false);       // modo sugerir
  assert.equal(v.combos[0].esSugerido, true);
  assert.match(v.combos[0].markup, /×$/);
  assert.ok(v.combos[0].semaforo.clase.startsWith('sem-'));
  assert.ok(v.combos[2].esMejor);
});

test('desglose: las partes suman el precio', () => {
  const v = vistaDe(FORM_BASE);
  const suma = v.desglose.partes.reduce((a, p) => a + p.anchoPct, 0);
  assert.ok(Math.abs(suma - 100) < 0.5, `Σ anchoPct = ${suma}`);
  assert.equal(v.desglose.partes.length, 6);
  assert.equal(v.desglose.partes[5].label, 'Tu utilidad');
});

test('equilibrio: 6 filas; unidades/día sin fijos → no alcanzable', () => {
  const v = vistaDe(FORM_BASE);
  assert.equal(v.equilibrio.length, 6);
  const u = v.equilibrio.find((f) => f.clave === 'unidadesDiaFijos');
  assert.equal(u.alcanzable, false);
  assert.equal(u.limite, '—');
});

test('proyección: disponible con presupuesto + pauta', () => {
  const v = vistaDe(FORM_BASE);
  assert.equal(v.proyeccion.disponible, true);
  assert.equal(v.proyeccion.pedidosDia, '1,0');
  assert.match(v.proyeccion.utilidadMes, /^\$/);
});

test('sin pauta: veredicto sin-pauta, combos gana "—", proyección no disponible', () => {
  const v = vistaDe(formDefecto({ ...FORM_BASE, costoConversacion: '0' }));
  assert.equal(v.veredicto.estado, 'sin-pauta');
  assert.equal(v.combos[0].gana, '—');
  assert.equal(v.combos[0].cac, '—');
  assert.equal(v.proyeccion.disponible, false);
});

test('avisos: nivel → clase, y el resumen cuenta', () => {
  const v = vistaDe(formDefecto({ ...FORM_BASE, costoUnitario: '0' }));  // dispara costo_faltante (error)
  assert.ok(v.avisos.some((a) => a.codigo === 'costo_faltante' && a.clase === 'av-error'));
  assert.ok(v.resumenAvisos.errores >= 1);
});
