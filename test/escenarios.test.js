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
  objetivo: { modo: 'sugerir', regla: { tipo: 'utilidad_fija', valor: 40000 } },
};

// precio y costoPedidoFallido se prueban en modo evaluar: en modo sugerir el redondeo del
// precio sugerido (sawtooth de hasta una granularidad) rompe la monotonía estricta paso a paso.
const EVAL = {
  producto: { costoUnitario: 37500, precioBase: 130000, escaleraPrecios: [] },
  supuestos: { fleteIda: 20000, fleteDevolucion: 12000 },
  mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 },
  publicidad: { presupuestoDia: 20000 },
  objetivo: { modo: 'evaluar' },
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

test('sensibilidad: utilidadFinal sube al subir tasaCierre', () => {
  const s = sensibilidadUnaVariable(BASE, 'tasaCierre', A);
  assert.ok(s[10].utilidadFinal > s[0].utilidadFinal);
});

test('sensibilidad (evaluar): utilidadFinal sube al subir el precio', () => {
  const s = sensibilidadUnaVariable(EVAL, 'precio', A);
  assert.ok(s[10].utilidadFinal > s[0].utilidadFinal);
});

test('sensibilidad (evaluar): utilidadFinal baja al subir costoPedidoFallido', () => {
  const s = sensibilidadUnaVariable(EVAL, 'costoPedidoFallido', A);
  assert.ok(s[10].utilidadFinal < s[0].utilidadFinal);
});

test('sensibilidad: cruzaCero marca el primer cambio de signo real', () => {
  // costoConversacion alto deja la utilidad final base chica y positiva; el barrido ±50%
  // la lleva a negativa => hay exactamente un cruce.
  const base = { ...BASE, mercado: { ...BASE.mercado, costoConversacion: 5200 } };
  const s = sensibilidadUnaVariable(base, 'costoConversacion', A);
  const cruces = s.filter((x) => x.cruzaCero).length;
  assert.equal(cruces, 1);

  const idx = s.findIndex((x) => x.cruzaCero);
  let primerCambio = -1;
  for (let i = 1; i < s.length; i++) {
    if (Math.sign(s[i - 1].utilidadFinal) !== Math.sign(s[i].utilidadFinal)) { primerCambio = i; break; }
  }
  assert.equal(idx, primerCambio);
  assert.ok(s[idx - 1].utilidadFinal > 0 && s[idx].utilidadFinal < 0);
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

test('tornado (modo sugerir): la fila precio refleja ±10% del precio realizado', () => {
  const base = A(BASE);
  const ingreso1 = base.combos[0].ingreso;
  const baseFinal = base.combos[0].utilidad.final;
  const t = tornado(BASE, A);
  const filaPrecio = t.find((f) => f.variable === 'precio');

  const evalArriba = A({
    ...BASE,
    producto: { costoUnitario: 37500, precioBase: ingreso1 * 1.1, escaleraPrecios: [] },
    objetivo: { modo: 'evaluar' },
  }).combos[0].utilidad.final;
  const evalAbajo = A({
    ...BASE,
    producto: { costoUnitario: 37500, precioBase: ingreso1 * 0.9, escaleraPrecios: [] },
    objetivo: { modo: 'evaluar' },
  }).combos[0].utilidad.final;

  assert.ok(Math.abs(filaPrecio.impactoArriba - (evalArriba - baseFinal)) < 1);
  assert.ok(Math.abs(filaPrecio.impactoAbajo - (evalAbajo - baseFinal)) < 1);
  // sanity: +10% del precio realizado mueve la utilidad bastante más que +3.8%
  // (lo que daba el bug de escalar utilidadObjetivo)
  assert.ok(Math.abs(filaPrecio.impactoArriba) > 0.05 * ingreso1);
});

test('matriz: 5x5, celda actual marcada, esquina buena >= esquina mala', () => {
  const m = matrizEntregaCierre(BASE, A);
  assert.equal(m.celdas.length, 5);
  assert.equal(m.celdas[0].length, 5);
  const marcadas = m.celdas.flat().filter((c) => c.actual).length;
  assert.equal(marcadas, 1);
  assert.ok(typeof m.celdas[4][4].utilidadMes === 'number' && typeof m.celdas[0][0].utilidadMes === 'number');
  const buena = m.celdas[4][4].utilidadMes; // entrega 0.9, cierre 0.30
  const mala = m.celdas[0][0].utilidadMes;  // entrega 0.5, cierre 0.10
  assert.ok(buena >= mala);
});

test('analizar() incluye escenarios con { conEscenarios: true }', () => {
  const r = analizar(BASE, { conEscenarios: true });
  assert.ok(r.escenarios && r.escenarios.tornado && r.escenarios.matrizEntregaCierre);
  assert.ok(r.escenarios.sensibilidad.precio && r.escenarios.sensibilidad.tasaEntrega);
});
