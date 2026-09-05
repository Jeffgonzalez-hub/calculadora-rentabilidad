// test/perfil.test.js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Node no trae localStorage: shim en memoria antes de importar perfil.js.
class LocalStorageStub {
  #m = new Map();
  getItem(k) { return this.#m.has(k) ? this.#m.get(k) : null; }
  setItem(k, v) { this.#m.set(k, String(v)); }
  removeItem(k) { this.#m.delete(k); }
  clear() { this.#m.clear(); }
}
globalThis.localStorage = new LocalStorageStub();

const {
  PERFIL_DEFECTO, PRIORIDADES, ETIQUETAS,
  cargarPerfil, guardarPerfil, restablecerPerfil, perfilAEntrada, contarConfianza,
} = await import('../ui/perfil.js');

beforeEach(() => globalThis.localStorage.clear());

test('PERFIL_DEFECTO trae los defaults JDSMPlus de §A.2 con su estado inicial', () => {
  assert.deepEqual(PERFIL_DEFECTO.fleteIda, { valor: 20000, estado: 'SUPUESTO' });
  assert.deepEqual(PERFIL_DEFECTO.tasaEntrega, { valor: 0.75, estado: 'SUPUESTO' });
  assert.deepEqual(PERFIL_DEFECTO.tasaCierre, { valor: 0.20, estado: 'SUPUESTO' });
  assert.deepEqual(PERFIL_DEFECTO.costoConversacion, { valor: 4000, estado: 'SUPUESTO' });
  assert.deepEqual(PERFIL_DEFECTO.diasOperacionMes, { valor: 30, estado: 'SUPUESTO' });
  for (const k of ['fleteDevolucion', 'feeDevolucion', 'pctProductoPerdidoEnDevolucion',
    'comisionRecaudoPct', 'comisionRecaudoFijo', 'empaquePorPedido', 'costoAtencionConversacion', 'costosFijosMes']) {
    assert.deepEqual(PERFIL_DEFECTO[k], { valor: null, estado: 'FALTANTE' }, k);
  }
});

test('cargarPerfil sin nada guardado devuelve los defaults', () => {
  assert.deepEqual(cargarPerfil(), PERFIL_DEFECTO);
});

test('guardarPerfil + cargarPerfil hace ida y vuelta', () => {
  const p = { ...structuredClone(PERFIL_DEFECTO), comisionRecaudoPct: { valor: 0.05, estado: 'REAL' } };
  assert.equal(guardarPerfil(p), true);
  assert.deepEqual(cargarPerfil().comisionRecaudoPct, { valor: 0.05, estado: 'REAL' });
  // claves no tocadas siguen en su default
  assert.deepEqual(cargarPerfil().fleteIda, { valor: 20000, estado: 'SUPUESTO' });
});

test('cargarPerfil con JSON corrupto en storage cae a defaults, sin lanzar', () => {
  globalThis.localStorage.setItem('calc-rentabilidad-perfil-v2', '{no es json');
  assert.doesNotThrow(() => cargarPerfil());
  assert.deepEqual(cargarPerfil(), PERFIL_DEFECTO);
});

test('restablecerPerfil borra el storage y devuelve defaults frescos', () => {
  guardarPerfil({ ...structuredClone(PERFIL_DEFECTO), fleteIda: { valor: 99999, estado: 'REAL' } });
  const p = restablecerPerfil();
  assert.deepEqual(p, PERFIL_DEFECTO);
  assert.deepEqual(cargarPerfil(), PERFIL_DEFECTO);
});

test('perfilAEntrada: remapea a supuestos/mercado/overhead + procedencia, sin calcular nada', () => {
  const p = structuredClone(PERFIL_DEFECTO);
  p.comisionRecaudoPct = { valor: 0.05, estado: 'REAL' };
  const e = perfilAEntrada(p);
  assert.equal(e.supuestos.fleteIda, 20000);
  assert.equal(e.supuestos.comisionRecaudoPct, 0.05);
  assert.equal(e.supuestos.fleteDevolucion, null);          // FALTANTE -> null, no 0
  assert.equal(e.mercado.tasaEntrega, 0.75);
  assert.equal(e.mercado.costoConversacion, 4000);
  assert.equal(e.overhead.diasOperacionMes, 30);
  assert.equal(e.overhead.costosFijosMes, null);
  assert.equal(e.procedencia.fleteIda, 'SUPUESTO');
  assert.equal(e.procedencia.comisionRecaudoPct, 'REAL');
  assert.equal(e.procedencia.fleteDevolucion, 'FALTANTE');
});

test('contarConfianza cuenta por estado (defaults: 0 real / 5 supuesto / 8 falta)', () => {
  assert.deepEqual(contarConfianza(PERFIL_DEFECTO), { real: 0, supuesto: 5, falta: 8 });
});

test('PRIORIDADES: las degradantes marcan impacto "precio"; costosFijosMes marca "diagnostico"', () => {
  const porClave = Object.fromEntries(PRIORIDADES.map((p) => [p.clave, p.impacto]));
  assert.equal(porClave.comisionRecaudoPct, 'precio');
  assert.equal(porClave.empaquePorPedido, 'precio');
  assert.equal(porClave.costosFijosMes, 'diagnostico');
});

test('ETIQUETAS: hay título + ayuda para cada clave del perfil', () => {
  for (const k of Object.keys(PERFIL_DEFECTO)) {
    assert.ok(ETIQUETAS[k]?.titulo, `falta ETIQUETAS.${k}.titulo`);
    assert.ok(ETIQUETAS[k]?.ayuda, `falta ETIQUETAS.${k}.ayuda`);
  }
});
