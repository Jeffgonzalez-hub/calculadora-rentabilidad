import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizar } from '../src/index.js';
import { sensibilidadUnaVariable, tornado, matrizEntregaCierre } from '../src/escenarios.js';

const A = (e) => analizar(e, { conEscenarios: false });

const BASE = {
  producto: { costoUnitario: 37500, precioBase: null, escaleraPrecios: [] },
  supuestos: { fleteIda: 20000, fleteDevolucion: 10000 },
  mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 },
  publicidad: { presupuestoDia: 20000 },
  objetivo: { modo: 'sugerir', utilidadObjetivo: 40000 },
};

test('sensibilidad: 11 pasos, delta de -0.5 a 0.5', () => {
  const s = sensibilidadUnaVariable(BASE, 'costoConversacion', A);
  assert.equal(s.length, 11);
  assert.ok(Math.abs(s[0].delta + 0.5) < 1e-9);
  assert.ok(Math.abs(s[10].delta - 0.5) < 1e-9);
});

test('sensibilidad: utilidadFinal baja al subir costoConversacion', () => {
  const s = sensibilidadUnaVariable(BASE, 'costoConversacion', A);
  assert.ok(s[10].utilidadFinal < s[0].utilidadFinal);
});

test('sensibilidad: utilidadFinal sube al subir tasaEntrega', () => {
  const s = sensibilidadUnaVariable(BASE, 'tasaEntrega', A);
  assert.ok(s[10].utilidadFinal > s[0].utilidadFinal);
});

test('sensibilidad: marca cruzaCero donde cambia de signo', () => {
  const s = sensibilidadUnaVariable(BASE, 'costoConversacion', A);
  const cruces = s.filter((x) => x.cruzaCero).length;
  assert.ok(cruces <= 1);
});

test('tornado: ordenado por impacto absoluto descendente', () => {
  const t = tornado(BASE, A);
  assert.equal(t.length, 5);
  const mag = (f) => Math.max(Math.abs(f.impactoAbajo ?? 0), Math.abs(f.impactoArriba ?? 0));
  for (let i = 1; i < t.length; i++) assert.ok(mag(t[i - 1]) >= mag(t[i]) - 1e-6);
});

test('tornado: subir un costo da impacto negativo', () => {
  const t = tornado(BASE, A);
  const cc = t.find((f) => f.variable === 'costoConversacion');
  assert.ok(cc.impactoArriba < 0);
});

test('matriz: 5x5, celda actual marcada, esquina buena >= esquina mala', () => {
  const m = matrizEntregaCierre(BASE, A);
  assert.equal(m.celdas.length, 5);
  assert.equal(m.celdas[0].length, 5);
  const marcadas = m.celdas.flat().filter((c) => c.actual).length;
  assert.equal(marcadas, 1);
  const buena = m.celdas[4][4].utilidadMes; // entrega 0.9, cierre 0.30
  const mala = m.celdas[0][0].utilidadMes;  // entrega 0.5, cierre 0.10
  assert.ok(buena >= mala);
});

test('analizar() ahora incluye escenarios', () => {
  const r = analizar(BASE);
  assert.ok(r.escenarios && r.escenarios.tornado && r.escenarios.matrizEntregaCierre);
  assert.ok(r.escenarios.sensibilidad.precio && r.escenarios.sensibilidad.tasaEntrega);
});
