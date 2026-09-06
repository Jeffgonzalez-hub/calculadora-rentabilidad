// test/perfil-roundtrip.test.js
// Regresión de C1: el <input> de una fila del Perfil económico se renderiza
// desde el número CRUDO y se re-parsea con parseNumLocal — NO desde el texto
// formateado. Antes, "$20.000" volvía como 20 (silent $0).
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Node no trae localStorage: shim en memoria antes de importar los módulos de ui/.
class LocalStorageStub {
  #m = new Map();
  getItem(k) { return this.#m.has(k) ? this.#m.get(k) : null; }
  setItem(k, v) { this.#m.set(k, String(v)); }
  removeItem(k) { this.#m.delete(k); }
  clear() { this.#m.clear(); }
}
globalThis.localStorage = new LocalStorageStub();

const { perfilToVista } = await import('../ui/adapter.js');
const { PERFIL_DEFECTO } = await import('../ui/perfil.js');
const { parseNumLocal } = await import('../ui/perfil-pantalla.js');

// Espeja ES_PCT de ui/perfil-pantalla.js (no se exporta).
const ES_PCT = new Set(['tasaEntrega', 'tasaCierre', 'pctProductoPerdidoEnDevolucion', 'comisionRecaudoPct']);

// value que filaHtml() escribe tras el fix C1: número crudo (pct -> *100).
const valorRenderizado = (clave, valor) => (valor == null ? '' : (ES_PCT.has(clave) ? valor * 100 : valor));
// ruta de lectura de emitir(): parseNumLocal + /100 en los pct.
const leer = (clave, raw) => {
  const n = parseNumLocal(String(raw));
  return n == null ? null : (ES_PCT.has(clave) ? n / 100 : n);
};

const CASOS = { fleteIda: 20000, comisionRecaudoPct: 0.05, costosFijosMes: 3000000 };

for (const [clave, valor] of Object.entries(CASOS)) {
  test(`round-trip del perfil: ${clave}=${valor} sobrevive render -> parse sin corromperse`, () => {
    const perfil = { ...structuredClone(PERFIL_DEFECTO), [clave]: { valor, estado: 'REAL' } };
    const fila = perfilToVista(perfil).filas.find((f) => f.clave === clave);
    assert.ok(fila, `falta la fila ${clave}`);
    assert.ok(fila.valorTexto, `${clave}: valorTexto vacío`);
    const rt = leer(clave, valorRenderizado(clave, fila.valor));
    assert.ok(Math.abs(rt - valor) < 1e-9, `${clave}: round-trip dio ${rt}, esperaba ${valor}`);
  });
}

test('parseNumLocal: tolera separador de miles es-CO y coma decimal, vacío -> null', () => {
  assert.equal(parseNumLocal('20.000'), 20000);
  assert.equal(parseNumLocal('3.000.000'), 3000000);
  assert.equal(parseNumLocal('$ 20.000'), 20000);
  assert.equal(parseNumLocal('0,05'), 0.05);
  assert.equal(parseNumLocal(''), null);
  assert.equal(parseNumLocal('   '), null);
  assert.equal(parseNumLocal(null), null);
});
