# UI V2 — Precio con Confianza — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task, fresh subagent per task, tests + review between tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the browser UI so the recommended price is the dominant element of the screen, its confidence (NETO/BRUTO · ESTIMADO/REAL) is readable at a glance, and everything else — the economic profile, the combos, the break-even, the scenarios — sits behind progressive disclosure; add a dedicated "Perfil económico" screen where every parameter carries a REAL/SUPUESTO/FALTANTE state that the user edits and that persists in `localStorage`.

**Architecture:** A new `ui/perfil.js` holds the JDSMPlus economic profile (the §A.2 defaults, each tagged REAL/SUPUESTO/FALTANTE) plus `localStorage` load/save — **zero formulas**, pure field remapping into the shape the engine's `entrada` expects. `ui/adapter.js` shrinks its `CAMPOS` to the two vista-básica inputs (cost + target margin), merges the profile into `entrada`, sends `objetivo.regla` + `entrada.procedencia`, and gains `recomendacionToVista` (the 8-state → hero-card view lookup, a static table + formatters, no arithmetic) and `perfilToVista`. `ui/render.js` paints a hero card built around a **persistent** `aria-live` price node (never re-created by `innerHTML` — fixes a V1 accessibility gap) plus collapsible secondary blocks; a new `ui/perfil-pantalla.js` paints the profile screen. `ui/formulario.js` becomes just the two básica inputs. `index.html` and `ui/estilos.css` are rebuilt on the JDSMPlus palette. The layer boundary from `docs/diseno-v2.md` §A.13 holds: only `ui/adapter.js` imports the engine, and only its public `analizar`/`DEFAULTS`.

**Tech Stack:** Vanilla ES modules, no framework, no build step. `node:test` for the pure modules (`ui/perfil.js`, `ui/adapter.js`, `ui/formato.js`) and the static purity guards; DOM modules are verified by `node --check` + the purity guards + a manual browser pass via `npm run dev` (`http://localhost:5173`). Fonts from Google Fonts (Fraunces / Work Sans / IBM Plex Mono).

**Spec:** `docs/diseno-v2.md` (Part B — Diseño UX/UI). The approved visual reference is the wireframe artifact `Precio con confianza` (published during design review; its four tabs — *no calculable*, *estimación bruta*, *estimación neta*, *perfil económico* — are the four visual targets, realized here as dynamic states of one live screen). This plan consumes the engine contract produced by `docs/plan-v2-motor.md` (already implemented and merged).

## Global Constraints

- **Engine contract (from `docs/plan-v2-motor.md`, already merged):** `analizar(entrada)` returns `resultado.recomendacion` = `{ estado, precio, precioCrudo, tipoMargen, margenObjetivo, margenLogrado, utilidadPorVentaEntregada, confianza: { supuestos, faltantesAsumidosCero, cacDisponible }, avisos, parametroFaltante? }`; `resultado.procedencia` = a flat `{ <param>: 'REAL'|'SUPUESTO'|'FALTANTE'|'CONFIG' }` map that also carries derived entries `procedencia.cac` and `procedencia.precioRecomendado`; `resultado.equilibrio.precioMinimoOperativo` = `[{ n, valor }]`. `entrada.objetivo.regla` = `{ tipo: 'margen_neto'|'utilidad_fija'|'markup', valor }` (V2 default `{ tipo: 'margen_neto', valor: 0.25 }`); `entrada.procedencia` is the map the adapter supplies from the profile + the cost field.
- **The 8 recommendation states** are `sin_costo`, `sin_objetivo`, `no_calculable`, `no_alcanzable`, `ok_bruto`, `estimacion_bruto`, `ok_neto`, `estimacion_neto`. Their hero-card treatment (what shows, accent colour, CTA) is `docs/diseno-v2.md` §B.7 — copy that table into `recomendacionToVista` verbatim.
- **Layer boundary (enforced by `test/ui-separada.test.js`, extended in Task 11):** `ui/adapter.js` is the only file that may `import` from `../src/`, and only `../src/index.js`. `ui/formulario.js` / `ui/render.js` / `ui/graficos.js` / `ui/perfil-pantalla.js` never import from `../src/`. `ui/perfil.js` never imports from `../src/`, may use `localStorage`, must not touch `document` / `window` / `fetch(`. `ui/adapter.js` / `ui/perfil.js` / `ui/formato.js` contain **no business arithmetic** — they format and remap; every number they show comes pre-computed from `resultado`.
- **Accessibility (`docs/diseno-v2.md` §B.11):** the price node is a **persistent** DOM element with `aria-live="polite"` — update its `textContent`, never re-create it via `innerHTML`. State chips carry a text label (`REAL` / `SUPUESTO` / `FALTA`) and a shape/glyph cue, never colour alone. Tooltips open on `:focus` as well as `:hover`. Tab order: cost → margin → primary CTA → accordions. `@media (prefers-reduced-motion: reduce)` disables transitions on the price and the charts. Touch targets ≥ 44px on mobile.
- **JDSMPlus palette (`docs/diseno-v2.md` §B.12):** verde principal `#3D5340`, verde claro `#C3CCA6`, fondo neutro `#FAF5F0`, tinta ~`#26302A`, ámbar SUPUESTO ~`#A6712A`, rojo FALTANTE ~`#AE4736`, azul/pizarra CONFIG ~`#54608A`. Legibility beats branding: if `#3D5340` doesn't contrast on a surface, use tinta.
- **Never render a fabricated `$0` or a price ≈ cost as if it were a recommendation.** `sin_costo` / `sin_objetivo` / `no_calculable` / `no_alcanzable` show **no price number** — they show what's missing and a CTA.
- **Out of scope for V2 UI:** "Evaluar" mode (measure a price you already picked). The engine still supports `modo: 'evaluar'`; the V2 UI always sends `modo: 'sugerir'`. Combos are never editable in this UI.
- No new npm dependencies. Node ≥ 22.5. `npm test` runs `node --test --test-concurrency=1`.

---

### Task 1: `ui/perfil.js` — the JDSMPlus economic profile + `localStorage`

**Files:**
- Create: `ui/perfil.js`
- Test: `test/perfil.test.js`

**Interfaces:**
- Consumes: nothing (no imports).
- Produces:
  - `PERFIL_DEFECTO` — frozen object, one entry per economic parameter: `{ [clave]: { valor: number|null, estado: 'REAL'|'SUPUESTO'|'FALTANTE' } }`.
  - `PRIORIDADES` — static array `[{ clave, impacto: 'precio'|'diagnostico' }]` ordering the "what would change your price most" list.
  - `ETIQUETAS` — static `{ [clave]: { titulo, ayuda } }` for row labels + the ⓘ tooltip text.
  - `cargarPerfil() => perfil` (reads `localStorage`, merges over `PERFIL_DEFECTO`, never throws).
  - `guardarPerfil(perfil) => boolean` (writes JSON, returns `false` on failure, never throws).
  - `restablecerPerfil() => perfil` (clears storage, returns a fresh `PERFIL_DEFECTO` clone).
  - `perfilAEntrada(perfil) => { supuestos, mercado, overhead, procedencia }` — remap only, **no math**.
  - `contarConfianza(perfil) => { real, supuesto, falta }`.
  - Task 2 (`ui/adapter.js`) imports `perfilAEntrada`; Task 7 (`ui/perfil-pantalla.js`) imports `PERFIL_DEFECTO`, `PRIORIDADES`, `ETIQUETAS`, `contarConfianza`; Task 10 (`ui/app.js`) imports `cargarPerfil`, `guardarPerfil`, `restablecerPerfil`.

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/perfil.test.js`
Expected: FAIL — `Cannot find module '../ui/perfil.js'`

- [ ] **Step 3: Write the implementation**

```js
// ui/perfil.js
/**
 * Perfil económico de JDSMPlus: cada parámetro con su valor y su estado
 * (REAL / SUPUESTO / FALTANTE). Persiste en localStorage. CERO fórmulas:
 * solo guarda, lee y remapea a la forma que espera entrada del motor.
 */

const CLAVE_STORAGE = 'calc-rentabilidad-perfil-v2';

// Defaults de docs/diseno-v2.md §A.2 (tabla de parámetros).
export const PERFIL_DEFECTO = Object.freeze({
  fleteIda: { valor: 20000, estado: 'SUPUESTO' },
  tasaEntrega: { valor: 0.75, estado: 'SUPUESTO' },
  tasaCierre: { valor: 0.20, estado: 'SUPUESTO' },
  costoConversacion: { valor: 4000, estado: 'SUPUESTO' },
  diasOperacionMes: { valor: 30, estado: 'SUPUESTO' },
  fleteDevolucion: { valor: null, estado: 'FALTANTE' },
  feeDevolucion: { valor: null, estado: 'FALTANTE' },
  pctProductoPerdidoEnDevolucion: { valor: null, estado: 'FALTANTE' },
  comisionRecaudoPct: { valor: null, estado: 'FALTANTE' },
  comisionRecaudoFijo: { valor: null, estado: 'FALTANTE' },
  empaquePorPedido: { valor: null, estado: 'FALTANTE' },
  costoAtencionConversacion: { valor: null, estado: 'FALTANTE' },
  costosFijosMes: { valor: null, estado: 'FALTANTE' },
});

// Orden de la lista "esto es lo que más cambiaría tu precio" (§B.5).
// 'precio' = entra en la fórmula del precio recomendado; 'diagnostico' = solo
// afecta la métrica de "unidades/día para fijos", no el precio.
export const PRIORIDADES = Object.freeze([
  { clave: 'comisionRecaudoPct', impacto: 'precio' },
  { clave: 'pctProductoPerdidoEnDevolucion', impacto: 'precio' },
  { clave: 'empaquePorPedido', impacto: 'precio' },
  { clave: 'fleteDevolucion', impacto: 'precio' },
  { clave: 'feeDevolucion', impacto: 'precio' },
  { clave: 'comisionRecaudoFijo', impacto: 'precio' },
  { clave: 'costoAtencionConversacion', impacto: 'precio' },
  { clave: 'costosFijosMes', impacto: 'diagnostico' },
]);

export const ETIQUETAS = Object.freeze({
  fleteIda: { titulo: 'Flete de ida', ayuda: 'Lo que pagás por enviarle el pedido al cliente. Se paga entregue o no.' },
  tasaEntrega: { titulo: 'Tasa de entrega', ayuda: '% de pedidos generados que terminan entregados y pagados.' },
  tasaCierre: { titulo: 'Tasa de cierre', ayuda: '% de conversaciones que terminan en un pedido.' },
  costoConversacion: { titulo: 'Costo por conversación', ayuda: 'Pauta invertida ÷ conversaciones generadas.' },
  diasOperacionMes: { titulo: 'Días de operación al mes', ayuda: 'Para repartir los costos fijos y proyectar.' },
  fleteDevolucion: { titulo: 'Flete de devolución', ayuda: 'Lo que cuesta que la guía vuelva cuando el pedido rebota.' },
  feeDevolucion: { titulo: 'Fee fijo por devolución', ayuda: 'Cargo fijo del operador logístico cuando una guía se devuelve.' },
  pctProductoPerdidoEnDevolucion: { titulo: '% de producto perdido en una devolución', ayuda: 'Qué parte del costo del producto no recuperás cuando vuelve.' },
  comisionRecaudoPct: { titulo: 'Comisión de recaudo (%)', ayuda: '% que la pasarela / transportadora cobra sobre el valor recaudado.' },
  comisionRecaudoFijo: { titulo: 'Comisión de recaudo (fija)', ayuda: 'Monto fijo por pedido entregado que cobra la pasarela.' },
  empaquePorPedido: { titulo: 'Empaque por pedido', ayuda: 'Caja, relleno, etiqueta — el costo de armar el paquete.' },
  costoAtencionConversacion: { titulo: 'Costo de atender la conversación', ayuda: 'Tiempo del asesor o de la herramienta, aparte del costo de la pauta.' },
  costosFijosMes: { titulo: 'Costos fijos al mes', ayuda: 'Sueldos, software, arriendo — lo que pagás vendas o no.' },
});

// Mapa clave del perfil -> rama de entrada del motor.
const RAMA = {
  fleteIda: 'supuestos', fleteDevolucion: 'supuestos', feeDevolucion: 'supuestos',
  pctProductoPerdidoEnDevolucion: 'supuestos', comisionRecaudoPct: 'supuestos',
  comisionRecaudoFijo: 'supuestos', empaquePorPedido: 'supuestos', costoAtencionConversacion: 'supuestos',
  tasaEntrega: 'mercado', tasaCierre: 'mercado', costoConversacion: 'mercado',
  costosFijosMes: 'overhead', diasOperacionMes: 'overhead',
};

function clonDefecto() {
  return JSON.parse(JSON.stringify(PERFIL_DEFECTO));
}

export function cargarPerfil() {
  try {
    const crudo = typeof localStorage !== 'undefined' ? localStorage.getItem(CLAVE_STORAGE) : null;
    if (!crudo) return clonDefecto();
    const guardado = JSON.parse(crudo);
    const out = clonDefecto();
    for (const k of Object.keys(out)) {
      const g = guardado?.[k];
      if (g && (typeof g.valor === 'number' || g.valor === null) && typeof g.estado === 'string') {
        out[k] = { valor: g.valor, estado: g.estado };
      }
    }
    return out;
  } catch {
    return clonDefecto();
  }
}

export function guardarPerfil(perfil) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify(perfil));
    return true;
  } catch {
    return false;
  }
}

export function restablecerPerfil() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(CLAVE_STORAGE);
  } catch { /* nada: igual devolvemos los defaults */ }
  return clonDefecto();
}

export function perfilAEntrada(perfil) {
  const supuestos = {};
  const mercado = {};
  const overhead = {};
  const procedencia = {};
  const ramas = { supuestos, mercado, overhead };
  for (const [clave, rama] of Object.entries(RAMA)) {
    const campo = perfil[clave] ?? PERFIL_DEFECTO[clave];
    ramas[rama][clave] = campo.valor; // number | null — el motor entiende null como FALTANTE
    procedencia[clave] = campo.estado;
  }
  return { supuestos, mercado, overhead, procedencia };
}

export function contarConfianza(perfil) {
  const c = { real: 0, supuesto: 0, falta: 0 };
  for (const clave of Object.keys(PERFIL_DEFECTO)) {
    const estado = (perfil[clave] ?? PERFIL_DEFECTO[clave]).estado;
    if (estado === 'REAL') c.real++;
    else if (estado === 'SUPUESTO') c.supuesto++;
    else c.falta++;
  }
  return c;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/perfil.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add ui/perfil.js test/perfil.test.js
git commit -m "feat(ui-v2): JDSMPlus economic profile with per-parameter state + localStorage

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `ui/adapter.js` — vista-básica `CAMPOS`, `formToEntrada(form, perfil)`, `perfilToVista(perfil)`

**Files:**
- Modify: `ui/adapter.js`
- Test: `test/adapter-form-a-entrada.test.js` (rewrite)

**Interfaces:**
- Consumes: `perfilAEntrada`, `contarConfianza`, `PERFIL_DEFECTO`, `PRIORIDADES`, `ETIQUETAS` from `ui/perfil.js` (Task 1); `analizar`, `DEFAULTS` from `../src/index.js` (unchanged import).
- Produces:
  - `CAMPOS` — now exactly two entries: `costoUnitario` (`tipo: 'moneda'`) and `margenObjetivo` (`tipo: 'porcentaje'`, `defecto: 25`, `presets: [15, 20, 25, 30]`).
  - `formToEntrada(form, perfil) => entrada` — merges the profile, sends `objetivo: { modo: 'sugerir', regla: { tipo: 'margen_neto', valor: form.margenObjetivo / 100 } }`, and a full `entrada.procedencia` (profile states + `costoUnitario: form.costoUnitario ? 'REAL' : 'FALTANTE'` + `'objetivo.regla.valor': 'CONFIG'`).
  - `perfilToVista(perfil) => { confianza, filas, prioridades }` — for the profile screen (Task 7).
  - Task 3 and Task 4 extend this same file; Task 5/7/10 import `CAMPOS` / `perfilToVista` / `analizarDesdeFormulario`.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `test/adapter-form-a-entrada.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/adapter-form-a-entrada.test.js`
Expected: FAIL — old `CAMPOS` has 26 entries; `formToEntrada` has the wrong signature and sends `utilidadObjetivo`; `perfilToVista` doesn't exist.

- [ ] **Step 3: Modify `ui/adapter.js`**

Replace the import block and the `CAMPOS` / `parseNum` / `leerCampo` / `formToEntrada` section (everything from the top of the file down to and including `formToEntrada`) with:

```js
// ui/adapter.js
/**
 * Adapter puro (sin DOM). Único módulo que habla los dos vocabularios:
 * form (vista básica) <-> entrada del motor, y Resultado <-> vista.
 * CERO fórmulas de negocio: formatea y remapea; los números salen del motor.
 */
import { analizar, DEFAULTS } from '../src/index.js';
import { perfilAEntrada, contarConfianza, PERFIL_DEFECTO, PRIORIDADES, ETIQUETAS } from './perfil.js';
import { pesos, pesosCompacto, pct, ratio, oGuion, numero } from './formato.js';

// Vista básica: solo costo del proveedor + margen objetivo. Todo lo demás vive
// en el Perfil económico (ui/perfil.js), no en el formulario.
export const CAMPOS = [
  { id: 'costoUnitario', tipo: 'moneda', label: 'Costo del proveedor', ayuda: 'Lo que te cuesta una unidad, sin flete.', defecto: '' },
  { id: 'margenObjetivo', tipo: 'porcentaje', label: 'Margen que quiero ganar', ayuda: 'Sobre el precio de venta, ya descontada la publicidad.', defecto: 25, presets: [15, 20, 25, 30] },
];

function parseNum(str, defecto = null) {
  if (str == null) return defecto;
  const limpio = String(str).replace(/[^\d,.\-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (limpio === '') return defecto;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : defecto;
}

/** form (strings del DOM) + perfil -> entrada anidada que consume analizar(). */
export function formToEntrada(form, perfil = PERFIL_DEFECTO) {
  const costoTexto = form.costoUnitario == null ? '' : String(form.costoUnitario).trim();
  const costoUnitario = costoTexto === '' ? null : parseNum(costoTexto, null);
  // Margen vacío -> null (estado sin_objetivo del motor). El input arranca en 25
  // pero el usuario lo puede borrar; no lo forzamos a un default acá.
  const margenTexto = form.margenObjetivo == null ? '' : String(form.margenObjetivo).trim();
  const margenPct = margenTexto === '' ? null : parseNum(margenTexto, null);

  const { supuestos, mercado, overhead, procedencia: procPerfil } = perfilAEntrada(perfil);

  return {
    producto: { costoUnitario, escaleraPrecios: [] },
    supuestos,
    mercado,
    overhead,
    objetivo: { modo: 'sugerir', regla: { tipo: 'margen_neto', valor: margenPct == null ? null : margenPct / 100 } },
    procedencia: {
      ...procPerfil,
      costoUnitario: costoUnitario == null ? 'FALTANTE' : 'REAL',
      'objetivo.regla.valor': 'CONFIG',
    },
  };
}

/** perfil -> vista de la pantalla de Perfil económico (filas + confianza + prioridades). */
export function perfilToVista(perfil) {
  const fmt = (clave, valor) => {
    if (valor == null) return '';
    if (clave === 'tasaEntrega' || clave === 'tasaCierre' || clave === 'pctProductoPerdidoEnDevolucion' || clave === 'comisionRecaudoPct') {
      return pct(valor, valor * 100 % 1 === 0 ? 0 : 1);
    }
    if (clave === 'diasOperacionMes') return numero(valor, 0);
    return pesos(valor);
  };

  const filas = Object.keys(PERFIL_DEFECTO).map((clave) => {
    const campo = perfil[clave] ?? PERFIL_DEFECTO[clave];
    return {
      clave,
      titulo: ETIQUETAS[clave].titulo,
      ayuda: ETIQUETAS[clave].ayuda,
      estado: campo.estado,
      valor: campo.valor,
      valorTexto: fmt(clave, campo.valor),
    };
  });

  const impactoDe = Object.fromEntries(PRIORIDADES.map((p) => [p.clave, p.impacto]));
  const prioridades = PRIORIDADES
    .map((p) => filas.find((f) => f.clave === p.clave))
    .filter((f) => f && f.estado === 'FALTANTE')
    .map((f) => ({ ...f, impacto: impactoDe[f.clave] }));

  return { confianza: contarConfianza(perfil), filas, prioridades };
}
```

> **Keep everything below `formToEntrada`** in the current `ui/adapter.js` for now (the `vistaVeredicto` / `vistaCombos` / `resultadoToVista` / `analizarDesdeFormulario` / `escenariosDesdeFormulario` block) — Tasks 3 and 4 rewrite those. This task deliberately leaves the file in a temporarily-inconsistent state where `analizarDesdeFormulario` still calls the old-signature helpers; that's fine because no test in this task exercises it, and `npm test` failures in `test/adapter-resultado-a-vista.test.js` / `test/adapter-escenarios.test.js` are expected until Task 4.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/adapter-form-a-entrada.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add ui/adapter.js test/adapter-form-a-entrada.test.js
git commit -m "feat(ui-v2): 2-field vista básica; formToEntrada merges the profile + sends objetivo.regla

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `ui/adapter.js` — `recomendacionToVista` (the 8-state → hero-card view)

**Files:**
- Modify: `ui/adapter.js`
- Test: `test/adapter-recomendacion-a-vista.test.js` (new)

**Interfaces:**
- Consumes: `resultado.recomendacion`, `resultado.procedencia`, `resultado.equilibrio.precioMinimoOperativo`, `resultado.avisos` (engine contract); formatters from `./formato.js`.
- Produces: `recomendacionToVista(resultado) => vistaHero`, shape:
  ```
  {
    estado,                       // el estado crudo, para clases CSS
    muestraPrecio: boolean,       // false para sin_costo/sin_objetivo/no_calculable/no_alcanzable
    precio: string | null,        // "$120.100" | null
    acento: 'verde'|'ambar'|'rojo'|'neutro',
    chips: [ { texto, tono } ],   // p.ej. [{texto:'NETO',tono:'verde'},{texto:'ESTIMADO',tono:'ambar'}]
    titulo: string,               // encabezado del hero segun el estado
    lineaMargen: string | '',     // "Margen neto objetivo 25% → logrado ≈25,1%"
    lineaUtilidad: string | '',   // "Utilidad estimada por venta entregada ≈ $30.100"
    advertencia: string | '',     // franja roja integrada (solo *_bruto)
    confianza: string,            // "3 supuestos usados · 2 datos faltantes — no asumidos en $0"
    porQue: string,               // texto del bloque "¿Por qué este precio?"
    cta: { texto, destino } | null,  // destino: 'perfil' | 'costo' | 'margen'
    precioMinimoOperativo: string | null,  // "$60.400" para el estado no_alcanzable / el bloque piso
  }
  ```
  Task 6 (`ui/render.js`) consumes `vistaHero`. **This function is a static lookup keyed by `estado` plus `formato.js` formatters — it must not do arithmetic. `lineaMargen`/`lineaUtilidad` interpolate values already present in `resultado.recomendacion` (`margenObjetivo`, `margenLogrado`, `utilidadPorVentaEntregada`); it never recomputes a margin or a price.**

- [ ] **Step 1: Write the failing test**

```js
// test/adapter-recomendacion-a-vista.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizar } from '../src/index.js';
import { recomendacionToVista } from '../ui/adapter.js';

const CON_CAC = { supuestos: { fleteIda: 20000, fleteDevolucion: 20000, comisionRecaudoPct: 0.05 }, mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 } };

function vistaDe(entrada) {
  return recomendacionToVista(analizar(entrada));
}

test('sin_costo: no muestra precio, acento neutro, CTA al campo de costo', () => {
  const v = vistaDe({ mercado: { costoConversacion: 4000 } });
  assert.equal(v.estado, 'sin_costo');
  assert.equal(v.muestraPrecio, false);
  assert.equal(v.precio, null);
  assert.equal(v.acento, 'neutro');
  assert.equal(v.cta.destino, 'costo');
});

test('no_calculable: no muestra precio, nombra el parámetro que falta, CTA al perfil', () => {
  const v = vistaDe({ producto: { costoUnitario: 24000 }, supuestos: { fleteIda: null }, mercado: CON_CAC.mercado });
  assert.equal(v.estado, 'no_calculable');
  assert.equal(v.muestraPrecio, false);
  assert.match(v.titulo, /flete de ida/i);
  assert.equal(v.cta.destino, 'perfil');
});

test('no_alcanzable: sin precio, muestra el mínimo operativo como escape', () => {
  const v = vistaDe({
    producto: { costoUnitario: 24000 }, procedencia: { costoUnitario: 'REAL' },
    supuestos: { fleteIda: 20000, comisionRecaudoPct: 0.80 }, mercado: CON_CAC.mercado,
    objetivo: { regla: { tipo: 'margen_neto', valor: 0.25 } },
  });
  assert.equal(v.estado, 'no_alcanzable');
  assert.equal(v.muestraPrecio, false);
  assert.equal(v.acento, 'rojo');
  assert.match(v.precioMinimoOperativo, /^\$/);
});

test('estimacion_neto: precio dominante, chips NETO + ESTIMADO, acento ámbar, CTA mejorar precisión', () => {
  const v = vistaDe({ producto: { costoUnitario: 24000 }, procedencia: { costoUnitario: 'REAL' }, ...CON_CAC });
  assert.equal(v.estado, 'estimacion_neto');
  assert.equal(v.muestraPrecio, true);
  assert.match(v.precio, /^\$\d/);
  assert.deepEqual(v.chips.map((c) => c.texto), ['NETO', 'ESTIMADO']);
  assert.equal(v.acento, 'ambar');
  assert.match(v.lineaMargen, /25/);
  assert.match(v.confianza, /supuesto/i);
  assert.match(v.confianza, /no asumid/i);          // §B: "no asumidos en $0"
  assert.equal(v.cta.destino, 'perfil');
});

test('estimacion_bruto: chips BRUTO + ESTIMADO, franja de advertencia de CAC obligatoria', () => {
  const v = vistaDe({ producto: { costoUnitario: 24000 }, procedencia: { costoUnitario: 'REAL' }, supuestos: CON_CAC.supuestos, mercado: { ...CON_CAC.mercado, costoConversacion: 0 } });
  assert.equal(v.estado, 'estimacion_bruto');
  assert.deepEqual(v.chips.map((c) => c.texto), ['BRUTO', 'ESTIMADO']);
  assert.match(v.advertencia, /no incluye|no cubre/i);
  assert.match(v.advertencia, /CAC|publicidad/i);
  assert.match(v.lineaMargen, /operativo/i);
});

test('ningún estado renderiza un precio "$0" fabricado', () => {
  for (const entrada of [
    { mercado: { costoConversacion: 4000 } },                                             // sin_costo
    { producto: { costoUnitario: 24000 }, supuestos: { fleteIda: null } },                // no_calculable
    { producto: { costoUnitario: 24000 }, objetivo: { regla: { tipo: 'margen_neto', valor: null } } }, // sin_objetivo
  ]) {
    const v = vistaDe(entrada);
    assert.equal(v.precio, null);
    assert.equal(v.muestraPrecio, false);
  }
});

test('porQue: siempre presente y menciona los componentes económicos', () => {
  const v = vistaDe({ producto: { costoUnitario: 24000 }, procedencia: { costoUnitario: 'REAL' }, ...CON_CAC });
  assert.ok(v.porQue.length > 0);
  assert.match(v.porQue, /flete|colch[oó]n|devoluc/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/adapter-recomendacion-a-vista.test.js`
Expected: FAIL — `recomendacionToVista is not a function`

- [ ] **Step 3: Add `recomendacionToVista` to `ui/adapter.js`**

Insert this block right after `perfilToVista` (from Task 2). The `COPIA_ESTADO` table is the machine-readable form of `docs/diseno-v2.md` §B.7 — keep the wording aligned with that table and with the approved wireframe.

```js
// --- Resultado.recomendacion -> vista del hero card (los 8 estados de §B.7) ---

const ACENTO_POR_ESTADO = {
  sin_costo: 'neutro', sin_objetivo: 'neutro',
  no_calculable: 'rojo', no_alcanzable: 'rojo',
  ok_neto: 'verde', estimacion_neto: 'ambar',
  ok_bruto: 'rojo', estimacion_bruto: 'rojo',
};

function chipsDe(rec) {
  if (rec.tipoMargen == null) return [];
  const tipo = rec.tipoMargen === 'neto'
    ? { texto: 'NETO', tono: 'verde' }
    : { texto: 'BRUTO', tono: 'ambar' };
  const confia = rec.estado.startsWith('ok_')
    ? { texto: 'REAL', tono: 'verde' }
    : { texto: 'ESTIMADO', tono: 'ambar' };
  return [tipo, confia];
}

function lineaConfianza(rec) {
  const s = rec.confianza.supuestos.length;
  const f = rec.confianza.faltantesAsumidosCero.length;
  const partes = [];
  if (s > 0) partes.push(`${s} supuesto${s === 1 ? '' : 's'} usado${s === 1 ? '' : 's'}`);
  if (f > 0) partes.push(`${f} dato${f === 1 ? '' : 's'} faltante${f === 1 ? '' : 's'} — no asumido${f === 1 ? '' : 's'} en $0, se avisan abajo`);
  if (!rec.confianza.cacDisponible) partes.unshift('falta el costo por conversación (CAC): precio en modo operativo, no neto');
  return partes.join(' · ');
}

function porQueDe(rec) {
  if (rec.estado === 'no_calculable') {
    return 'El flete de ida entra directo en el costo que cada venta entregada tiene que cubrir, incluida su parte del colchón por devoluciones. Sin ese número no hay un precio honesto que darte — por eso lo bloqueamos en vez de asumir $0.';
  }
  if (rec.estado === 'sin_costo') return 'Escribí el costo del proveedor para empezar.';
  if (rec.estado === 'sin_objetivo') return 'Elegí el margen que querés ganar.';
  if (rec.estado === 'no_alcanzable') return 'El margen que pediste más la comisión de recaudo se comen todo el precio. Bajá el margen o revisá la comisión.';
  const sinCac = !rec.confianza.cacDisponible;
  return sinCac
    ? 'Este precio junta el costo del producto, el flete de ida y vuelta, y un colchón para las devoluciones que no llegan — pero todavía NO incluye lo que cuesta conseguir la venta, porque ese dato falta.'
    : 'Este precio junta el costo del producto, el flete de ida y vuelta, un colchón para las devoluciones que no llegan, y lo que cuesta conseguir cada venta — todo dividido entre el margen que querés ganar.';
}

function ctaDe(rec) {
  switch (rec.estado) {
    case 'sin_costo': return { texto: 'Escribí el costo del proveedor', destino: 'costo' };
    case 'sin_objetivo': return { texto: 'Elegí el margen', destino: 'margen' };
    case 'no_calculable': return { texto: `Completá ${rec.parametroFaltante === 'fleteIda' ? 'el flete de ida' : rec.parametroFaltante} en el Perfil económico`, destino: 'perfil', clave: rec.parametroFaltante };
    case 'no_alcanzable': return { texto: 'Ajustá el margen o la comisión', destino: 'margen' };
    case 'ok_neto': return null;
    default: return { texto: 'Mejorar precisión', destino: 'perfil' };
  }
}

function advertenciaDe(rec) {
  if (rec.estado !== 'ok_bruto' && rec.estado !== 'estimacion_bruto') return '';
  return 'Este precio NO incluye publicidad — es margen operativo, no margen neto garantizado. '
    + 'Cuando cargués tu costo real de conseguir cada venta, el margen neto real puede quedar bastante por debajo de este número.';
}

export function recomendacionToVista(resultado) {
  const rec = resultado.recomendacion;
  const pmo1 = (resultado.equilibrio.precioMinimoOperativo ?? []).find((p) => p.n === 1)?.valor ?? null;
  const muestraPrecio = rec.precio != null;

  const tituloBloqueo = {
    sin_costo: 'Escribí el costo del proveedor',
    sin_objetivo: 'Elegí el margen que querés ganar',
    no_calculable: `Falta ${rec.parametroFaltante === 'fleteIda' ? 'el flete de ida' : rec.parametroFaltante} para calcular`,
    no_alcanzable: `Un margen del ${Math.round((rec.margenObjetivo ?? 0) * 100)}% no es posible con esta comisión de recaudo`,
  };

  const lineaMargen = muestraPrecio
    ? `Margen ${rec.tipoMargen} objetivo ${pct(rec.margenObjetivo ?? 0, 0)} → logrado ${oGuion(rec.margenLogrado, (x) => '≈ ' + pct(x, 1))}`
    : '';
  const lineaUtilidad = muestraPrecio
    ? `Utilidad ${rec.tipoMargen === 'operativo' ? 'operativa ' : ''}estimada por venta entregada ${oGuion(rec.utilidadPorVentaEntregada, (x) => '≈ ' + pesos(x))}`
      + (rec.tipoMargen === 'operativo' ? ' — sin restar publicidad' : '')
    : '';

  return {
    estado: rec.estado,
    muestraPrecio,
    precio: muestraPrecio ? pesos(rec.precio) : null,
    acento: ACENTO_POR_ESTADO[rec.estado] ?? 'neutro',
    chips: muestraPrecio ? chipsDe(rec) : [],
    titulo: muestraPrecio ? '' : (tituloBloqueo[rec.estado] ?? 'Sin recomendación'),
    lineaMargen,
    lineaUtilidad,
    advertencia: advertenciaDe(rec),
    confianza: muestraPrecio ? lineaConfianza(rec) : '',
    porQue: porQueDe(rec),
    cta: ctaDe(rec),
    precioMinimoOperativo: pmo1 == null ? null : pesos(pmo1),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/adapter-recomendacion-a-vista.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add ui/adapter.js test/adapter-recomendacion-a-vista.test.js
git commit -m "feat(ui-v2): recomendacionToVista — the 8-state hero-card view (static table + formatters)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `ui/adapter.js` — trim `resultadoToVista`, thread `perfil` through the public functions

**Files:**
- Modify: `ui/adapter.js`
- Test: `test/adapter-resultado-a-vista.test.js` (rewrite), `test/adapter-escenarios.test.js` (update fixture helper)

**Interfaces:**
- Produces:
  - `resultadoToVista(resultado, comboSeleccionado = 1) => vista` — **`veredicto` removed** (replaced by the hero card); keeps `combos`, `desglose`, `equilibrio`, `proyeccion`, `avisos`, `resumenAvisos`, `escenarios: null`; `equilibrio` gains a `precioMinimoOperativo` row (from `resultado.equilibrio.precioMinimoOperativo`). `modo` is gone from `meta` (always `'sugerir'`).
  - `analizarDesdeFormulario(form, perfil, comboSeleccionado = 1) => { vista, hero, entradaNormalizada, avisos }` — now also returns `hero` (= `recomendacionToVista(resultado)`).
  - `escenariosDesdeFormulario(form, perfil) => vistaEscenarios` — now takes `perfil`.
  - Task 6/10 consume `analizarDesdeFormulario` / `escenariosDesdeFormulario`.

- [ ] **Step 1: Rewrite `test/adapter-resultado-a-vista.test.js`**

```js
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
```

- [ ] **Step 2: Update `test/adapter-escenarios.test.js`**

Replace its `formDefecto` / `FORM` header (lines 5-11) with:

```js
import { CAMPOS, analizarDesdeFormulario, escenariosDesdeFormulario } from '../ui/adapter.js';
import { PERFIL_DEFECTO } from '../ui/perfil.js';

function formDefecto(over = {}) {
  const f = {};
  for (const c of CAMPOS) f[c.id] = String(c.defecto ?? '');
  return { ...f, ...over };
}
const FORM = formDefecto({ costoUnitario: '37500', margenObjetivo: '25' });
```

Then update the three call sites in that file: `analizarDesdeFormulario(FORM)` → `analizarDesdeFormulario(FORM, PERFIL_DEFECTO)`, `escenariosDesdeFormulario(FORM)` → `escenariosDesdeFormulario(FORM, PERFIL_DEFECTO)`, and in the "sin pauta" test, `escenariosDesdeFormulario(formDefecto({ ...FORM, costoConversacion: '0' }))` → build the no-CAC case through the profile instead: `escenariosDesdeFormulario(FORM, { ...JSON.parse(JSON.stringify(PERFIL_DEFECTO)), costoConversacion: { valor: 0, estado: 'REAL' } })`. The assertions in that file don't change — only how the fixture reaches "no CAC".

- [ ] **Step 3: Run to verify they fail**

Run: `node --test test/adapter-resultado-a-vista.test.js test/adapter-escenarios.test.js`
Expected: FAIL — `resultadoToVista` still emits `veredicto` and has the old signature; `analizarDesdeFormulario` doesn't return `hero` and doesn't take `perfil`.

- [ ] **Step 4: Modify `ui/adapter.js`**

1. **Delete** `vistaVeredicto` and its helper constants that only it uses (`vistaVeredicto` function; keep `clamp`, `pctFr`, `LABEL_PARTE`, `ANCHO_SEMAFORO`, `ETIQUETA_SEMAFORO` — `vistaCombos`/`vistaDesglose` still use them).

2. In `vistaEquilibrio(r)`, add the operative-floor row at the top of `filas`:

```js
  const pmo1 = (r.equilibrio.precioMinimoOperativo ?? []).find((p) => p.n === 1)?.valor ?? null;
  const filas = [
    filaEquilibrio('precioMinimoOperativo', 'Precio mínimo operativo (1u)', pmo1, ing1, 'moneda', 'min'),
    filaEquilibrio('precioMinimo', 'Precio mínimo con CAC (1u)', r.equilibrio.precioMinimo[0]?.valor, ing1, 'moneda', 'min'),
    filaEquilibrio('entregaMinima', 'Entrega mínima', eq.tasaEntregaMinima, m.tasaEntrega, 'pct', 'min'),
    filaEquilibrio('cierreMinimo', 'Cierre mínimo', eq.tasaCierreMinima, m.tasaCierre, 'pct', 'min'),
    filaEquilibrio('costoConvMax', 'Costo/conversación máx', eq.costoConversacionMaximo, m.costoConversacion, 'moneda', 'max'),
    filaEquilibrio('roasMinimo', 'ROAS mínimo', eq.roasMinimo, r.combos[0].roas.actual, 'ratio', 'min'),
    filaEquilibrio('unidadesDiaFijos', 'Unidades/día para fijos', uFijos > 0 ? uFijos : null, null, 'numero', 'min'),
  ];
  filas[0].actualLabel = filas[1].actualLabel = 'vendés a';
  filas[2].actualLabel = filas[3].actualLabel = 'tu tasa';
  filas[5].actualLabel = 'tu ROAS';
```

(remove the old `filas[0]`..`filas[4]` label reassignments that assumed the old indices).

3. Replace `resultadoToVista` and the two public functions:

```js
export function resultadoToVista(resultado, comboSeleccionado = 1) {
  const av = vistaAvisos(resultado.avisos);
  return {
    meta: { comboSeleccionado },
    avisos: av.lista,
    resumenAvisos: av.resumen,
    combos: vistaCombos(resultado),
    desglose: vistaDesglose(resultado, comboSeleccionado),
    equilibrio: vistaEquilibrio(resultado),
    proyeccion: vistaProyeccion(resultado),
    escenarios: null,
  };
}

export function analizarDesdeFormulario(form, perfil, comboSeleccionado = 1) {
  const entrada = formToEntrada(form, perfil);
  const resultado = analizar(entrada, { conEscenarios: false });
  return {
    vista: resultadoToVista(resultado, comboSeleccionado),
    hero: recomendacionToVista(resultado),
    entradaNormalizada: resultado.entradaNormalizada,
    avisos: resultado.avisos,
  };
}

export function escenariosDesdeFormulario(form, perfil) {
  const entrada = formToEntrada(form, perfil);
  const resultado = analizar(entrada, { conEscenarios: true });
  return vistaEscenarios(resultado.escenarios);
}
```

4. In `vistaCombos(r)`, delete the `modo` parameter and hard-code `editable: false` (V2 UI has no evaluar mode). Update its one call site inside `resultadoToVista` (already done above — no `modo` arg passed).

- [ ] **Step 5: Run to verify they pass**

Run: `node --test test/adapter-resultado-a-vista.test.js test/adapter-escenarios.test.js test/adapter-form-a-entrada.test.js test/adapter-recomendacion-a-vista.test.js`
Expected: PASS (all four files).

- [ ] **Step 6: Full suite (adapter is now internally consistent again)**

Run: `npm test`
Expected: `test/ui-separada.test.js` still passes (Task 2-4 didn't add `document`/`window`/`localStorage` to `adapter.js`, and `adapter.js` still only imports `../src/index.js` — plus now `./perfil.js`, which is a `./` sibling, not `../src/`). Everything else green. Task 11 extends `ui-separada` for `perfil.js`; if it fails *now*, check that `ui/perfil.js` didn't accidentally get imported by a `../src/` file.

- [ ] **Step 7: Commit**

```bash
git add ui/adapter.js test/adapter-resultado-a-vista.test.js test/adapter-escenarios.test.js
git commit -m "feat(ui-v2): drop veredicto from the vista; thread perfil + return hero from analizarDesdeFormulario

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `ui/formulario.js` — the two-input vista básica

**Files:**
- Modify: `ui/formulario.js`
- Test: none (DOM module; covered by `node --check`, the purity guard, and the manual pass in Task 12).

**Interfaces:**
- Consumes: `CAMPOS` from `./adapter.js` (Task 2).
- Produces: `montarEntradaBasica(contenedor, { alCambiar }) => { leerForm, enfocar }`. `leerForm()` returns `{ costoUnitario: string, margenObjetivo: string }`. `enfocar(destino)` where `destino ∈ 'costo' | 'margen'` moves focus to that input (used by the hero CTAs). No Sugerir/Evaluar toggle, no sections, no `<details>` avanzado.

- [ ] **Step 1: Replace the full contents of `ui/formulario.js`**

```js
// ui/formulario.js
/** La vista básica: costo del proveedor + margen objetivo. Sin lógica de pricing. */
import { CAMPOS } from './adapter.js';

const campo = (c) => CAMPOS.find((x) => x.id === c);

export function montarEntradaBasica(contenedor, { alCambiar }) {
  contenedor.innerHTML = '';

  const costo = campo('costoUnitario');
  const margen = campo('margenObjetivo');

  const wrap = document.createElement('div');
  wrap.className = 'entrada-basica';
  wrap.innerHTML = `
    <label class="campo-basico moneda">
      <span class="lbl">${costo.label}</span>
      <span class="caja"><input id="in-costo" type="text" inputmode="decimal" autocomplete="off"
        aria-describedby="ayuda-costo" placeholder="0"></span>
      <span id="ayuda-costo" class="ayuda">${costo.ayuda}</span>
    </label>
    <label class="campo-basico porcentaje">
      <span class="lbl">${margen.label}</span>
      <span class="caja"><input id="in-margen" type="text" inputmode="decimal" autocomplete="off"
        aria-describedby="ayuda-margen" value="${margen.defecto}"></span>
      <span class="presets" role="group" aria-label="Márgenes frecuentes">
        ${margen.presets.map((p) => `<button type="button" class="preset" data-v="${p}">${p}%</button>`).join('')}
      </span>
      <span id="ayuda-margen" class="ayuda">${margen.ayuda}</span>
    </label>`;
  contenedor.append(wrap);

  const inCosto = wrap.querySelector('#in-costo');
  const inMargen = wrap.querySelector('#in-margen');

  wrap.addEventListener('input', alCambiar);
  for (const b of wrap.querySelectorAll('.preset')) {
    b.addEventListener('click', () => {
      inMargen.value = b.dataset.v;
      marcarPreset();
      alCambiar();
    });
  }
  function marcarPreset() {
    for (const b of wrap.querySelectorAll('.preset')) {
      b.setAttribute('aria-pressed', String(b.dataset.v === String(inMargen.value).trim()));
    }
  }
  inMargen.addEventListener('input', marcarPreset);
  marcarPreset();

  return {
    leerForm: () => ({ costoUnitario: inCosto.value, margenObjetivo: inMargen.value }),
    enfocar: (destino) => {
      const el = destino === 'margen' ? inMargen : inCosto;
      el.focus();
      el.select?.();
    },
  };
}
```

- [ ] **Step 2: Sanity check**

Run: `node --check ui/formulario.js`
Expected: no output (valid syntax).

- [ ] **Step 3: Commit**

```bash
git add ui/formulario.js
git commit -m "feat(ui-v2): vista básica reduced to cost + target-margin inputs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: `ui/render.js` — the hero card (persistent `aria-live` price) + secondary accordions

**Files:**
- Modify: `ui/render.js`
- Test: none (DOM module; `node --check` + purity guard + Task 12 manual pass).

**Interfaces:**
- Consumes: `hero` (from `recomendacionToVista`) and `vista` (from `resultadoToVista`).
- Produces:
  - `montarResultado() => void` — one-time build of the persistent skeleton into `#bloque-hero` / `#bloque-secundario` (found by id, no args), including the `#precio-recomendado` node with `aria-live="polite"` that later updates keep in place.
  - `pintarHero(hero)` — updates the hero card. Updates `#precio-recomendado`'s `textContent` in place; re-renders chips / margin line / utility line / warning strip / "¿por qué?" / confidence / CTA around it. When `hero.muestraPrecio === false`, hides the price node (`hidden = true`) and shows `hero.titulo` + CTA instead — never writes "$0".
  - `pintarSecundario(vista)` — fills the accordions: *De dónde sale el precio* (the existing stacked bar, re-labelled), *Combos*, *Tus límites (equilibrio)*, *Proyección*.
  - `alPulsarCta(cb)` — registers `cb(destino, clave)` for the hero CTA (`destino ∈ 'perfil' | 'costo' | 'margen'`; `clave` is set only for `no_calculable`, e.g. `'fleteIda'`, so `ui/app.js` can open the profile focused on that row); `ui/app.js` wires it.
  - `alCambiarComboDesglose(cb)` — kept from V1.
- Drops: `pintarVeredicto`, `alEditarPrecioCombo`.

- [ ] **Step 1: Replace the full contents of `ui/render.js`**

```js
// ui/render.js
/** vista/hero -> DOM. Sin aritmética: todo llega listo desde el adapter. */

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let cbCta = null;
export function alPulsarCta(cb) { cbCta = cb; }
let cbComboDesglose = null;
export function alCambiarComboDesglose(cb) { cbComboDesglose = cb; }
let avisosAbiertos = false;

/** Construye una sola vez el esqueleto persistente (el nodo del precio no se recrea nunca). */
export function montarResultado() {
  $('bloque-hero').innerHTML = `
    <article class="hero" data-acento="neutro">
      <div class="hero-chips" aria-hidden="false"></div>
      <p class="hero-label">PRECIO RECOMENDADO</p>
      <p id="precio-recomendado" class="hero-precio" aria-live="polite">—</p>
      <p class="hero-titulo" hidden></p>
      <p class="hero-margen"></p>
      <p class="hero-utilidad"></p>
      <div class="hero-warn" hidden></div>
      <p class="hero-confianza"></p>
      <button type="button" class="hero-cta" hidden></button>
    </article>
    <section class="por-que">
      <h3>¿Por qué este precio?</h3>
      <p class="por-que-txt"></p>
      <button type="button" class="ver-desglose" aria-expanded="false" aria-controls="acc-desglose">Ver el desglose completo →</button>
    </section>`;

  $('bloque-secundario').innerHTML = `
    <details class="acc" id="acc-piso"><summary>Precio mínimo operativo</summary><div class="acc-cuerpo"></div></details>
    <details class="acc" id="acc-desglose"><summary>De dónde sale el precio</summary><div class="acc-cuerpo"></div></details>
    <details class="acc" id="acc-combos"><summary>Combos por cantidad</summary><div class="acc-cuerpo"></div></details>
    <details class="acc" id="acc-equilibrio"><summary>Tus límites (punto de equilibrio)</summary><div class="acc-cuerpo"></div></details>
    <details class="acc" id="acc-proyeccion"><summary>Proyección con este presupuesto</summary><div class="acc-cuerpo"></div></details>`;

  $('bloque-hero').querySelector('.hero-cta').addEventListener('click', () => {
    const btn = $('bloque-hero').querySelector('.hero-cta');
    if (cbCta && btn.dataset.destino) cbCta(btn.dataset.destino, btn.dataset.clave || null);
  });
  const verDesglose = $('bloque-hero').querySelector('.ver-desglose');
  verDesglose.addEventListener('click', () => {
    const acc = $('acc-desglose');
    acc.open = true;
    verDesglose.setAttribute('aria-expanded', 'true');
    acc.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

export function pintarHero(h) {
  const hero = $('bloque-hero').querySelector('.hero');
  hero.dataset.acento = h.acento;

  const precioNodo = $('precio-recomendado');
  const titulo = hero.querySelector('.hero-titulo');
  const label = hero.querySelector('.hero-label');
  if (h.muestraPrecio) {
    precioNodo.hidden = false;
    precioNodo.textContent = h.precio;   // <- se actualiza en el sitio, no se recrea
    label.hidden = false;
    titulo.hidden = true;
  } else {
    precioNodo.hidden = true;
    label.hidden = true;
    titulo.hidden = false;
    titulo.textContent = h.titulo;
  }

  hero.querySelector('.hero-chips').innerHTML = h.chips
    .map((c) => `<span class="chip chip-${c.tono}">${esc(c.texto)}</span>`).join('');
  hero.querySelector('.hero-margen').textContent = h.lineaMargen;
  hero.querySelector('.hero-utilidad').textContent = h.lineaUtilidad;

  const warn = hero.querySelector('.hero-warn');
  warn.hidden = !h.advertencia;
  warn.textContent = h.advertencia || '';

  hero.querySelector('.hero-confianza').textContent = h.confianza;

  const cta = hero.querySelector('.hero-cta');
  if (h.cta) {
    cta.hidden = false;
    cta.textContent = h.cta.texto;
    cta.dataset.destino = h.cta.destino;
    if (h.cta.clave) cta.dataset.clave = h.cta.clave; else delete cta.dataset.clave;
  } else {
    cta.hidden = true;
  }

  $('bloque-hero').querySelector('.por-que-txt').textContent = h.porQue;

  const pisoCuerpo = $('acc-piso').querySelector('.acc-cuerpo');
  pisoCuerpo.innerHTML = h.precioMinimoOperativo
    ? `<p class="nota"><strong>${esc(h.precioMinimoOperativo)}</strong> — cubre logística y el colchón de devoluciones, sin utilidad ni publicidad. Es tu piso: nunca ofrezcas un descuento por debajo de esta línea.</p>`
    : `<p class="nota">Necesita el costo del proveedor y el flete de ida para calcularse.</p>`;
}

function pintarDesglose(v) {
  const d = v.desglose;
  $('acc-desglose').querySelector('.acc-cuerpo').innerHTML = `
    <label class="combo-sel-wrap">combo:
      <select class="combo-sel" aria-label="Combo del desglose">
        ${[1, 2, 3].map((n) => `<option value="${n}"${n === d.comboN ? ' selected' : ''}>${n}u</option>`).join('')}
      </select>
    </label>
    <div class="mono">${esc(d.precio)} =</div>
    <div class="barra${d.clase ? ' ' + d.clase : ''}">${d.partes.map((p) => `<span class="${p.clase}" style="width:${p.anchoPct}%" title="${esc(p.label)} ${esc(p.monto)}"></span>`).join('')}</div>
    <div class="leyenda">${d.partes.map((p) => `<span><span class="dot ${p.clase}"></span>${esc(p.label)} <span class="mono">${esc(p.monto)}</span></span>`).join('')}</div>
    <p class="nota" style="margin-top:12px">— aparte — CAC <span class="mono">${esc(d.cac)}</span>. ${esc(d.notaCac)}</p>`;
  const sel = $('acc-desglose').querySelector('.combo-sel');
  if (sel) sel.addEventListener('change', () => cbComboDesglose && cbComboDesglose(Number(sel.value)));
}

function pintarCombos(v) {
  $('acc-combos').querySelector('.acc-cuerpo').innerHTML = `
    <table class="tabla-combos">
      <thead><tr><th>Unidades</th><th class="num">Precio</th><th class="num">Precio / unidad</th><th class="num">Margen</th></tr></thead>
      <tbody>${v.combos.map((c) => `
        <tr${c.esMejor ? ' class="mejor"' : ''}>
          <td>${c.n}${c.esMejor ? ' <span class="mini-badge">mejor</span>' : ''}</td>
          <td class="num">${esc(c.precio)}</td>
          <td class="num">${esc(c.precioUnidad ?? '—')}</td>
          <td class="num">${esc(c.margenNeto)}</td>
        </tr>`).join('')}</tbody>
    </table>`;
}

function pintarEquilibrio(v) {
  $('acc-equilibrio').querySelector('.acc-cuerpo').innerHTML = `
    <div class="card">${v.equilibrio.map((f) => `
      <div class="eq-fila ${f.clase} ${f.alcanzable ? '' : 'no-alcanzable'}">
        <span>${esc(f.label)}</span>
        <span class="lim">${esc(f.limite)}</span>
        <span class="act">${esc(f.actualLabel)} ${esc(f.actual)}</span>
        <span class="eq-holgura"><span style="width:${f.holguraPct}%"></span></span>
      </div>`).join('')}</div>`;
}

function pintarProyeccion(v) {
  const p = v.proyeccion;
  $('acc-proyeccion').querySelector('.acc-cuerpo').innerHTML = `
    <div class="card proy">
      <div><div class="k">Pedidos/día</div><div class="v">${esc(p.pedidosDia)}</div></div>
      <div><div class="k">Ventas entregadas/día</div><div class="v">${esc(p.ventasEntregadasDia)}</div></div>
      <div><div class="k">Utilidad/día</div><div class="v">${esc(p.utilidadDia)}</div></div>
      <div><div class="k">Utilidad/mes</div><div class="v">${esc(p.utilidadMes)}</div></div>
      <p class="nota">${esc(p.nota)}</p>
    </div>`;
}

export function pintarSecundario(vista) {
  pintarDesglose(vista);
  pintarCombos(vista);
  pintarEquilibrio(vista);
  pintarProyeccion(vista);
}
```

> **Adapter follow-up for `precioUnidad`:** `vistaCombos` in `ui/adapter.js` must add a `precioUnidad` field (`pesos(c.ingreso / c.n)` — this is a *display* division of one already-computed number, the same category as `pesosCompacto`; acceptable in the adapter as presentation, not business logic). Add `precioUnidad: pesos(c.ingreso / c.n)` to the object `vistaCombos` returns, in this task.

- [ ] **Step 2: Sanity check**

Run: `node --check ui/render.js`
Expected: no output.

- [ ] **Step 3: Add `precioUnidad` to `vistaCombos` in `ui/adapter.js`** (one line, described in the note above), then:

Run: `node --test test/adapter-resultado-a-vista.test.js`
Expected: PASS (still — the new field is additive).

- [ ] **Step 4: Commit**

```bash
git add ui/render.js ui/adapter.js
git commit -m "feat(ui-v2): hero card with a persistent aria-live price node + secondary accordions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: `ui/perfil-pantalla.js` — the Perfil económico screen (DOM)

**Files:**
- Create: `ui/perfil-pantalla.js`
- Test: none (DOM; `node --check` + purity guard + Task 12).

**Interfaces:**
- Consumes: `perfilToVista` from `./adapter.js` (Task 2); `PERFIL_DEFECTO` from `./perfil.js` (for grouping metadata only).
- Produces: `montarPerfilPantalla(contenedor, { alCambiarCampo, alGuardar, alRestablecer, alCerrar }) => { pintar, abrir, cerrar, enfocarClave }`.
  - `pintar(perfilVista)` fills the grouped rows + confidence bar + priority list.
  - `abrir()` / `cerrar()` toggle the slide-over / full-screen panel (`hidden` + a class; focus trap not required for V2 but move focus into the panel on open and back to the trigger on close).
  - `enfocarClave(clave)` scrolls to + focuses that row's input (used by the hero `no_calculable` CTA).
  - `alCambiarCampo(clave, { valor, estado })` fires on every input/estado change; `alGuardar()` / `alRestablecer()` on the buttons; `alCerrar()` on the close control.

- [ ] **Step 1: Write `ui/perfil-pantalla.js`**

```js
// ui/perfil-pantalla.js
/** Pantalla "Perfil económico": filas agrupadas, barra de confianza, prioridades. Sin fórmulas. */

const GRUPOS = [
  { titulo: 'Logística', claves: ['fleteIda', 'fleteDevolucion', 'feeDevolucion', 'pctProductoPerdidoEnDevolucion', 'empaquePorPedido'] },
  { titulo: 'Mercado', claves: ['tasaEntrega', 'tasaCierre'] },
  { titulo: 'Adquisición', claves: ['costoConversacion', 'costoAtencionConversacion'] },
  { titulo: 'Pasarela COD', claves: ['comisionRecaudoPct', 'comisionRecaudoFijo'] },
  { titulo: 'Overhead — no cambia el precio, solo tu panel de rentabilidad', claves: ['costosFijosMes', 'diasOperacionMes'] },
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ES_PCT = new Set(['tasaEntrega', 'tasaCierre', 'pctProductoPerdidoEnDevolucion', 'comisionRecaudoPct']);

export function montarPerfilPantalla(contenedor, { alCambiarCampo, alGuardar, alRestablecer, alCerrar }) {
  contenedor.classList.add('perfil-pantalla');
  contenedor.hidden = true;
  let disparador = null;

  contenedor.innerHTML = `
    <div class="perfil-caja" role="dialog" aria-modal="true" aria-labelledby="perfil-h">
      <header class="perfil-head">
        <h2 id="perfil-h">Perfil económico</h2>
        <button type="button" class="perfil-cerrar" aria-label="Cerrar">✕</button>
      </header>
      <p class="perfil-intro">Cada dato real que agregues acerca tu precio a un número garantizado. Nada de esto bloquea tu operación — solo te dice, en cada venta, qué tan firme es el número que estás usando.</p>
      <div class="perfil-confianza"></div>
      <section class="perfil-prioridades"></section>
      <div class="perfil-grupos"></div>
      <footer class="perfil-acciones">
        <button type="button" class="btn btn-sec perfil-restablecer">Restablecer supuestos JDSMPlus</button>
        <button type="button" class="btn btn-pri perfil-guardar">Guardar perfil</button>
      </footer>
    </div>`;

  const q = (s) => contenedor.querySelector(s);
  q('.perfil-cerrar').addEventListener('click', () => { cerrar(); alCerrar?.(); });
  q('.perfil-guardar').addEventListener('click', () => alGuardar?.());
  q('.perfil-restablecer').addEventListener('click', () => alRestablecer?.());
  contenedor.addEventListener('keydown', (e) => { if (e.key === 'Escape') { cerrar(); alCerrar?.(); } });

  function filaHtml(f) {
    const inputAttrs = ES_PCT.has(f.clave) ? 'inputmode="decimal"' : 'inputmode="decimal"';
    return `
      <div class="perfil-fila" data-clave="${f.clave}">
        <div class="perfil-fila-lbl">
          <span>${esc(f.titulo)}</span>
          <button type="button" class="perfil-info" aria-label="Qué es ${esc(f.titulo)}" data-ayuda="${esc(f.ayuda)}">ⓘ</button>
        </div>
        <span class="caja ${ES_PCT.has(f.clave) ? 'porcentaje' : 'moneda'}">
          <input type="text" ${inputAttrs} value="${f.estado === 'FALTANTE' ? '' : esc(f.valorTexto.replace(/[^\d.,]/g, ''))}"
            placeholder="${f.estado === 'FALTANTE' ? '— sin dato —' : ''}" aria-label="${esc(f.titulo)}">
        </span>
        <span class="perfil-estado" role="group" aria-label="Estado del dato">
          <button type="button" class="badge badge-real" data-estado="REAL" aria-pressed="${f.estado === 'REAL'}">● real</button>
          <button type="button" class="badge badge-supuesto" data-estado="SUPUESTO" aria-pressed="${f.estado === 'SUPUESTO'}">~ supuesto</button>
          <span class="badge badge-faltante" ${f.estado === 'FALTANTE' ? '' : 'hidden'}>! falta</span>
        </span>
      </div>`;
  }

  function pintar(v) {
    q('.perfil-confianza').innerHTML = `
      <div class="conf-num">${v.confianza.real}% real</div>
      <div class="conf-barra" role="img" aria-label="${v.confianza.real} reales, ${v.confianza.supuesto} supuestos, ${v.confianza.falta} faltantes de ${v.confianza.real + v.confianza.supuesto + v.confianza.falta}">
        <i class="c-real" style="flex:${v.confianza.real}"></i>
        <i class="c-sup" style="flex:${v.confianza.supuesto}"></i>
        <i class="c-fal" style="flex:${v.confianza.falta}"></i>
      </div>
      <div class="conf-leyenda">${v.confianza.real} real · ${v.confianza.supuesto} supuesto · ${v.confianza.falta} falta · 1 config (margen objetivo)</div>`;

    q('.perfil-prioridades').innerHTML = v.prioridades.length ? `
      <h3>Esto es lo que más cambiaría tu precio</h3>
      <ul>${v.prioridades.map((p) => `
        <li data-clave="${p.clave}">
          <span class="badge badge-faltante">! falta</span>
          <span class="pr-lbl">${esc(p.titulo)}</span>
          <span class="pr-impacto ${p.impacto === 'precio' ? 'imp-alto' : 'imp-bajo'}">${p.impacto === 'precio' ? 'cambia tu precio' : 'no cambia el precio'}</span>
        </li>`).join('')}</ul>` : '';

    q('.perfil-grupos').innerHTML = GRUPOS.map((g) => `
      <section class="perfil-grupo">
        <h4>${esc(g.titulo)}</h4>
        ${g.claves.map((k) => filaHtml(v.filas.find((f) => f.clave === k))).join('')}
      </section>`).join('');

    for (const li of contenedor.querySelectorAll('.perfil-prioridades li')) {
      li.addEventListener('click', () => enfocarClave(li.dataset.clave));
    }
    for (const fila of contenedor.querySelectorAll('.perfil-fila')) {
      const clave = fila.dataset.clave;
      const input = fila.querySelector('input');
      const botones = fila.querySelectorAll('.perfil-estado button');
      const emitir = () => {
        const txt = input.value.trim();
        const valorNum = txt === '' ? null : Number(txt.replace(',', '.'));
        const estado = txt === '' ? 'FALTANTE'
          : (fila.querySelector('.perfil-estado button[aria-pressed="true"]')?.dataset.estado ?? 'SUPUESTO');
        const valor = valorNum == null || !Number.isFinite(valorNum) ? null
          : (ES_PCT.has(clave) ? valorNum / 100 : valorNum);
        alCambiarCampo?.(clave, { valor, estado });
      };
      input.addEventListener('input', () => {
        if (input.value.trim() !== '' && !fila.querySelector('.perfil-estado button[aria-pressed="true"]')) {
          botones[1].setAttribute('aria-pressed', 'true'); // por defecto: supuesto
        }
        emitir();
      });
      for (const b of botones) {
        b.addEventListener('click', () => {
          for (const x of botones) x.setAttribute('aria-pressed', String(x === b));
          emitir();
        });
      }
    }
    for (const b of contenedor.querySelectorAll('.perfil-info')) {
      b.addEventListener('click', () => alert(b.dataset.ayuda)); // V2: tooltip simple; suficiente y accesible por teclado
    }
  }

  function abrir(desde) {
    disparador = desde ?? null;
    contenedor.hidden = false;
    contenedor.querySelector('.perfil-cerrar').focus();
  }
  function cerrar() {
    contenedor.hidden = true;
    disparador?.focus?.();
  }
  function enfocarClave(clave) {
    const fila = contenedor.querySelector(`.perfil-fila[data-clave="${clave}"]`);
    if (!fila) return;
    fila.scrollIntoView({ behavior: 'smooth', block: 'center' });
    fila.querySelector('input')?.focus();
  }

  return { pintar, abrir, cerrar, enfocarClave };
}
```

- [ ] **Step 2: Sanity check**

Run: `node --check ui/perfil-pantalla.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add ui/perfil-pantalla.js
git commit -m "feat(ui-v2): Perfil económico screen — grouped rows, confidence bar, priority list

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: `ui/estilos.css` — JDSMPlus palette, hero, chips, perfil screen, responsive reorg

**Files:**
- Modify: `ui/estilos.css` (full replace)
- Test: none (CSS; verified in Task 12's browser pass).

**Interfaces:** none (styles only). Selectors used by `ui/graficos.js` (`--acento`, `--ok`, `--mal`, `--borde`, `--tinta-suave`, `--tinta`) are re-defined in the new palette, so `ui/graficos.js` needs no code change.

- [ ] **Step 1: Replace the full contents of `ui/estilos.css`**

```css
:root{
  --fondo:#FAF5F0; --superficie:#FFFFFF; --superficie-2:#F1EAE0;
  --borde:#E3D8C8; --borde-suave:#ECE3D6;
  --tinta:#26302A; --tinta-suave:#5C6459; --tinta-tenue:#8A9086;
  --acento:#3D5340; --acento-suave:#E7EDE4; --acento-2:#C3CCA6;

  --real:#3D5340; --real-bg:#E7EDE4;
  --supuesto:#A6712A; --supuesto-bg:#F5E8D3;
  --falta:#AE4736; --falta-bg:#F7E1DA;
  --config:#54608A; --config-bg:#E6E7F2;

  --ok:var(--acento); --ok-bg:var(--acento-suave);
  --warn:var(--supuesto); --warn-bg:var(--supuesto-bg);
  --mal:var(--falta); --mal-bg:var(--falta-bg);

  --r-card:16px; --r-input:10px;
  --sombra:0 1px 2px rgba(38,48,42,.04), 0 8px 24px -12px rgba(38,48,42,.18);
  --sans:'Work Sans', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  --display:'Fraunces', Georgia, 'Times New Roman', serif;
  --mono:'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --part-1:#CBD3B7; --part-2:#B4BE97; --part-3:#9CAA79; --part-4:#7E9060; --part-5:#5E7147; --part-6:var(--acento);
}
*{box-sizing:border-box}
body{margin:0;background:var(--fondo);color:var(--tinta);font-family:var(--sans);font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased}
h1,h2,h3,h4{font-family:var(--display);margin:0;text-wrap:balance}
.num,.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
:focus-visible{outline:2px solid var(--acento);outline-offset:2px;border-radius:4px}

.app{max-width:860px;margin:0 auto;padding:32px 20px 80px}
.topbar{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:8px}
.topbar h1{font-size:22px;font-weight:600}
.topbar .sub{color:var(--tinta-tenue);font-size:12px;font-family:var(--mono)}
.btn-perfil{font:inherit;font-weight:600;font-size:13px;border:1px solid var(--borde);background:var(--superficie);color:var(--tinta);border-radius:999px;padding:8px 16px;cursor:pointer}

/* entrada básica */
.entrada-basica{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:20px 0 8px}
.campo-basico{display:flex;flex-direction:column;gap:6px}
.campo-basico .lbl{font-size:13px;font-weight:600;color:var(--tinta-suave)}
.campo-basico .caja{position:relative}
.campo-basico input{width:100%;height:48px;border:1px solid var(--borde);border-radius:var(--r-input);
  padding:0 14px;font-family:var(--display);font-size:20px;font-variant-numeric:tabular-nums;background:var(--superficie);color:var(--tinta)}
.campo-basico.moneda input{padding-left:26px}
.campo-basico.moneda .caja::before{content:'$';position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--tinta-tenue)}
.campo-basico.porcentaje .caja::after{content:'%';position:absolute;right:12px;top:50%;transform:translateY(-50%);color:var(--tinta-tenue)}
.presets{display:flex;gap:6px;flex-wrap:wrap}
.preset{font:inherit;font-size:12px;border:1px solid var(--borde);background:var(--superficie);color:var(--tinta-suave);border-radius:999px;padding:5px 11px;cursor:pointer}
.preset[aria-pressed=true]{background:var(--acento);color:var(--fondo);border-color:var(--acento);font-weight:600}
.ayuda{font-size:12px;color:var(--tinta-tenue)}

/* hero */
#bloque-hero{margin-top:16px}
.hero{background:var(--superficie);border:1px solid var(--borde);border-radius:var(--r-card);box-shadow:var(--sombra);padding:28px 30px 24px;border-top:4px solid var(--borde)}
.hero[data-acento=verde]{border-top-color:var(--acento)}
.hero[data-acento=ambar]{border-top-color:var(--supuesto)}
.hero[data-acento=rojo]{border-top-color:var(--falta)}
.hero-chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;min-height:26px}
.chip{font-family:var(--mono);font-size:12px;font-weight:700;letter-spacing:.04em;padding:5px 12px;border-radius:999px}
.chip-verde{background:var(--acento);color:var(--fondo)}
.chip-ambar{background:var(--supuesto);color:var(--fondo)}
.chip-rojo{background:var(--falta);color:var(--fondo)}
.hero-label{font-family:var(--mono);font-size:11px;letter-spacing:.1em;color:var(--tinta-tenue);margin:0}
.hero-precio{font-family:var(--display);font-weight:600;font-size:clamp(48px,10vw,80px);line-height:1;font-variant-numeric:tabular-nums;margin:8px 0 0}
.hero-titulo{font-family:var(--display);font-size:24px;font-weight:600;margin:4px 0 0}
.hero-margen{margin-top:14px;font-size:16px;color:var(--tinta-suave);font-variant-numeric:tabular-nums}
.hero-utilidad{margin-top:4px;font-size:14px;color:var(--tinta-tenue);font-variant-numeric:tabular-nums}
.hero-warn{margin-top:18px;background:var(--falta-bg);border:1px solid var(--falta);border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.5;color:var(--tinta)}
.hero-confianza{margin-top:16px;padding-top:14px;border-top:1px solid var(--borde-suave);font-family:var(--mono);font-size:12px;color:var(--tinta-tenue);line-height:1.6}
.hero-cta{margin-top:16px;font:inherit;font-weight:600;font-size:14px;background:var(--acento);color:var(--fondo);border:0;border-radius:10px;padding:11px 20px;cursor:pointer}
.hero[data-acento=rojo] .hero-cta{background:var(--falta)}
.hero[data-acento=neutro] .hero-cta{background:var(--tinta)}

.por-que{margin-top:16px;background:var(--superficie-2);border:1px solid var(--borde-suave);border-radius:14px;padding:16px 20px}
.por-que h3{font-family:var(--sans);font-size:14px;font-weight:700}
.por-que-txt{margin-top:8px;font-size:14px;line-height:1.6;color:var(--tinta-suave)}
.ver-desglose{margin-top:10px;font:inherit;font-size:13px;font-weight:600;color:var(--acento);background:none;border:0;padding:0;cursor:pointer;text-decoration:underline;text-underline-offset:2px}

/* acordeones del secundario */
#bloque-secundario{margin-top:20px;display:flex;flex-direction:column;gap:10px}
.acc{background:var(--superficie);border:1px solid var(--borde-suave);border-radius:14px;overflow:hidden}
.acc summary{cursor:pointer;padding:14px 18px;font-size:14px;font-weight:600;list-style:none;display:flex;justify-content:space-between;align-items:center}
.acc summary::-webkit-details-marker{display:none}
.acc summary::after{content:'';width:8px;height:8px;border-right:1.5px solid var(--tinta-tenue);border-bottom:1.5px solid var(--tinta-tenue);transform:rotate(45deg);transition:transform .18s ease}
.acc[open] summary::after{transform:rotate(-135deg)}
.acc[open] summary{border-bottom:1px solid var(--borde-suave)}
.acc-cuerpo{padding:16px 18px}
.nota{font-size:14px;line-height:1.6;color:var(--tinta-suave)}
.nota strong{color:var(--tinta)}

/* desglose (barra apilada, heredada de V1) */
.combo-sel-wrap{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--tinta-suave);margin-bottom:10px}
.combo-sel{height:28px;font:inherit;border:1px solid var(--borde);border-radius:8px;padding:0 6px;background:var(--superficie);color:var(--tinta)}
.barra{display:flex;height:14px;border-radius:6px;overflow:hidden;border:1px solid var(--borde);margin:10px 0}
.barra.barra-perdida{border-color:var(--falta)}
.barra.barra-perdida>span{filter:saturate(.35)}
.barra .part-1{background:var(--part-1)}.barra .part-2{background:var(--part-2)}.barra .part-3{background:var(--part-3)}
.barra .part-4{background:var(--part-4)}.barra .part-5{background:var(--part-5)}.barra .part-6{background:var(--part-6)}
.leyenda{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:4px 14px;font-size:13px}
.leyenda .dot{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px}
.leyenda .part-1{background:var(--part-1)}.leyenda .part-2{background:var(--part-2)}.leyenda .part-3{background:var(--part-3)}
.leyenda .part-4{background:var(--part-4)}.leyenda .part-5{background:var(--part-5)}.leyenda .part-6{background:var(--part-6)}

.tabla-combos{width:100%;border-collapse:collapse;font-size:13.5px}
.tabla-combos th{text-align:left;font-family:var(--mono);font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--tinta-tenue);padding-bottom:8px;border-bottom:1px solid var(--borde-suave)}
.tabla-combos td{padding:10px 0;border-bottom:1px solid var(--borde-suave);font-variant-numeric:tabular-nums}
.tabla-combos tr:last-child td{border-bottom:0}
.tabla-combos td.num,.tabla-combos th.num{text-align:right}
.mini-badge{font-family:var(--mono);font-size:10px;background:var(--acento);color:var(--fondo);padding:1px 6px;border-radius:999px}
.tabla-combos tr.mejor td{font-weight:600}

/* equilibrio + proyección (heredados) */
.card{background:var(--superficie);border:1px solid var(--borde);border-radius:var(--r-card);padding:16px}
.eq-fila{display:grid;grid-template-columns:1fr auto auto;gap:6px 12px;align-items:center;padding:9px 0;border-top:1px solid var(--borde-suave)}
.eq-fila:first-child{border-top:0}
.eq-fila .lim{font-family:var(--mono);font-weight:600}
.eq-fila .act{font-family:var(--mono);color:var(--tinta-suave);font-size:13px}
.eq-fila.eq-malo .lim{color:var(--falta)}.eq-fila.eq-ajustado .lim{color:var(--supuesto)}.eq-fila.eq-ok .lim{color:var(--acento)}
.eq-fila.no-alcanzable{opacity:.55}
.eq-holgura{grid-column:1/-1;height:5px;border-radius:999px;background:var(--borde);overflow:hidden}
.eq-holgura>span{display:block;height:100%;background:var(--acento)}
.eq-fila.eq-malo .eq-holgura>span{background:var(--falta)}.eq-fila.eq-ajustado .eq-holgura>span{background:var(--supuesto)}
.proy{display:grid;grid-template-columns:1fr 1fr;gap:10px 20px}
.proy .k{font-size:12px;color:var(--tinta-suave)}.proy .v{font-family:var(--mono);font-size:20px;font-weight:600}
.proy .nota{grid-column:1/-1}

/* badges de estado (compartidos hero/perfil) — forma + glifo, no solo color */
.badge{display:inline-flex;align-items:center;gap:4px;font-family:var(--mono);font-size:10.5px;font-weight:600;letter-spacing:.03em;padding:3px 9px;line-height:1.5;white-space:nowrap;border-radius:999px;cursor:pointer;background:none}
.badge-real{color:var(--real);border:1px solid var(--real)}
.badge-real[aria-pressed=true]{background:var(--real-bg)}
.badge-supuesto{color:var(--supuesto);border:1px dashed var(--supuesto)}
.badge-supuesto[aria-pressed=true]{background:var(--supuesto-bg)}
.badge-faltante{color:var(--falta);border:1px dotted var(--falta);background:var(--falta-bg);border-radius:999px;cursor:default}

/* escenarios (heredado; re-tematizado por variables) */
.tabs{display:inline-flex;gap:4px;margin-bottom:12px}
.tabs button{border:1px solid var(--borde);background:var(--superficie);border-radius:8px;padding:6px 12px;font:inherit;cursor:pointer}
.tabs button[aria-selected=true]{border-color:var(--acento);color:var(--acento);font-weight:600}
.sens-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px}
.sens-cel h4{font-family:var(--sans);font-size:12px;margin:0 0 4px}
.sens-eje{display:flex;justify-content:space-between}
.estado-esc{font-size:12px;color:var(--tinta-suave)}
.sens-cel svg,.tornado svg,.matriz svg{width:100%;height:auto;display:block}
.sens-cel svg,.tornado svg{aspect-ratio:5/3}
.matriz .cel{stroke:var(--superficie);stroke-width:1}
.mx-n2{fill:#B14B3B}.mx-n1{fill:#E0A99A}.mx-0{fill:#EDE6DA}.mx-p1{fill:#AEC59A}.mx-p2{fill:var(--acento)}
.mx-sin-dato{fill:var(--borde)}
.matriz .actual{stroke:var(--tinta);stroke-width:2}

/* pantalla de perfil (slide-over / full en móvil) */
.perfil-pantalla{position:fixed;inset:0;background:rgba(38,48,42,.35);display:flex;justify-content:flex-end;z-index:50}
.perfil-caja{background:var(--fondo);width:min(560px,100%);max-height:100vh;overflow-y:auto;padding:24px 26px 40px}
.perfil-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.perfil-head h2{font-size:21px;font-weight:600}
.perfil-cerrar{font:inherit;font-size:16px;background:none;border:0;color:var(--tinta-suave);cursor:pointer;padding:6px}
.perfil-intro{font-size:14px;color:var(--tinta-suave);line-height:1.55;margin-bottom:16px}
.perfil-confianza{background:var(--superficie);border:1px solid var(--borde);border-radius:14px;padding:16px 18px}
.conf-num{font-family:var(--display);font-size:20px;font-weight:600}
.conf-barra{display:flex;height:10px;border-radius:999px;overflow:hidden;background:var(--superficie-2);margin:10px 0}
.conf-barra i{display:block}
.conf-barra .c-real{background:var(--real)}.conf-barra .c-sup{background:var(--supuesto)}.conf-barra .c-fal{background:var(--falta)}
.conf-leyenda{font-family:var(--mono);font-size:11.5px;color:var(--tinta-suave)}
.perfil-prioridades{margin-top:18px}
.perfil-prioridades h3{font-family:var(--sans);font-size:14px;font-weight:700;margin-bottom:8px}
.perfil-prioridades ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.perfil-prioridades li{display:flex;align-items:center;gap:10px;background:var(--superficie);border:1px solid var(--borde-suave);border-radius:12px;padding:11px 14px;cursor:pointer}
.pr-lbl{flex:1;font-size:14px}
.pr-impacto{font-family:var(--mono);font-size:10px;padding:2px 8px;border-radius:999px}
.imp-alto{background:var(--falta-bg);color:var(--falta)}
.imp-bajo{background:var(--supuesto-bg);color:var(--supuesto)}
.perfil-grupo{margin-top:16px;background:var(--superficie);border:1px solid var(--borde-suave);border-radius:14px;padding:14px 16px}
.perfil-grupo h4{font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--tinta-tenue);margin-bottom:8px}
.perfil-fila{display:grid;grid-template-columns:1fr 120px auto;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--borde-suave)}
.perfil-fila:first-of-type{border-top:0}
.perfil-fila-lbl{display:flex;align-items:center;gap:6px;font-size:14px}
.perfil-info{width:18px;height:18px;border-radius:50%;border:1px solid var(--tinta-tenue);color:var(--tinta-tenue);background:none;font-size:10px;cursor:pointer;line-height:1}
.perfil-fila .caja{position:relative}
.perfil-fila input{width:100%;height:38px;border:1px solid var(--borde);border-radius:8px;padding:0 12px;font:inherit;font-family:var(--mono);background:var(--superficie);color:var(--tinta)}
.perfil-fila .caja.moneda input{padding-left:22px}
.perfil-fila .caja.moneda::before{content:'$';position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--tinta-tenue);font-size:12px}
.perfil-fila .caja.porcentaje::after{content:'%';position:absolute;right:10px;top:50%;transform:translateY(-50%);color:var(--tinta-tenue);font-size:12px}
.perfil-estado{display:flex;gap:4px;flex-wrap:wrap}
.perfil-acciones{display:flex;gap:12px;margin-top:22px;flex-wrap:wrap}
.btn{font:inherit;font-weight:600;font-size:14px;padding:11px 18px;border-radius:10px;cursor:pointer;border:1px solid var(--borde)}
.btn-pri{background:var(--acento);color:var(--fondo);border-color:var(--acento)}
.btn-sec{background:none;color:var(--tinta)}

/* responsive: móvil reorganiza — precio + confianza primero (§B.10) */
@media (max-width:768px){
  .entrada-basica{grid-template-columns:1fr}
  .app{display:flex;flex-direction:column}
  .topbar{order:1}
  #bloque-hero{order:2}
  .entrada-basica{order:3}
  #bloque-secundario{order:4}
  .por-que{order:2}
  .hero{padding:22px 18px}
  .perfil-pantalla{justify-content:stretch}
  .perfil-caja{width:100%}
  .perfil-fila{grid-template-columns:1fr;gap:6px}
  /* §B.11: objetivos táctiles >= 44px en móvil */
  .preset,.hero-cta,.btn,.btn-perfil,.acc summary,.perfil-info,
  .perfil-estado .badge,.perfil-cerrar,.ver-desglose{min-height:44px}
  .preset,.perfil-info,.perfil-estado .badge{display:inline-flex;align-items:center;justify-content:center}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
```

> **Note on the mobile reorder:** the `order:` values above put the hero + "¿por qué?" above the inputs on narrow screens per §B.10 ("el precio recomendado y su estado de confianza son lo primero que se ve; los inputs quedan inmediatamente accesibles debajo"). `index.html` (Task 9) must put `#bloque-hero` / `.por-que` / `.entrada-basica` / `#bloque-secundario` as **direct children of `.app`** for `order:` to apply — do not nest them in wrapper divs.

- [ ] **Step 2: Commit**

```bash
git add ui/estilos.css
git commit -m "feat(ui-v2): JDSMPlus palette, hero card, state badges, perfil screen, mobile reorder

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: `index.html` — the new shell

**Files:**
- Modify: `index.html` (full replace)
- Test: none (Task 12 browser pass).

- [ ] **Step 1: Replace the full contents of `index.html`**

```html
<!doctype html>
<html lang="es-CO">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Precio con confianza · contraentrega</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..700&family=Work+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
  <link rel="stylesheet" href="ui/estilos.css">
</head>
<body>
  <main class="app">
    <div class="topbar">
      <h1>Precio con confianza</h1>
      <button type="button" id="btn-perfil" class="btn-perfil">Perfil económico</button>
    </div>

    <div id="entrada-basica"></div>

    <section id="bloque-hero"></section>

    <section id="bloque-secundario"></section>

    <section id="bloque-escenarios" class="acc-escenarios"></section>
  </main>

  <div id="perfil-pantalla"></div>

  <script type="module" src="ui/app.js"></script>
</body>
</html>
```

> `#entrada-basica` is a placeholder `montarEntradaBasica` fills; CSS targets `.entrada-basica` (the div that module creates inside it). The mobile `order:` in Task 8 targets `.entrada-basica` / `#bloque-hero` / `.por-que` / `#bloque-secundario` — keep them all direct children of `.app` (the `.por-que` block is created by `render.js` inside `#bloque-hero`'s section, which is fine: on mobile it inherits `#bloque-hero`'s order slot and the explicit `.por-que{order:2}` keeps it adjacent).

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat(ui-v2): new shell — topbar, básica, hero, secundario, perfil mount point

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: `ui/app.js` — wiring

**Files:**
- Modify: `ui/app.js` (full replace)
- Test: none (Task 12 browser pass).

**Interfaces:**
- Consumes: `montarEntradaBasica` (`./formulario.js`), `analizarDesdeFormulario` / `escenariosDesdeFormulario` / `perfilToVista` (`./adapter.js`), `montarResultado` / `pintarHero` / `pintarSecundario` / `alPulsarCta` / `alCambiarComboDesglose` (`./render.js`), `montarPerfilPantalla` (`./perfil-pantalla.js`), `montarEscenarios` (`./graficos.js`), `cargarPerfil` / `guardarPerfil` / `restablecerPerfil` (`./perfil.js`).
- Produces: nothing exported — this is the entry point.

- [ ] **Step 1: Replace the full contents of `ui/app.js`**

```js
// ui/app.js — punto de entrada. Solo importa lógica vía ./adapter.js y ./perfil.js.
import { montarEntradaBasica } from './formulario.js';
import { analizarDesdeFormulario, escenariosDesdeFormulario, perfilToVista } from './adapter.js';
import { montarResultado, pintarHero, pintarSecundario, alPulsarCta, alCambiarComboDesglose } from './render.js';
import { montarPerfilPantalla } from './perfil-pantalla.js';
import { montarEscenarios } from './graficos.js';
import { cargarPerfil, guardarPerfil, restablecerPerfil } from './perfil.js';

const $ = (id) => document.getElementById(id);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

let perfil = cargarPerfil();
let comboDesglose = 1;

montarResultado();
const entrada = montarEntradaBasica($('entrada-basica'), { alCambiar: () => recalcularDebounced() });

const escenarios = montarEscenarios($('bloque-escenarios'));
let escVisible = false;
let escSucio = true;

const perfilPantalla = montarPerfilPantalla($('perfil-pantalla'), {
  alCambiarCampo: (clave, campo) => {
    perfil = { ...perfil, [clave]: campo };
    perfilPantalla.pintar(perfilToVista(perfil));
    recalcularDebounced();
  },
  alGuardar: () => { guardarPerfil(perfil); perfilPantalla.cerrar(); },
  alRestablecer: () => { perfil = restablecerPerfil(); perfilPantalla.pintar(perfilToVista(perfil)); recalcular(); },
  alCerrar: () => {},
});
perfilPantalla.pintar(perfilToVista(perfil));

$('btn-perfil').addEventListener('click', () => perfilPantalla.abrir($('btn-perfil')));

alPulsarCta((destino, clave) => {
  if (destino === 'perfil') {
    perfilPantalla.abrir($('btn-perfil'));
    if (clave) perfilPantalla.enfocarClave(clave);
  } else {
    entrada.enfocar(destino);
  }
});
alCambiarComboDesglose((n) => { comboDesglose = n; recalcular(); });

function recalcular() {
  const form = entrada.leerForm();
  const { vista, hero } = analizarDesdeFormulario(form, perfil, comboDesglose);
  pintarHero(hero);
  pintarSecundario(vista);
  escSucio = true;
  if (escVisible) recalcularEscenariosDebounced();
}
function recalcularEscenarios() {
  escenarios.pintar(escenariosDesdeFormulario(entrada.leerForm(), perfil));
  escSucio = false;
}
const recalcularDebounced = debounce(recalcular, 120);
const recalcularEscenariosDebounced = debounce(recalcularEscenarios, 250);

new IntersectionObserver((entradas) => {
  escVisible = entradas.at(-1).isIntersecting;
  if (escVisible && escSucio) recalcularEscenarios();
}, { threshold: 0.15 }).observe($('bloque-escenarios'));

recalcular();
```

- [ ] **Step 2: Sanity check**

Run: `node --check ui/app.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add ui/app.js
git commit -m "feat(ui-v2): wire básica + hero + secundario + perfil screen + deferred scenarios

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: `test/ui-separada.test.js` — purity guards for the new files

**Files:**
- Modify: `test/ui-separada.test.js`

**Interfaces:** none — extends the static-analysis guards.

- [ ] **Step 1: Update `test/ui-separada.test.js`**

Keep the first test (`src/**` clean) unchanged. Replace the other three tests with:

```js
test('ui/adapter.js y ui/formato.js son puros (sin DOM/red/almacenamiento)', () => {
  for (const f of ['ui/adapter.js', 'ui/formato.js']) {
    const txt = leer(f);
    for (const prohibido of ['document', 'window', 'localStorage', 'fetch(']) {
      assert.ok(!txt.includes(prohibido), `${f} menciona "${prohibido}"`);
    }
  }
});

test('ui/perfil.js: puede usar localStorage, pero nada de DOM/red ni imports de ../src/', () => {
  const txt = leer('ui/perfil.js');
  for (const prohibido of ['document', 'window', 'fetch(']) {
    assert.ok(!txt.includes(prohibido), `ui/perfil.js menciona "${prohibido}"`);
  }
  assert.ok(!/from ['"]\.\.\/src\//.test(txt), 'ui/perfil.js importa de ../src/');
});

test('ui/render.js, ui/graficos.js, ui/formulario.js, ui/perfil-pantalla.js NO importan del motor', () => {
  for (const f of ['ui/render.js', 'ui/graficos.js', 'ui/formulario.js', 'ui/perfil-pantalla.js']) {
    const txt = leer(f);
    assert.ok(!/from ['"]\.\.\/src\//.test(txt), `${f} importa de ../src/`);
  }
});

test('ui/adapter.js solo importa del motor vía ../src/index.js (nada más profundo)', () => {
  const txt = leer('ui/adapter.js');
  const imports = [...txt.matchAll(/from ['"](\.\.\/src\/[^'"]+)['"]/g)].map((m) => m[1]);
  assert.deepEqual(imports, ['../src/index.js'], `imports de ../src/ inesperados: ${imports.join(', ')}`);
});

test('ui/app.js solo importa lógica vía ./adapter.js y ./perfil.js (no ../src/ directo)', () => {
  const txt = leer('ui/app.js');
  assert.ok(!/from ['"]\.\.\/src\//.test(txt), 'ui/app.js importa de ../src/ directo');
});
```

- [ ] **Step 2: Run it**

Run: `node --test test/ui-separada.test.js`
Expected: PASS (6 tests).

- [ ] **Step 3: Commit**

```bash
git add test/ui-separada.test.js
git commit -m "test(ui-v2): purity guards for perfil.js / perfil-pantalla.js; pin adapter's engine import

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: Full suite + manual browser verification

- [ ] **Step 1:** `npm test` from the repo root. Expected: **every file green**, including the Motor-plan tests (untouched here) and the rewritten adapter/perfil tests. `test/formato.test.js` unchanged and passing.
- [ ] **Step 2:** `node --check` each DOM module that has no unit test: `node --check ui/formulario.js ui/render.js ui/perfil-pantalla.js ui/app.js ui/graficos.js`. Expected: no output.
- [ ] **Step 3: Manual browser pass** — `npm run dev`, open `http://localhost:5173`. Walk this checklist (from `docs/diseno-v2.md` §B.7 + §B.10 + §B.11 + the approved wireframe); fix and re-check any that fail:
  - [ ] On load with the cost empty: hero shows **no price**, the `sin_costo` title, a CTA that focuses the cost input. No "$0" anywhere.
  - [ ] Type a cost (e.g. `24000`): price appears large and dominant; chips read `NETO` + `ESTIMADO` (profile defaults have SUPUESTO params); accent is amber; confidence line names the supuestos and says the faltantes are "no asumidos en $0".
  - [ ] Open **Perfil económico**: grouped rows, confidence bar reads `0% real` / `0 real · 5 supuesto · 8 falta · 1 config`, the priority list leads with "Comisión de recaudo". Close returns focus to the button.
  - [ ] In the profile, clear **Flete de ida** → back on the main screen the hero flips to `no_calculable`, no price, names "el flete de ida", CTA opens the profile focused on that row.
  - [ ] In the profile, set **Costo por conversación** to `0` and mark it real → hero flips to a `*_bruto` state, chips read `BRUTO`, the red CAC warning strip is visible inside the hero card, margin line says "operativo".
  - [ ] Clear the **margin** input (cost still filled) → hero shows `sin_objetivo`, no price, CTA focuses the margin input; typing/clicking a preset restores the price.
  - [ ] Set margin to `95%` with a `comisionRecaudoPct` of `10%` → `no_alcanzable`, no price, shows the operative floor as the escape.
  - [ ] "¿Por qué este precio?" block is visible under the hero without expanding anything; "Ver el desglose completo →" opens the desglose accordion.
  - [ ] Resize to a narrow viewport (< 720px): the price + "¿por qué?" sit **above** the two inputs; touch targets look ≥ 44px.
  - [ ] With OS "reduce motion" on: no transition on the price number or the chart reddraws.
  - [ ] Keyboard only: Tab reaches cost → margin → preset buttons → hero CTA → accordion summaries; the ⓘ buttons in the profile are reachable and fire on Enter.
  - [ ] Reload the page after saving a profile change → the change persisted (localStorage).
- [ ] **Step 4:** No commit — verification checkpoint. If Step 3 required fixes, commit those with `fix(ui-v2): ...` messages as you go.

---

### Deferred, on purpose

- **Evaluar mode** (measure a price you already set): out of scope for V2 UI (Global Constraints). The engine keeps `modo: 'evaluar'`; re-surfacing it is a later, additive iteration.
- **The standalone "Sensibilidad a la tasa de entrega" mini-table** shown in the wireframe's secondary column is realized through the existing **Escenarios → Sensibilidad** panel (which already covers `tasaEntrega` among its five variables), not as a new always-computed table — that keeps `ui/adapter.js` free of extra `analizar()` calls on every keystroke.
- **A real tooltip component** for the profile ⓘ buttons: V2 ships `alert(ayuda)` — keyboard-accessible and enough for the Etapa 1 audience. A hover/focus popover is a polish pass.
- **Focus trap** inside the profile slide-over: V2 moves focus in on open and back on close and closes on Escape; a full trap can come later.
- **The persistent "Estás usando supuestos iniciales de JDSMPlus…" banner of §B.13:** the Etapa 1 → Etapa 2 narrative is carried in V2 by the `ESTIMADO`/`REAL` chip, the confidence bar and counts in the profile, and the profile's intro line — not by a separate always-on banner on the main screen. Adding that banner is a small, additive polish item.
