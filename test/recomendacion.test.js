import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarEntrada } from '../src/normalizar.js';
import { crearCostos } from '../src/costos.js';
import { crearPublicidad } from '../src/publicidad.js';
import { crearRentabilidad } from '../src/rentabilidad.js';
import { crearCombos } from '../src/combos.js';
import { construirRecomendacion } from '../src/recomendacion.js';

function recomendacionDe(entrada) {
  const { ctx, procedencia } = normalizarEntrada(entrada);
  const costos = crearCostos(ctx);
  const publicidad = crearPublicidad(ctx);
  const rent = crearRentabilidad(ctx, costos, publicidad);
  const combosMod = crearCombos(ctx, costos, rent);
  const { combo } = combosMod.evaluarCombo(1);
  const precioCrudo1 = combosMod.precioCrudo(1);
  return construirRecomendacion(ctx, procedencia, combo, rent, publicidad, precioCrudo1);
}

const CON_CAC = { supuestos: { fleteIda: 20000, fleteDevolucion: 20000, comisionRecaudoPct: 0.05 }, mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 } };
const SIN_CAC = { supuestos: { fleteIda: 20000, fleteDevolucion: 20000, comisionRecaudoPct: 0.05 }, mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 0 } };

test('sin_costo: costoUnitario ausente -> precio null, sin llamar la fórmula', () => {
  const r = recomendacionDe({ ...CON_CAC });
  assert.equal(r.estado, 'sin_costo');
  assert.equal(r.precio, null);
});

test('sin_objetivo: regla.valor null -> precio null', () => {
  const r = recomendacionDe({ producto: { costoUnitario: 24000 }, ...CON_CAC, objetivo: { regla: { tipo: 'margen_neto', valor: null } } });
  assert.equal(r.estado, 'sin_objetivo');
  assert.equal(r.precio, null);
});

test('no_calculable: fleteIda FALTANTE (null explícito) -> precio null, nombra el parámetro', () => {
  const r = recomendacionDe({ producto: { costoUnitario: 24000 }, supuestos: { fleteIda: null }, mercado: CON_CAC.mercado });
  assert.equal(r.estado, 'no_calculable');
  assert.equal(r.precio, null);
  assert.equal(r.parametroFaltante, 'fleteIda');
});

test('no_alcanzable: 1-q-m<=0 -> precio null, nunca compara contra el break-even', () => {
  const r = recomendacionDe({
    producto: { costoUnitario: 24000 }, procedencia: { costoUnitario: 'REAL' },
    supuestos: { fleteIda: 20000, comisionRecaudoPct: 0.80 }, mercado: CON_CAC.mercado,
  });
  assert.equal(r.estado, 'no_alcanzable');
  assert.equal(r.precio, null);
});

test('estimacion_neto: CAC disponible + al menos un supuesto -> estimación, tipoMargen neto', () => {
  const r = recomendacionDe({
    producto: { costoUnitario: 24000 }, procedencia: { costoUnitario: 'REAL' },
    ...CON_CAC,
  });
  assert.equal(r.estado, 'estimacion_neto');
  assert.equal(r.tipoMargen, 'neto');
  assert.equal(r.confianza.cacDisponible, true);
  assert.ok(r.precio > 0);
  assert.ok(r.confianza.supuestos.length > 0 || r.confianza.faltantesAsumidosCero.length > 0);
  // §B.3: el hero neto muestra la utilidad neta de adquisición (por debajo de la bruta)
  assert.ok(r.utilidadNeta != null && r.utilidadNeta < r.utilidadPorVentaEntregada);
});

test('ok_neto: TODO marcado REAL explícitamente + CAC disponible -> sin estimación', () => {
  const entrada = {
    producto: { costoUnitario: 24000 },
    supuestos: { fleteIda: 20000, fleteDevolucion: 20000, feeDevolucion: 0, pctProductoPerdidoEnDevolucion: 0, comisionRecaudoPct: 0.05, comisionRecaudoFijo: 0, empaquePorPedido: 0, costoAtencionConversacion: 0 },
    mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 },
    procedencia: {
      costoUnitario: 'REAL', fleteIda: 'REAL', fleteDevolucion: 'REAL', feeDevolucion: 'REAL',
      pctProductoPerdidoEnDevolucion: 'REAL', comisionRecaudoPct: 'REAL', comisionRecaudoFijo: 'REAL',
      empaquePorPedido: 'REAL', costoAtencionConversacion: 'REAL', tasaEntrega: 'REAL', tasaCierre: 'REAL',
      costoConversacion: 'REAL', costosFijosMes: 'REAL', diasOperacionMes: 'REAL',
    },
  };
  const r = recomendacionDe(entrada);
  assert.equal(r.estado, 'ok_neto');
  assert.deepEqual(r.confianza.supuestos, []);
  assert.deepEqual(r.confianza.faltantesAsumidosCero, []);
});

test('estimacion_bruto: sin CAC (costoConversacion=0) -> tipoMargen operativo', () => {
  const r = recomendacionDe({
    producto: { costoUnitario: 24000 }, procedencia: { costoUnitario: 'REAL' },
    ...SIN_CAC,
  });
  assert.equal(r.estado, 'estimacion_bruto');
  assert.equal(r.tipoMargen, 'operativo');
  assert.equal(r.confianza.cacDisponible, false);
  assert.equal(r.margenLogrado, r.margenLogrado); // no NaN
  assert.ok(r.precio > 0);
  assert.equal(r.utilidadNeta, null); // sin CAC no hay utilidad neta de adquisición
});

test('margen objetivo 0%: estado válido, aviso "margen_cero" informativo', () => {
  const r = recomendacionDe({
    producto: { costoUnitario: 24000 }, procedencia: { costoUnitario: 'REAL' },
    ...CON_CAC, objetivo: { regla: { tipo: 'margen_neto', valor: 0 } },
  });
  assert.ok(r.avisos.some((a) => a.codigo === 'margen_cero'));
  assert.ok(r.precio > 0); // sigue calculando: 0% no es no_alcanzable
});

test('regla markup: siempre estimacion_*, sin importar cuántos REAL haya', () => {
  const entrada = {
    producto: { costoUnitario: 24000 },
    supuestos: { fleteIda: 20000 },
    mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 },
    objetivo: { regla: { tipo: 'markup', valor: 2 } },
    procedencia: { costoUnitario: 'REAL', fleteIda: 'REAL', tasaEntrega: 'REAL', tasaCierre: 'REAL', costoConversacion: 'REAL' },
  };
  const r = recomendacionDe(entrada);
  assert.match(r.estado, /^estimacion_/);
});
