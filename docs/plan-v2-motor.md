# Motor V2 — Precio con Confianza — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the pure pricing engine (`src/`) so it can produce a `recomendacion` — a single recommended price for combo 1, tagged with one of 8 confidence states (`sin_costo`, `sin_objetivo`, `no_calculable`, `no_alcanzable`, `ok_bruto`, `estimacion_bruto`, `ok_neto`, `estimacion_neto`) — driven by a new default pricing rule (`margen_neto`, closed form) instead of V1's flat `utilidadObjetivo`, while tracking REAL/SUPUESTO/FALTANTE/CONFIG provenance per parameter and never silently treating a missing value as `$0`.

**Architecture:** Two small new pure modules (`src/procedencia.js`, `src/recomendacion.js`) sit alongside the existing V1 modules. `procedencia.js` infers REAL/SUPUESTO/FALTANTE for each economic input from `entrada` (a caller-supplied `entrada.procedencia` entry always wins; otherwise `null` → FALTANTE, a number → SUPUESTO). `combos.js` gains a second pricing formula (`margen_neto`, the new default) alongside the existing one (kept, renamed `utilidad_fija`) and a third (`markup`); `ctx.objetivo.regla.tipo` picks which one runs. `recomendacion.js` reads `procedencia` + combo 1's numbers and applies the spec's decision flow (A.7) to pick the state and to null out the price outright for the three "don't dare guess" states. Nothing in `costos.js`/`rentabilidad.js` changes except one new derived getter (`margenOperativo`); the arithmetic these already do — including quietly treating a missing degradable parameter as `0` — is *correct* per the spec, it just now gets an explicit, mandatory aviso instead of happening silently.

**Tech Stack:** Node.js ≥22.5, ESM, `node:test` + `node:assert/strict` (`npm test`, `--test-concurrency=1`). No new dependencies.

**Spec:** `docs/diseno-v2.md` (Part A — Modelo económico y arquitectura). This plan covers Part A only; Part B (UI) is a separate plan (`docs/plan-v2-ui.md`) that consumes what this plan produces.

## Global Constraints

- Node ≥22.5.0, ESM (`type: "module"`), no new npm dependencies.
- `src/**` stays free of `ui/`, `document`, `window`, `localStorage` (enforced today by `test/ui-separada.test.js` — do not break it).
- **`src/` is the engine described as "`src/pricing/`" in `docs/diseno-v2.md` §A.13.** Do NOT rename the `src/` folder to `src/pricing/` — that label in the spec describes the engine's *role* (it becomes `Proyecto-1/src/pricing/` only when copied into the CRM repo by `scripts/sync-pricing.mjs`, a separate, human-triggered step in a different repo). Renaming here would break `scripts/sync-pricing.mjs`'s assumptions for no functional benefit.
- Every formula in this plan is copied from `docs/diseno-v2.md` §A.6/§A.7/§A.8/§A.9 verbatim — do not re-derive or simplify them.
- A FALTANTE (crítico or degradante) parameter never silently becomes `$0` in the **recommendation** (`resultado.recomendacion`): it either blocks the price (`sin_costo`/`no_calculable`) or forces `estimacion_*` with the parameter's name recorded in `confianza.faltantesAsumidosCero` and a global aviso. It is fine — and unchanged from V1 — for `combos[]`/`equilibrio` to keep computing "as if 0" for those same parameters; `recomendacion` is the new, honest, gated headline number the UI plan will show.
- `no_alcanzable` is defined **only** by `1 − comisionRecaudoPct − margenObjetivo ≤ 0`. Never derive it by comparing the crudo price to the break-even price.
- Every existing `npm test` file must still pass after this plan (task steps say exactly which files change and why).

---

### Task 1: `src/procedencia.js` — infer REAL/SUPUESTO/FALTANTE per parameter

**Files:**
- Create: `src/procedencia.js`
- Test: `test/procedencia.test.js`

**Interfaces:**
- Consumes: nothing (pure, no imports from other `src/` files).
- Produces: `PARAMS_ECONOMICOS: Array<{clave, ruta}>`, `CLAVES_ECONOMICAS: string[]`, `inferirProcedencia(entrada) => Record<string, 'REAL'|'SUPUESTO'|'FALTANTE'|'CONFIG'>`, `peorEstado(...estados) => 'REAL'|'SUPUESTO'|'FALTANTE'`. Task 6 (`recomendacion.js`) imports `CLAVES_ECONOMICAS` and `inferirProcedencia`; Task 2 (`normalizar.js`) imports `inferirProcedencia`.

- [ ] **Step 1: Write the failing test**

```js
// test/procedencia.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferirProcedencia, peorEstado, CLAVES_ECONOMICAS } from '../src/procedencia.js';

test('CLAVES_ECONOMICAS cubre costoUnitario y fleteIda (los dos críticos)', () => {
  assert.ok(CLAVES_ECONOMICAS.includes('costoUnitario'));
  assert.ok(CLAVES_ECONOMICAS.includes('fleteIda'));
});

test('valor null/ausente -> FALTANTE; valor numérico sin clasificar -> SUPUESTO', () => {
  const p = inferirProcedencia({
    producto: { costoUnitario: 24000 },
    supuestos: { fleteIda: 20000, fleteDevolucion: null },
    mercado: { tasaEntrega: 0.75 },
  });
  assert.equal(p.costoUnitario, 'SUPUESTO');   // número, sin clasificar explícitamente
  assert.equal(p.fleteIda, 'SUPUESTO');
  assert.equal(p.fleteDevolucion, 'FALTANTE'); // explícitamente null
  assert.equal(p.tasaEntrega, 'SUPUESTO');
  assert.equal(p.comisionRecaudoPct, 'FALTANTE'); // ni siquiera está la clave -> ausente -> null -> FALTANTE
});

test('entrada.procedencia explícita siempre gana sobre la inferencia', () => {
  const p = inferirProcedencia({
    producto: { costoUnitario: 24000 },
    procedencia: { costoUnitario: 'REAL' },
  });
  assert.equal(p.costoUnitario, 'REAL');
});

test('claves CONFIG arbitrarias (fuera de CLAVES_ECONOMICAS) se hacen eco tal cual', () => {
  const p = inferirProcedencia({
    producto: { costoUnitario: 24000 },
    procedencia: { costoUnitario: 'REAL', 'objetivo.regla.valor': 'CONFIG' },
  });
  assert.equal(p['objetivo.regla.valor'], 'CONFIG');
});

test('un valor de procedencia desconocido (typo) se ignora y cae a inferencia', () => {
  const p = inferirProcedencia({
    producto: { costoUnitario: 24000 },
    procedencia: { costoUnitario: 'REALX' },
  });
  assert.equal(p.costoUnitario, 'SUPUESTO'); // "REALX" no es válido -> se infiere del valor (número)
});

test('no lanza con entrada undefined/null', () => {
  assert.doesNotThrow(() => inferirProcedencia());
  assert.doesNotThrow(() => inferirProcedencia(null));
});

test('peorEstado: REAL < SUPUESTO < FALTANTE', () => {
  assert.equal(peorEstado('REAL', 'REAL'), 'REAL');
  assert.equal(peorEstado('REAL', 'SUPUESTO'), 'SUPUESTO');
  assert.equal(peorEstado('SUPUESTO', 'FALTANTE'), 'FALTANTE');
  assert.equal(peorEstado('FALTANTE', 'REAL', 'SUPUESTO'), 'FALTANTE');
});

test('peorEstado sin argumentos es REAL (identidad neutra)', () => {
  assert.equal(peorEstado(), 'REAL');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/procedencia.test.js`
Expected: FAIL — `Cannot find module '../src/procedencia.js'`

- [ ] **Step 3: Write the implementation**

```js
// src/procedencia.js
/**
 * Deriva el estado REAL/SUPUESTO/FALTANTE de cada parámetro económico a partir
 * de `entrada`. `entrada.procedencia` (si el llamador la da) siempre gana; si
 * no, un valor `null`/ausente es FALTANTE y un número es SUPUESTO — nunca REAL:
 * REAL solo lo declara quien conoce el origen del dato (el adaptador de UI).
 */

export const PARAMS_ECONOMICOS = [
  { clave: 'costoUnitario', ruta: ['producto', 'costoUnitario'] },
  { clave: 'fleteIda', ruta: ['supuestos', 'fleteIda'] },
  { clave: 'fleteDevolucion', ruta: ['supuestos', 'fleteDevolucion'] },
  { clave: 'feeDevolucion', ruta: ['supuestos', 'feeDevolucion'] },
  { clave: 'pctProductoPerdidoEnDevolucion', ruta: ['supuestos', 'pctProductoPerdidoEnDevolucion'] },
  { clave: 'comisionRecaudoPct', ruta: ['supuestos', 'comisionRecaudoPct'] },
  { clave: 'comisionRecaudoFijo', ruta: ['supuestos', 'comisionRecaudoFijo'] },
  { clave: 'empaquePorPedido', ruta: ['supuestos', 'empaquePorPedido'] },
  { clave: 'costoAtencionConversacion', ruta: ['supuestos', 'costoAtencionConversacion'] },
  { clave: 'tasaEntrega', ruta: ['mercado', 'tasaEntrega'] },
  { clave: 'tasaCierre', ruta: ['mercado', 'tasaCierre'] },
  { clave: 'costoConversacion', ruta: ['mercado', 'costoConversacion'] },
  { clave: 'costosFijosMes', ruta: ['overhead', 'costosFijosMes'] },
  { clave: 'diasOperacionMes', ruta: ['overhead', 'diasOperacionMes'] },
];

export const CLAVES_ECONOMICAS = PARAMS_ECONOMICOS.map((p) => p.clave);

const ESTADOS_VALIDOS = new Set(['REAL', 'SUPUESTO', 'FALTANTE', 'CONFIG']);
const ORDEN = { REAL: 0, SUPUESTO: 1, FALTANTE: 2 };

function leerRuta(obj, ruta) {
  let v = obj;
  for (const k of ruta) {
    v = v?.[k];
    if (v === undefined) return undefined;
  }
  return v;
}

export function inferirProcedencia(entrada) {
  const e = entrada ?? {};
  const dadas = e.procedencia ?? {};
  const out = {};

  // Eco de cualquier clasificación explícita y válida (incluye claves CONFIG
  // como 'objetivo.regla.valor' que no viven en PARAMS_ECONOMICOS).
  for (const [k, v] of Object.entries(dadas)) {
    if (ESTADOS_VALIDOS.has(v)) out[k] = v;
  }

  // Inferencia para las económicas que el llamador no haya clasificado.
  for (const { clave, ruta } of PARAMS_ECONOMICOS) {
    if (out[clave]) continue;
    const crudo = leerRuta(e, ruta);
    out[clave] = crudo == null ? 'FALTANTE' : 'SUPUESTO';
  }

  return out;
}

/** Peor estado entre varios (para procedencia de derivados). CONFIG no participa. */
export function peorEstado(...estados) {
  return estados.reduce((peor, act) => (ORDEN[act] > ORDEN[peor] ? act : peor), 'REAL');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/procedencia.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/procedencia.js test/procedencia.test.js
git commit -m "feat(v2): infer REAL/SUPUESTO/FALTANTE per economic parameter

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `src/normalizar.js` — return `procedencia`; `objetivo.regla` replaces the flat `utilidadObjetivo`

**Files:**
- Modify: `src/normalizar.js`
- Test: `test/normalizar.test.js` (extend; existing tests are unaffected — see Step 1)

**Interfaces:**
- Consumes: `inferirProcedencia` from `src/procedencia.js` (Task 1).
- Produces: `normalizarEntrada(entrada) => { ctx, entradaNormalizada, avisos, procedencia }` (new 4th key `procedencia`). `ctx.objetivo` becomes `{ modo, regla: { tipo, valor } | null }` — the old `ctx.objetivo.utilidadObjetivo` key is gone. Task 3 (`combos.js`), Task 6 (`recomendacion.js`) and Task 7 (`index.js`) all read `ctx.objetivo.regla` and the new `procedencia` return value.

- [ ] **Step 1: Write the failing test**

Existing `test/normalizar.test.js` tests are untouched by this change (none of them assert on `ctx.objetivo.utilidadObjetivo` — only on `.ctx.objetivo.modo`, which keeps working identically). Add these to the end of `test/normalizar.test.js`:

```js
// append to test/normalizar.test.js
import { inferirProcedencia } from '../src/procedencia.js';

test('normalizarEntrada devuelve procedencia (misma inferencia que inferirProcedencia)', () => {
  const entrada = { producto: { costoUnitario: 24000 }, supuestos: { fleteIda: null } };
  const { procedencia } = normalizarEntrada(entrada);
  assert.deepEqual(procedencia, inferirProcedencia(entrada));
  assert.equal(procedencia.fleteIda, 'FALTANTE');
});

test('objetivo.regla: default margen_neto 0.25 cuando no se especifica', () => {
  const { ctx } = normalizarEntrada({ producto: { costoUnitario: 24000 } });
  assert.deepEqual(ctx.objetivo.regla, { tipo: 'margen_neto', valor: 0.25 });
});

test('objetivo.regla: se respeta un tipo/valor explícito', () => {
  const { ctx } = normalizarEntrada({
    producto: { costoUnitario: 24000 },
    objetivo: { regla: { tipo: 'utilidad_fija', valor: 40000 } },
  });
  assert.deepEqual(ctx.objetivo.regla, { tipo: 'utilidad_fija', valor: 40000 });
});

test('objetivo.regla: valor null explícito se conserva (dispara sin_objetivo más adelante)', () => {
  const { ctx } = normalizarEntrada({
    producto: { costoUnitario: 24000 },
    objetivo: { regla: { tipo: 'margen_neto', valor: null } },
  });
  assert.equal(ctx.objetivo.regla.valor, null);
});

test('objetivo.regla: tipo desconocido cae a margen_neto', () => {
  const { ctx } = normalizarEntrada({
    producto: { costoUnitario: 24000 },
    objetivo: { regla: { tipo: 'inventado', valor: 0.3 } },
  });
  assert.equal(ctx.objetivo.regla.tipo, 'margen_neto');
});

test('entradaNormalizada.objetivo también trae regla (no solo ctx)', () => {
  const { entradaNormalizada } = normalizarEntrada({ producto: { costoUnitario: 24000 } });
  assert.deepEqual(entradaNormalizada.objetivo.regla, { tipo: 'margen_neto', valor: 0.25 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/normalizar.test.js`
Expected: FAIL — `procedencia` is `undefined`; `ctx.objetivo.regla` is `undefined`.

- [ ] **Step 3: Modify the implementation**

In `src/normalizar.js`, add the import and replace the `objetivo` handling and the return statements:

```js
// src/normalizar.js — add near the top, with the other import
import { num, clamp, aviso } from './util.js';
import { inferirProcedencia } from './procedencia.js';
```

Replace this block (currently around line 71-73):

```js
  const modo = obj.modo === 'evaluar' || obj.modo === 'sugerir'
    ? obj.modo
    : (precioBase == null ? 'sugerir' : 'evaluar');
```

with:

```js
  const modo = obj.modo === 'evaluar' || obj.modo === 'sugerir'
    ? obj.modo
    : (precioBase == null ? 'sugerir' : 'evaluar');

  const TIPOS_REGLA = new Set(['margen_neto', 'utilidad_fija', 'markup']);
  const reglaCruda = obj.regla ?? {};
  const regla = {
    tipo: TIPOS_REGLA.has(reglaCruda.tipo) ? reglaCruda.tipo : 'margen_neto',
    valor: reglaCruda.valor === null ? null : num(reglaCruda.valor, 0.25),
  };
```

Then in the `ctx` object literal, replace:

```js
    objetivo: { modo, utilidadObjetivo: num(obj.utilidadObjetivo, 0) },
```

with:

```js
    objetivo: { modo, regla },
```

And in `entradaNormalizada`, replace:

```js
    mezcla, objetivo: ctx.objetivo,
```

(this line already reads `ctx.objetivo`, which now carries `regla` automatically — no change needed there).

Finally, replace the function's `return` statement:

```js
  return { ctx, entradaNormalizada, avisos };
```

with:

```js
  const procedencia = inferirProcedencia(entrada);
  return { ctx, entradaNormalizada, avisos, procedencia };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/normalizar.test.js`
Expected: PASS (all original tests + the 5 new ones)

- [ ] **Step 5: Run the full suite to confirm nothing else broke**

Run: `npm test`
Expected: `test/combos.test.js` will now show failures (its `BASE` fixture used the old `objetivo.utilidadObjetivo` — Task 3 fixes this). Every other file should still pass. If any *other* file fails here, stop and investigate before continuing — Task 2 is only supposed to touch `normalizar.js`'s output shape in a way that `combos.js` (not yet updated) can't consume for its old formula.

- [ ] **Step 6: Commit**

```bash
git add src/normalizar.js test/normalizar.test.js
git commit -m "feat(v2): normalizarEntrada returns procedencia; objetivo.regla replaces utilidadObjetivo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `src/combos.js` — `margen_neto` closed form becomes the default rule

**Files:**
- Modify: `src/combos.js`
- Test: `test/combos.test.js` (rewrite `BASE` fixtures; add a margen_neto block; add a markup block)

**Interfaces:**
- Consumes: `ctx.objetivo.regla` (`{tipo, valor}`) from Task 2; `costos.cogs`, `costos.colchonDevoluciones` (unchanged, from `src/costos.js`); `rent.cac` (unchanged, from `src/rentabilidad.js`, via `crearRentabilidad`).
- Produces: `crearCombos(ctx, costos, rent)` keeps its exact same return shape (`{ sugerirPrecioCombo, precioCrudo, evaluarCombo, semaforoDe }`); `precioCrudo(n)` now dispatches on `ctx.objetivo.regla.tipo` (`'margen_neto'` default, `'utilidad_fija'`, `'markup'`) instead of always using the old fixed-utility formula. `precioCrudo(n)` returns `null` when `regla.tipo === 'margen_neto'` and `1 − comisionRecaudoPct − regla.valor ≤ 0` (the `no_alcanzable` condition) — Task 6 (`recomendacion.js`) relies on this to avoid a bogus/negative crudo price ever reaching a combo.

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `test/combos.test.js` with:

```js
// test/combos.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarEntrada } from '../src/normalizar.js';
import { crearCostos } from '../src/costos.js';
import { crearPublicidad } from '../src/publicidad.js';
import { crearRentabilidad } from '../src/rentabilidad.js';
import { crearCombos } from '../src/combos.js';

const cerca = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

function mod(entrada) {
  const { ctx } = normalizarEntrada(entrada);
  const costos = crearCostos(ctx);
  const rent = crearRentabilidad(ctx, costos, crearPublicidad(ctx));
  return { ctx, m: crearCombos(ctx, costos, rent) };
}

// --- regla margen_neto (el default de V2) ---

const BASE_NETO = {
  producto: { costoUnitario: 37500 },
  supuestos: { fleteIda: 20000 },
  mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 },
  objetivo: { modo: 'sugerir' }, // sin regla -> default margen_neto, valor 0.25
};

test('margen_neto es la regla por defecto (sin especificar objetivo.regla)', () => {
  const { ctx } = mod(BASE_NETO);
  assert.deepEqual(ctx.objetivo.regla, { tipo: 'margen_neto', valor: 0.25 });
});

test('margen_neto: precioCrudo(1) reproduce K0(1)+cac sobre (1-q-m)', () => {
  // K0(1) = cogs(37500) + fleteIda(20000) + colchón((0.25/0.75)*20000=6666.667) = 64166.667
  // cac = 4000/(0.2*0.75) = 26666.667 ; q=0, m=0.25 -> /0.75
  const { m } = mod(BASE_NETO);
  assert.ok(cerca(m.precioCrudo(1), 121111.111));
});

test('margen_neto: el mismo % de margen aplica a n=2 y n=3 (identidad exacta)', () => {
  const { m, ctx } = mod(BASE_NETO);
  const rent = crearRentabilidad(ctx, crearCostos(ctx), crearPublicidad(ctx));
  for (const n of [1, 2, 3]) {
    const pCrudo = m.precioCrudo(n);
    assert.ok(cerca(rent.margen(n, pCrudo).neto, 0.25, 1e-9), `n=${n}`);
  }
});

test('margen_neto: sin CAC (costoConversacion=0), precioCrudo cae al margen operativo (sin +cac)', () => {
  const { m } = mod({ ...BASE_NETO, mercado: { ...BASE_NETO.mercado, costoConversacion: 0 } });
  // K0(1) = 64166.667 ; sin cac -> /0.75
  assert.ok(cerca(m.precioCrudo(1), 85555.556));
});

test('margen_neto: no_alcanzable (1-q-m<=0) -> precioCrudo devuelve null, no Infinity/negativo', () => {
  const { m } = mod({
    ...BASE_NETO,
    supuestos: { fleteIda: 20000, comisionRecaudoPct: 0.80 },
    objetivo: { modo: 'sugerir', regla: { tipo: 'margen_neto', valor: 0.25 } },
  });
  assert.equal(m.precioCrudo(1), null); // 1 - 0.80 - 0.25 = -0.05 <= 0
});

// --- regla utilidad_fija (mecanismo histórico de V1, ahora explícito) ---

const BASE_UTILIDAD_FIJA = {
  producto: { costoUnitario: 37500 },
  supuestos: { fleteIda: 20000 },
  mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 },
  objetivo: { modo: 'sugerir', regla: { tipo: 'utilidad_fija', valor: 40000 } },
};

test('utilidad_fija: precioCrudo reproduce los números de la auditoría V1', () => {
  const { m } = mod(BASE_UTILIDAD_FIJA);
  assert.ok(cerca(m.precioCrudo(1), 104166.6667));
  assert.ok(cerca(m.precioCrudo(2), 173666.6667));
  assert.ok(cerca(m.precioCrudo(3), 243166.6667));
});

test('utilidad_fija: sugerirPrecioCombo redondea hacia arriba, sin quedar bajo el crudo', () => {
  const { m } = mod(BASE_UTILIDAD_FIJA);
  assert.equal(m.sugerirPrecioCombo(1), 105100);
});

// --- regla markup (referencia rápida, ignora estructura de costos) ---

test('markup: precioCrudo(n) = C*n*f, sin flete ni devoluciones', () => {
  const { m } = mod({
    ...BASE_UTILIDAD_FIJA,
    objetivo: { modo: 'sugerir', regla: { tipo: 'markup', valor: 2 } },
  });
  assert.equal(m.precioCrudo(1), 75000);
  assert.equal(m.precioCrudo(2), 150000);
});

// --- comportamiento independiente de la regla ---

test('modo sugerir sin escalera: los 3 combos son sugeridos', () => {
  const { m } = mod(BASE_NETO);
  for (const n of [1, 2, 3]) {
    const { combo } = m.evaluarCombo(n);
    assert.equal(combo.esSugerido, true);
    assert.equal(combo.n, n);
    assert.ok(combo.ingreso > 0);
    assert.equal(combo.precioSugerido, combo.ingreso);
  }
});

test('modo sugerir con escalera: usa el precio de la escalera, marca esSugerido:false', () => {
  const { m } = mod({ ...BASE_NETO, producto: { costoUnitario: 37500, escaleraPrecios: [{ cantidad: 2, precio: 170000 }] } });
  const { combo } = m.evaluarCombo(2);
  assert.equal(combo.ingreso, 170000);
  assert.equal(combo.esSugerido, false);
  assert.equal(typeof combo.precioSugerido, 'number');
});

test('modo evaluar sin fila de escalera para n=2: precioBase*2 + aviso', () => {
  const { m } = mod({ ...BASE_NETO, producto: { costoUnitario: 37500, precioBase: 119900 }, objetivo: { modo: 'evaluar' } });
  const { combo, avisos } = m.evaluarCombo(2);
  assert.equal(combo.ingreso, 239800);
  assert.ok(avisos.find((a) => a.codigo === 'combo_sin_precio'));
});

test('el combo trae costo desglosado y utilidad en 3 denominadores', () => {
  const { m } = mod(BASE_NETO);
  const { combo } = m.evaluarCombo(1);
  assert.ok('cogs' in combo.costo && 'colchonDevoluciones' in combo.costo);
  assert.ok('porPedidoGenerado' in combo.utilidad && 'porVentaEntregada' in combo.utilidad && 'final' in combo.utilidad);
});

test('semaforoDe clasifica por margen neto', () => {
  const { m } = mod(BASE_NETO);
  assert.equal(m.semaforoDe(0.35).nivel, 'premium');
  assert.equal(m.semaforoDe(0.22).nivel, 'sano');
  assert.equal(m.semaforoDe(0.12).nivel, 'apretado');
  assert.equal(m.semaforoDe(0.03).nivel, 'muy-apretado');
  assert.equal(m.semaforoDe(1e-9).nivel, 'muy-apretado');
  assert.equal(m.semaforoDe(0).nivel, 'pierde');
  assert.equal(m.semaforoDe(-0.1).nivel, 'pierde');
  assert.equal(m.semaforoDe(null).nivel, 'sin-dato');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/combos.test.js`
Expected: FAIL — margen_neto numbers don't match (old formula still runs), `markup`/`no_alcanzable` cases throw or return wrong values.

- [ ] **Step 3: Modify the implementation**

Replace the full contents of `src/combos.js`:

```js
// src/combos.js
import { redondear } from './redondeo.js';
import { aviso } from './util.js';

/** Umbrales del semáforo de margen neto (fracción sobre el precio). */
const UMBRALES = [
  { min: 0.30, nivel: 'premium' },
  { min: 0.20, nivel: 'sano' },
  { min: 0.10, nivel: 'apretado' },
];

export function crearCombos(ctx, costos, rent) {
  const {
    objetivo, cesionUtilidadPorUnidadExtra: d, comisionRecaudoPct,
    comisionRecaudoFijo, fleteIda, empaquePorPedido, redondeo,
    escaleraPrecios, precioBase, costoUnitario,
  } = ctx;

  const regla = objetivo.regla ?? { tipo: 'margen_neto', valor: 0.25 };

  // K0(n) = cogs(n) + fleteIda + comisiónFija(Q) + empaque(E) + colchón(n) —
  // "recuperación de costos por venta entregada", sin precio y sin adquisición (§A.6).
  const K0 = (n) => costos.cogs(n) + fleteIda + comisionRecaudoFijo + empaquePorPedido + costos.colchonDevoluciones(n);

  // --- regla margen_neto (default V2): P_crudo = (K0(n)+cac) / (1-q-m), o K0(n)/(1-q-m) sin CAC. ---
  const precioCrudoMargenNeto = (n) => {
    const m = regla.valor;
    if (m == null) return null; // sin_objetivo: index.js/recomendacion.js lo maneja aparte
    const denominador = 1 - comisionRecaudoPct - m;
    if (denominador <= 0) return null; // no_alcanzable — nunca Infinity/negativo
    const cac = rent.cac;
    const numerador = cac == null ? K0(n) : K0(n) + cac;
    return numerador / denominador;
  };

  // --- regla utilidad_fija (mecanismo histórico de V1: "quiero ganar $U por venta entregada"). ---
  const utotalFija = (n) => regla.valor * (1 + (n - 1) * (1 - d));
  const precioCrudoUtilidadFija = (n) =>
    (costos.cogs(n) + fleteIda + comisionRecaudoFijo + empaquePorPedido
      + costos.colchonDevoluciones(n) + utotalFija(n)) / (1 - comisionRecaudoPct);

  // --- regla markup: referencia rápida, ignora flete/devoluciones/CAC (§A.10). ---
  const precioCrudoMarkup = (n) => costoUnitario * n * regla.valor;

  const precioCrudo = (n) => {
    if (regla.tipo === 'utilidad_fija') return precioCrudoUtilidadFija(n);
    if (regla.tipo === 'markup') return precioCrudoMarkup(n);
    return precioCrudoMargenNeto(n);
  };

  const sugerirPrecioCombo = (n) => redondear(precioCrudo(n), redondeo);

  const filaEscalera = (n) => (n === 1 ? null : escaleraPrecios.find((f) => f.cantidad === n) ?? null);

  const semaforoDe = (margenNeto) => {
    if (margenNeto == null) return { nivel: 'sin-dato', pct: null };
    const pct = margenNeto * 100;
    const hit = UMBRALES.find((u) => margenNeto >= u.min);
    if (hit) return { nivel: hit.nivel, pct };
    return { nivel: margenNeto > 0 ? 'muy-apretado' : 'pierde', pct };
  };

  const evaluarCombo = (n) => {
    const avisos = [];
    let ingreso;
    let esSugerido = false;
    const fila = filaEscalera(n);
    const precioSugerido = sugerirPrecioCombo(n);

    if (objetivo.modo === 'sugerir') {
      if (fila) { ingreso = fila.precio; }
      else { ingreso = precioSugerido; esSugerido = true; }
    } else {
      if (n === 1) { ingreso = precioBase ?? 0; }
      else if (fila) { ingreso = fila.precio; }
      else {
        ingreso = (precioBase ?? 0) * n;
        avisos.push(aviso('combo_sin_precio', 'aviso', `El combo de ${n} no tiene precio definido; se asumió ${n}× el precio de 1.`));
      }
    }

    const cac = rent.cac;
    const margen = rent.margen(n, ingreso);
    const combo = {
      n,
      ingreso,
      precioSugerido,
      esSugerido,
      costo: {
        cogs: costos.cogs(n),
        fleteIda,
        comisionRecaudo: costos.comisionRecaudo(ingreso),
        empaque: empaquePorPedido,
        colchonDevoluciones: costos.colchonDevoluciones(n),
        total: cac == null ? null : costos.costoTotalPorVenta(n, ingreso, cac),
      },
      utilidad: {
        porPedidoGenerado: rent.utilidadPorPedido(n, ingreso),
        porVentaEntregada: rent.utilidadPorVentaEntregada(n, ingreso),
        final: rent.utilidadFinal(n, ingreso),
      },
      margen,
      markup: rent.markup(n, ingreso),
      cac,
      roas: null,
      descuentoMaximoPct: null,
      semaforo: semaforoDe(margen.neto),
    };
    return { combo, avisos };
  };

  return { sugerirPrecioCombo, precioCrudo, evaluarCombo, semaforoDe };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/combos.test.js`
Expected: PASS (all tests)

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: `test/analizar.test.js` and `test/identidades.test.js` still fail (they use the old `objetivo.utilidadObjetivo` fixture and now get margen_neto prices instead — Task 7 fixes `index.js`'s callers and Task 8/9 add the new identity tests). `test/equilibrio.test.js` and `test/validacion.test.js` should still pass unchanged (they don't touch `objetivo`/combos pricing). If `test/rentabilidad.test.js` or `test/redondeo.test.js` fail, stop — that would mean this change leaked outside `combos.js`.

- [ ] **Step 6: Commit**

```bash
git add src/combos.js test/combos.test.js
git commit -m "feat(v2): margen_neto closed-form pricing becomes the default combo rule

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `src/equilibrio.js` — add `precioMinimoOperativo` (break-even without CAC)

**Files:**
- Modify: `src/equilibrio.js`
- Test: `test/equilibrio.test.js` (extend)

**Interfaces:**
- Consumes: `costos.cogs`, `costos.colchonDevoluciones` (unchanged).
- Produces: `crearEquilibrio(...)` return object gains `precioMinimoOperativo(n) => number` (never `null` — unlike `precioMinimo`, it doesn't need CAC). Task 7 (`index.js`) calls this to populate `resultado.equilibrio.precioMinimoOperativo`.

- [ ] **Step 1: Write the failing test**

Append to `test/equilibrio.test.js`:

```js
// append to test/equilibrio.test.js
test('precioMinimoOperativo: K0(1)/(1-q), siempre calculable (no depende de CAC)', () => {
  const { eq } = mod({ mercado: { costoConversacion: 0 } }); // sin pauta -> precioMinimo (con CAC) es null
  assert.equal(eq.precioMinimo(1), null);
  // K0(1) = cogs(37500)+fleteIda(20000)+colchón((0.25/0.75)*20000=6666.667) = 64166.667 ; q=0 -> /1
  assert.ok(cerca(eq.precioMinimoOperativo(1), 64166.667));
});

test('precioMinimoOperativo: en ese precio, utilidadPorVentaEntregada es 0', () => {
  const { eq, rent } = mod();
  const pmo = eq.precioMinimoOperativo(1);
  assert.ok(cerca(rent.utilidadPorVentaEntregada(1, pmo), 0, 1));
});

test('precioMinimoOperativo: siempre <= precioMinimo cuando hay CAC (adquisición se suma aparte)', () => {
  const { eq } = mod();
  const pmo = eq.precioMinimoOperativo(1);
  const pm = eq.precioMinimo(1);
  assert.ok(pm != null && pmo < pm);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/equilibrio.test.js`
Expected: FAIL — `eq.precioMinimoOperativo is not a function`

- [ ] **Step 3: Modify the implementation**

In `src/equilibrio.js`, add the new function right after `precioMinimo` and export it:

```js
  const precioMinimoOperativo = (n) =>
    (costos.cogs(n) + fleteIda + comisionRecaudoFijo + empaquePorPedido + costos.colchonDevoluciones(n))
    / (1 - comisionRecaudoPct);
```

Then add `precioMinimoOperativo` to the returned object:

```js
  return {
    precioMinimo, precioMinimoOperativo, descuentoMaximoPct, tasaEntregaMinima, tasaCierreMinima,
    costoConversacionMaximo, roasMinimo, unidadesDiaParaFijos,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/equilibrio.test.js`
Expected: PASS (all original tests + the 3 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/equilibrio.js test/equilibrio.test.js
git commit -m "feat(v2): add precioMinimoOperativo — break-even diagnostic without CAC

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `src/validacion.js` — mandatory aviso when a degradable parameter was assumed `$0`

**Files:**
- Modify: `src/validacion.js`
- Test: `test/validacion.test.js` (extend; existing tests pass unmodified — `procedencia` defaults to `{}`)

**Interfaces:**
- Consumes: `CLAVES_ECONOMICAS` is NOT reused here — this task hardcodes the "degradante" subset (a fixed, spec-defined list, distinct from the full `CLAVES_ECONOMICAS`), per `docs/diseno-v2.md` §A.4.1.
- Produces: `revisar(ctx, combos, procedencia = {})` — new 3rd optional parameter (backward compatible: old 2-arg calls keep working). Emits a new aviso code `datos_faltantes_en_cero` when any degradante parameter's procedencia is `'FALTANTE'`. Task 7 (`index.js`) passes `procedencia` as the 3rd argument.

- [ ] **Step 1: Write the failing test**

Append to `test/validacion.test.js`:

```js
// append to test/validacion.test.js
test('degradante FALTANTE -> aviso obligatorio "datos_faltantes_en_cero" con nombres', () => {
  const ctx = ctxDe({ producto: { costoUnitario: 37500 }, supuestos: { fleteIda: 20000 }, mercado: { costoConversacion: 4000 } });
  const procedencia = { comisionRecaudoPct: 'FALTANTE', empaquePorPedido: 'FALTANTE' };
  const av = revisar(ctx, [{ n: 1, ingreso: 100000 }], procedencia);
  const f = av.find((a) => a.codigo === 'datos_faltantes_en_cero');
  assert.ok(f, 'debe emitir el aviso');
  assert.equal(f.nivel, 'aviso');
  assert.match(f.mensaje, /comisionRecaudoPct/);
  assert.match(f.mensaje, /empaquePorPedido/);
});

test('sin procedencia (llamada de 2 args, compatibilidad hacia atrás) no lanza y no avisa de faltantes', () => {
  const ctx = ctxDe({ producto: { costoUnitario: 37500 }, supuestos: { fleteIda: 20000 }, mercado: { costoConversacion: 4000 } });
  const av = revisar(ctx, [{ n: 1, ingreso: 100000 }]);
  assert.ok(!av.some((a) => a.codigo === 'datos_faltantes_en_cero'));
});

test('todo REAL/SUPUESTO (sin FALTANTE) -> no dispara el aviso', () => {
  const ctx = ctxDe({ producto: { costoUnitario: 37500 }, supuestos: { fleteIda: 20000 }, mercado: { costoConversacion: 4000 } });
  const procedencia = { comisionRecaudoPct: 'SUPUESTO', costoUnitario: 'REAL' };
  const av = revisar(ctx, [{ n: 1, ingreso: 100000 }], procedencia);
  assert.ok(!av.some((a) => a.codigo === 'datos_faltantes_en_cero'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/validacion.test.js`
Expected: FAIL — the new aviso is never emitted (3rd arg is ignored/doesn't exist yet).

- [ ] **Step 3: Modify the implementation**

Replace the full contents of `src/validacion.js`:

```js
// src/validacion.js
import { aviso } from './util.js';

// Parámetros "degradantes" de §A.4.1: si faltan, el motor los calcula como 0
// y SIEMPRE avisa — nunca en silencio.
const DEGRADANTES = [
  'fleteDevolucion', 'feeDevolucion', 'pctProductoPerdidoEnDevolucion',
  'comisionRecaudoPct', 'comisionRecaudoFijo', 'empaquePorPedido', 'costoAtencionConversacion',
];

/** Chequeos estáticos sobre el ctx y los combos ya armados. */
export function revisar(ctx, combos, procedencia = {}) {
  const avisos = [];

  if (!(ctx.costoUnitario > 0)) {
    avisos.push(aviso('costo_faltante', 'error', 'Falta el costo del producto.'));
  }

  for (const c of combos) {
    if (c.ingreso != null && c.ingreso < ctx.costoUnitario * c.n + ctx.fleteIda) {
      avisos.push(aviso('precio_bajo_costo', 'error', `El precio del combo de ${c.n} no cubre producto + flete.`));
      break;
    }
  }

  // Solo los términos específicos de la devolución (NO fleteIda, que se paga siempre):
  // un negocio con flete de ida pero sin flete/fee de devolución modelado igual tiene riesgo.
  const riesgoDevolucion = ctx.fleteDevolucion + ctx.feeDevolucion
    + ctx.pctProductoPerdidoEnDevolucion * ctx.costoUnitario;
  if (riesgoDevolucion === 0) {
    avisos.push(aviso('devolucion_sin_costo', 'aviso', 'No se modeló ningún costo de devolución; la contraentrega parece sin riesgo.'));
  }

  if (ctx.costoConversacion <= 0) {
    avisos.push(aviso('sin_pauta', 'aviso', 'Sin costo por conversación: no se puede evaluar CAC ni la proyección.'));
  }

  const porUnidad = combos.filter((c) => c.ingreso != null).map((c) => c.ingreso / c.n);
  for (let i = 1; i < porUnidad.length; i++) {
    if (porUnidad[i] > porUnidad[i - 1] + 1e-6) {
      avisos.push(aviso('escalera_incoherente', 'aviso', 'Un combo mayor cuesta por unidad más que uno menor.'));
      break;
    }
  }

  const faltantes = DEGRADANTES.filter((k) => procedencia[k] === 'FALTANTE');
  if (faltantes.length > 0) {
    avisos.push(aviso(
      'datos_faltantes_en_cero',
      'aviso',
      `${faltantes.length} dato(s) faltante(s) se asumieron en $0 (${faltantes.join(', ')}); el precio recomendado es un piso, el real será mayor.`,
    ));
  }

  return avisos;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/validacion.test.js`
Expected: PASS (all original tests + the 3 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/validacion.js test/validacion.test.js
git commit -m "feat(v2): mandatory aviso when a degradable parameter is assumed \$0

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: `src/rentabilidad.js` (`margenOperativo`) + `src/recomendacion.js` (the 8-state resolver)

**Files:**
- Modify: `src/rentabilidad.js`
- Create: `src/recomendacion.js`
- Test: `test/rentabilidad.test.js` (extend — read the file first, it already exists; add the block below to it), `test/recomendacion.test.js` (new)

**Interfaces:**
- Consumes: `CLAVES_ECONOMICAS`, `PARAMS_ECONOMICOS` from `src/procedencia.js` (Task 1); `ctx.objetivo.regla` from Task 2; `combos[0]` shape (unchanged) and `rent.margenOperativo` (new, this task) from `src/rentabilidad.js`/`src/combos.js`; `publicidad.disponible` (unchanged, from `src/publicidad.js`).
- Produces: `crearRentabilidad(...)` return object gains `margenOperativo(n, precio) => number|null`. `construirRecomendacion(ctx, procedencia, combo1, rent, publicidad) => Recomendacion` (the exact shape in `docs/diseno-v2.md` §A.5's `recomendacion` block: `{ estado, precio, precioCrudo, tipoMargen, margenObjetivo, margenLogrado, utilidadPorVentaEntregada, confianza: {supuestos, faltantesAsumidosCero, cacDisponible}, avisos }`, plus a `parametroFaltante` key set only for `no_calculable`). Task 7 (`index.js`) calls `construirRecomendacion` and merges its `avisos` into the global list.

- [ ] **Step 1: Write the failing test — `margenOperativo`**

Append to `test/rentabilidad.test.js` (read the existing file first so the new block matches its `mod()`/fixture helper style before pasting):

```js
// append to test/rentabilidad.test.js
test('margenOperativo(n,P) = utilidadPorVentaEntregada(n,P) / P', () => {
  const { rent } = mod(); // usa el helper ya existente en este archivo
  const precio = 120100;
  const esperado = rent.utilidadPorVentaEntregada(1, precio) / precio;
  assert.ok(Math.abs(rent.margenOperativo(1, precio) - esperado) < 1e-9);
});

test('margenOperativo: precio <= 0 -> null', () => {
  const { rent } = mod();
  assert.equal(rent.margenOperativo(1, 0), null);
});

test('margenOperativo NO depende de si hay CAC (a diferencia de margen.neto)', () => {
  const conPauta = mod({ mercado: { costoConversacion: 4000 } }).rent;
  const sinPauta = mod({ mercado: { costoConversacion: 0 } }).rent;
  assert.ok(Math.abs(conPauta.margenOperativo(1, 120100) - sinPauta.margenOperativo(1, 120100)) < 1e-9);
});
```

> If `test/rentabilidad.test.js`'s existing `mod()` helper doesn't accept an `over` argument the way `test/equilibrio.test.js`'s does, adjust the 3 snippets above to call whatever helper/fixture pattern the file already uses — the assertions are what matter, not the exact fixture plumbing.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/rentabilidad.test.js`
Expected: FAIL — `rent.margenOperativo is not a function`

- [ ] **Step 3: Add `margenOperativo` to `src/rentabilidad.js`**

In `src/rentabilidad.js`, add right after `margen`:

```js
  const margenOperativo = (n, precio) => {
    if (!(precio > 0)) return null;
    return utilidadPorVentaEntregada(n, precio) / precio;
  };
```

And add it to the returned object:

```js
  return { brutoPorPedido, utilidadPorPedido, utilidadPorVentaEntregada, utilidadFinal, margen, margenOperativo, markup, cac };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/rentabilidad.test.js`
Expected: PASS

- [ ] **Step 5: Write the failing test — `construirRecomendacion`**

```js
// test/recomendacion.test.js
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
  return construirRecomendacion(ctx, procedencia, combo, rent, publicidad);
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
```

- [ ] **Step 6: Run test to verify it fails**

Run: `node --test test/recomendacion.test.js`
Expected: FAIL — `Cannot find module '../src/recomendacion.js'`

- [ ] **Step 7: Write the implementation**

```js
// src/recomendacion.js
import { CLAVES_ECONOMICAS } from './procedencia.js';
import { aviso } from './util.js';

function vacia(estado, avisosRec, procedencia, cacDisponible, parametroFaltante) {
  return {
    estado, precio: null, precioCrudo: null,
    tipoMargen: cacDisponible ? 'neto' : 'operativo',
    margenObjetivo: null, margenLogrado: null, utilidadPorVentaEntregada: null,
    confianza: { supuestos: [], faltantesAsumidosCero: [], cacDisponible },
    avisos: avisosRec,
    ...(parametroFaltante ? { parametroFaltante } : {}),
  };
}

/**
 * Aplica el flujo de decisión de §A.7: hasta 4 chequeos que bloquean el precio
 * (nunca lo calculan "por si acaso"), y solo después clasifica ok_*/estimacion_*
 * según cuántos parámetros no son REAL. `combo1` ya viene evaluado por
 * `crearCombos(...).evaluarCombo(1)` — este módulo no vuelve a calcular precios,
 * solo decide si ese número se puede mostrar como recomendación y con qué estado.
 */
export function construirRecomendacion(ctx, procedencia, combo1, rent, publicidad) {
  const cacDisponible = publicidad.disponible;
  const regla = ctx.objetivo.regla;

  if (procedencia.costoUnitario === 'FALTANTE') {
    return vacia('sin_costo', [aviso('sin_costo', 'error', 'Falta el costo del proveedor para poder calcular un precio.')], procedencia, cacDisponible);
  }
  if (regla == null || regla.valor == null) {
    return vacia('sin_objetivo', [aviso('sin_objetivo', 'error', 'Elegí el margen que querés ganar para calcular un precio.')], procedencia, cacDisponible);
  }
  if (procedencia.fleteIda === 'FALTANTE') {
    return vacia('no_calculable', [aviso('no_calculable', 'error', 'Falta el flete de ida: sin ese dato no se puede calcular el colchón de devoluciones ni un precio confiable.')], procedencia, cacDisponible, 'fleteIda');
  }
  if (regla.tipo === 'margen_neto' && (1 - ctx.comisionRecaudoPct - regla.valor) <= 0) {
    const qPct = Math.round(ctx.comisionRecaudoPct * 100);
    const mPct = Math.round(regla.valor * 100);
    return vacia('no_alcanzable', [aviso('no_alcanzable', 'error', `Un margen del ${mPct}% no es posible con una comisión de recaudo del ${qPct}%.`)], procedencia, cacDisponible);
  }

  const tipoMargen = cacDisponible ? 'neto' : 'operativo';
  const margenLogrado = cacDisponible ? combo1.margen.neto : rent.margenOperativo(1, combo1.ingreso);
  const margenObjetivo = regla.tipo === 'margen_neto' ? regla.valor : null;

  const supuestos = CLAVES_ECONOMICAS.filter((k) => procedencia[k] === 'SUPUESTO');
  const faltantesAsumidosCero = CLAVES_ECONOMICAS.filter((k) => procedencia[k] === 'FALTANTE');
  const todoReal = CLAVES_ECONOMICAS.every((k) => procedencia[k] === 'REAL');

  const esEstimacion = regla.tipo === 'markup' || !todoReal;
  const estado = (esEstimacion ? 'estimacion_' : 'ok_') + (cacDisponible ? 'neto' : 'bruto');

  const avisosRec = [];
  if (regla.tipo === 'margen_neto' && regla.valor === 0) {
    avisosRec.push(aviso('margen_cero', 'aviso', 'El margen objetivo es 0%: este precio recupera costos pero no deja utilidad.'));
  }

  return {
    estado,
    precio: combo1.ingreso,
    precioCrudo: combo1.precioSugerido === combo1.ingreso ? combo1.precioSugerido : combo1.precioSugerido, // ver nota
    tipoMargen, margenObjetivo, margenLogrado,
    utilidadPorVentaEntregada: combo1.utilidad.porVentaEntregada,
    confianza: { supuestos, faltantesAsumidosCero, cacDisponible },
    avisos: avisosRec,
  };
}
```

> **Note on `precioCrudo` in the return above:** `combo1` (from `evaluarCombo`) does not carry the *unrounded* crudo value as a field — only `precioSugerido` (rounded) and `ingreso` (rounded, possibly overridden by `escaleraPrecios`). Fix this before running the test: change the line to call the combos module's own `precioCrudo(1)` function directly. Update the call site instead — **`construirRecomendacion` needs a 5th parameter**, `precioCrudoDe1`, a plain number (or `null`) that the caller (Task 7, `index.js`) computes once via `combosMod.precioCrudo(1)` and passes in. Apply this fix now:
>
> Change the function signature to:
> ```js
> export function construirRecomendacion(ctx, procedencia, combo1, rent, publicidad, precioCrudoDe1) {
> ```
> and change the return line to:
> ```js
>     precio: combo1.ingreso,
>     precioCrudo: precioCrudoDe1,
> ```
> Update `test/recomendacion.test.js`'s `recomendacionDe()` helper to compute and pass it:
> ```js
>   const precioCrudo1 = combosMod.precioCrudo(1);
>   return construirRecomendacion(ctx, procedencia, combo, rent, publicidad, precioCrudo1);
> ```

- [ ] **Step 8: Run test to verify it passes**

Run: `node --test test/recomendacion.test.js`
Expected: PASS (all 9 tests)

- [ ] **Step 9: Commit**

```bash
git add src/rentabilidad.js src/recomendacion.js test/rentabilidad.test.js test/recomendacion.test.js
git commit -m "feat(v2): margenOperativo + the 8-state recomendacion resolver

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: `src/index.js` — wire `procedencia` + `recomendacion` + `precioMinimoOperativo` into `analizar()`

**Files:**
- Modify: `src/index.js`
- Test: `test/analizar.test.js` (fix the 2 fixtures that used `objetivo.utilidadObjetivo`), `test/identidades.test.js` (fix `BASE` the same way; regenerate the snapshot fixture)

**Interfaces:**
- Consumes: `construirRecomendacion` (Task 6), `procedencia` from `normalizarEntrada` (Task 2), `eq.precioMinimoOperativo` (Task 4), `revisar(ctx, combos, procedencia)` (Task 5).
- Produces: `analizar(entrada, opts)` return value gains two top-level keys, `procedencia` (now also carrying two derived entries, `procedencia.cac` and `procedencia.precioRecomendado`, each the worst state among their inputs per §A.5) and `recomendacion`, and `resultado.equilibrio` gains `precioMinimoOperativo` (array, same shape as `precioMinimo`). This is the full `Resultado` contract of `docs/diseno-v2.md` §A.5 that Plan 2 (UI) will consume.

- [ ] **Step 1: Update the two broken test fixtures first**

In `test/analizar.test.js`, `test/identidades.test.js`, and `test/identidades.snapshot-util.mjs` (read it first — it likely exports `ENTRADA_SNAPSHOT` built the same way), every `BASE`/`DEFAULTS_HTML`/`ENTRADA_SNAPSHOT` fixture currently has:

```js
  objetivo: { modo: 'sugerir', utilidadObjetivo: 40000 },
```

Change every one of these to:

```js
  objetivo: { modo: 'sugerir', regla: { tipo: 'utilidad_fija', valor: 40000 } },
```

This keeps every existing exact-number assertion in `test/analizar.test.js` valid (same formula, same numbers, just addressed through the new `regla` field) — you are not changing what's being tested, only how the same test expresses "I want $40.000 of fixed profit."

- [ ] **Step 2: Run the affected files to see what's still failing**

Run: `node --test test/analizar.test.js test/identidades.test.js`
Expected: `test/analizar.test.js` now passes (it only reads `r.combos`/`r.avisos`/`r.equilibrio`/`r.proyeccion`, none of which changed shape). `test/identidades.test.js`'s snapshot test still fails — the snapshot file itself is stale (Step 5 regenerates it). `test/identidades.test.js`'s other 4 tests (identity, precioMinimo=0 utility, HTML-compat, monotonicity) should now pass too, since they also only read pre-existing fields.

- [ ] **Step 3: Modify `src/index.js`**

```js
// src/index.js
import { normalizarEntrada, DEFAULTS } from './normalizar.js';
import { crearCostos } from './costos.js';
import { crearPublicidad } from './publicidad.js';
import { crearRentabilidad } from './rentabilidad.js';
import { crearCombos } from './combos.js';
import { crearEquilibrio } from './equilibrio.js';
import { revisar } from './validacion.js';
import { construirRecomendacion } from './recomendacion.js';
import { peorEstado, CLAVES_ECONOMICAS } from './procedencia.js';
import { sensibilidadUnaVariable, tornado, matrizEntregaCierre, VARIABLES } from './escenarios.js';
import { aviso } from './util.js';

// precioRecomendado hereda el peor estado de todo lo que participa en su fórmula
// (§A.6/§A.7) — costosFijosMes/diasOperacionMes son "diagnóstico" (§A.4.1): no
// entran en el precio, así que no degradan su procedencia.
const CLAVES_QUE_AFECTAN_EL_PRECIO = CLAVES_ECONOMICAS.filter((k) => k !== 'costosFijosMes' && k !== 'diasOperacionMes');

export { normalizarEntrada, DEFAULTS };

function elegirMejorCombo(combos) {
  const conFinal = combos.filter((c) => c.utilidad.final != null);
  const pool = conFinal.length ? conFinal : combos;
  const clave = conFinal.length ? 'final' : 'porVentaEntregada';
  const mejor = pool.reduce((a, b) => (b.utilidad[clave] > a.utilidad[clave] ? b : a));
  const criterio = conFinal.length
    ? 'mayor utilidad limpia por venta entregada'
    : 'mayor utilidad por venta entregada (sin descontar pauta)';
  return { n: mejor.n, criterio };
}

function calcularProyeccion(ctx, combos, rent) {
  const {
    costoConversacion: cc, costoAtencionConversacion: ca, tasaCierre: k, tasaEntrega: t,
    presupuestoDia: B, costosFijosMes, diasOperacionMes, mezcla,
  } = ctx;

  if (!(cc > 0)) {
    return { pedidosDia: 0, ventasEntregadasDia: 0, utilidadDia: null, utilidadMes: null };
  }
  if (!(B > 0)) {
    const fijoDia = costosFijosMes / diasOperacionMes;
    return {
      pedidosDia: 0, ventasEntregadasDia: 0,
      utilidadDia: -fijoDia, utilidadMes: -fijoDia * diasOperacionMes,
    };
  }

  const conversacionesDia = B / cc;
  const pedidosDia = conversacionesDia * k;
  const ventasEntregadasDia = pedidosDia * t;
  const uPPpond = combos.reduce((acc, c) => acc + (mezcla[c.n] ?? 0) * rent.utilidadPorPedido(c.n, c.ingreso), 0);
  const utilidadDia = pedidosDia * uPPpond - B - conversacionesDia * ca - costosFijosMes / diasOperacionMes;
  return { pedidosDia, ventasEntregadasDia, utilidadDia, utilidadMes: utilidadDia * diasOperacionMes };
}

export function analizar(entrada, { conEscenarios = false } = {}) {
  const { ctx, entradaNormalizada, avisos: avisosNorm, procedencia } = normalizarEntrada(entrada);
  const avisos = [...avisosNorm];

  const costos = crearCostos(ctx);
  const publicidad = crearPublicidad(ctx);
  const rent = crearRentabilidad(ctx, costos, publicidad);
  const combosMod = crearCombos(ctx, costos, rent);
  const eq = crearEquilibrio(ctx, costos, rent, publicidad);

  const combos = [];
  for (const n of [1, 2, 3]) {
    const { combo, avisos: av } = combosMod.evaluarCombo(n);
    combo.roas = {
      actual: publicidad.roasActual(combo.ingreso),
      equilibrio: eq.roasMinimo(n, combo.ingreso),
    };
    combo.descuentoMaximoPct = eq.descuentoMaximoPct(n, combo.ingreso);
    combos.push(combo);
    avisos.push(...av);
  }

  avisos.push(...revisar(ctx, combos, procedencia));

  const precioCrudoDe1 = combosMod.precioCrudo(1);
  const recomendacion = construirRecomendacion(ctx, procedencia, combos[0], rent, publicidad, precioCrudoDe1);
  avisos.push(...recomendacion.avisos);

  // §A.5: "procedencia de un derivado = el peor estado entre sus insumos" — cac y
  // el precio recomendado son los dos derivados que el spec pide exponer por nombre.
  procedencia.cac = peorEstado(procedencia.costoConversacion, procedencia.costoAtencionConversacion);
  procedencia.precioRecomendado = peorEstado(...CLAVES_QUE_AFECTAN_EL_PRECIO.map((k) => procedencia[k]));

  const ing1 = combos[0].ingreso;
  const equilibrio = {
    precioMinimo: combos.map((c) => ({ n: c.n, valor: eq.precioMinimo(c.n) })),
    precioMinimoOperativo: combos.map((c) => ({ n: c.n, valor: eq.precioMinimoOperativo(c.n) })),
    tasaEntregaMinima: eq.tasaEntregaMinima(1, ing1),
    tasaCierreMinima: eq.tasaCierreMinima(1, ing1),
    costoConversacionMaximo: eq.costoConversacionMaximo(1, ing1),
    roasMinimo: eq.roasMinimo(1, ing1),
    unidadesDiaParaFijos: eq.unidadesDiaParaFijos(combos, ctx.mezcla),
  };

  const equilibrioNulos =
    equilibrio.precioMinimo.some((p) => p.valor == null)
    || equilibrio.roasMinimo == null
    || equilibrio.unidadesDiaParaFijos == null
    || (publicidad.disponible
      && [equilibrio.tasaEntregaMinima, equilibrio.tasaCierreMinima, equilibrio.costoConversacionMaximo]
        .some((v) => v == null));
  if (equilibrioNulos) {
    avisos.push(aviso('equilibrio_inalcanzable', 'aviso', 'Algún punto de equilibrio quedó fuera de rango.'));
  }

  const proyeccion = calcularProyeccion(ctx, combos, rent);
  const mejorCombo = elegirMejorCombo(combos);

  let escenarios = null;
  if (conEscenarios) {
    const A = (e) => analizar(e, { conEscenarios: false });
    escenarios = {
      sensibilidad: Object.fromEntries(VARIABLES.map((v) => [v, sensibilidadUnaVariable(entradaNormalizada, v, A)])),
      tornado: tornado(entradaNormalizada, A),
      matrizEntregaCierre: matrizEntregaCierre(entradaNormalizada, A),
    };
  }

  return { entradaNormalizada, procedencia, avisos, combos, mejorCombo, equilibrio, recomendacion, proyeccion, escenarios };
}
```

- [ ] **Step 4: Run the affected files again**

Run: `node --test test/analizar.test.js`
Expected: PASS (unchanged assertions; new keys on the result don't break `deepEqual`/property-presence checks since none of them assert an exhaustive key list).

- [ ] **Step 4b: Add end-to-end coverage for the two gaps a spec self-review found — derived provenance and the degradante aviso actually reaching `analizar()`'s output**

Append to `test/analizar.test.js`:

```js
// append to test/analizar.test.js
test('procedencia.cac hereda el peor estado entre costoConversacion y costoAtencionConversacion', () => {
  const r = analizar({ ...DEFAULTS_HTML, mercado: { ...DEFAULTS_HTML.mercado, costoConversacion: 4000 }, procedencia: { costoConversacion: 'REAL', costoAtencionConversacion: 'FALTANTE' } });
  assert.equal(r.procedencia.cac, 'FALTANTE');
});

test('procedencia.precioRecomendado hereda el peor estado de todo lo que afecta el precio', () => {
  const rTodoReal = analizar({
    producto: { costoUnitario: 37500 },
    supuestos: { fleteIda: 20000, fleteDevolucion: 0, feeDevolucion: 0, pctProductoPerdidoEnDevolucion: 0, comisionRecaudoPct: 0, comisionRecaudoFijo: 0, empaquePorPedido: 0, costoAtencionConversacion: 0 },
    mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 },
    procedencia: {
      costoUnitario: 'REAL', fleteIda: 'REAL', fleteDevolucion: 'REAL', feeDevolucion: 'REAL',
      pctProductoPerdidoEnDevolucion: 'REAL', comisionRecaudoPct: 'REAL', comisionRecaudoFijo: 'REAL',
      empaquePorPedido: 'REAL', costoAtencionConversacion: 'REAL', tasaEntrega: 'REAL', tasaCierre: 'REAL', costoConversacion: 'REAL',
    },
  });
  assert.equal(rTodoReal.procedencia.precioRecomendado, 'REAL');
  // costosFijosMes/diasOperacionMes NO participan del precio: quedar FALTANTE ahí no debe degradar precioRecomendado.
  const rSoloFijosFaltantes = analizar({
    ...DEFAULTS_HTML,
    procedencia: { costoUnitario: 'REAL', fleteIda: 'REAL', tasaEntrega: 'REAL', tasaCierre: 'REAL', costoConversacion: 'REAL' },
  });
  // el resto de económicas ni siquiera se pasó -> siguen SUPUESTO/FALTANTE por inferencia, así que
  // esta entrada de por sí no queda "todo real"; se usa solo para confirmar que el campo existe y es un estado válido.
  assert.ok(['REAL', 'SUPUESTO', 'FALTANTE'].includes(rSoloFijosFaltantes.procedencia.precioRecomendado));
});

test('degradante FALTANTE llega hasta analizar(): aviso datos_faltantes_en_cero presente en resultado.avisos', () => {
  const r = analizar({
    producto: { costoUnitario: 37500 },
    supuestos: { fleteIda: 20000 }, // comisionRecaudoPct, empaquePorPedido, etc. ni se mencionan -> FALTANTE por inferencia
    mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 },
  });
  const f = r.avisos.find((a) => a.codigo === 'datos_faltantes_en_cero');
  assert.ok(f, 'el aviso debe llegar hasta el resultado final de analizar()');
  assert.match(f.mensaje, /comisionRecaudoPct/);
});
```

Run: `node --test test/analizar.test.js`
Expected: PASS (all original + these 3 new tests).

- [ ] **Step 5: Regenerate the snapshot fixture**

Read `scripts/generar-snapshot.mjs` first to confirm it writes `test/fixtures/snapshot-defaults-html.json` from the same `ENTRADA_SNAPSHOT` used by `test/identidades.test.js` (it should, per the file's own comment "snapshot de regresión: Resultado para los defaults del HTML"). Then:

```bash
npm run snapshot
git diff test/fixtures/snapshot-defaults-html.json
```

Confirm the diff **only** adds: a top-level `procedencia` object, a top-level `recomendacion` object, and a `precioMinimoOperativo` array inside `equilibrio` — and does not change any pre-existing number (if a pre-existing number changed, something in Tasks 1-7 altered behavior it shouldn't have; stop and investigate before continuing).

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: **all tests pass.**

- [ ] **Step 7: Commit**

```bash
git add src/index.js test/analizar.test.js test/identidades.test.js test/identidades.snapshot-util.mjs test/fixtures/snapshot-defaults-html.json
git commit -m "feat(v2): wire procedencia + recomendacion + precioMinimoOperativo into analizar()

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Identity test — `docs/diseno-v2.md` §A.11, verbatim, as an automated regression

**Files:**
- Create: `test/identidad-margen-neto.test.js`

**Interfaces:**
- Consumes: `analizar` from `src/index.js` (Task 7).
- Produces: nothing consumed by later tasks — this is a leaf regression test that encodes the spec's own worked numeric example so a future change to the formula (accidental or not) is caught immediately.

**Note on the exact numbers below:** they are computed from the *actual* `redondear()` algorithm already in `src/redondeo.js` (granularidad 1000 / terminación 900 / dirección "arriba"), not by eyeballing "round to the nearest hundred." Trust these over anything in the V2 wireframe artifact shown during design review — that wireframe used a hand-approximated rounding rule for two combo/sensitivity rows and is cosmetic only; it was never meant to be numerically authoritative.

- [ ] **Step 1: Write the test (it should already pass — this task is regression-only, not TDD-red-first)**

```js
// test/identidad-margen-neto.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizar } from '../src/index.js';

const cerca = (a, b, eps) => Math.abs(a - b) < eps;

// Fixture de §A.11: C=24000, Fi=Fd=20000, fd=0, rho=0, q=5%, Q=0, E=0,
// t=75%, k=20%, cc=4000, ca=0, m=25%.
const FIXTURE = {
  producto: { costoUnitario: 24000 },
  supuestos: { fleteIda: 20000, fleteDevolucion: 20000, comisionRecaudoPct: 0.05 },
  mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 },
  objetivo: { regla: { tipo: 'margen_neto', valor: 0.25 } },
};

test('§A.11 con CAC: P_crudo(1) = 120000.00 exacto; margenNeto(1, P_crudo) = 25.00% exacto', () => {
  const r = analizar(FIXTURE);
  assert.ok(cerca(r.recomendacion.precioCrudo, 120000, 1e-6));
  assert.ok(cerca(r.recomendacion.margenObjetivo, 0.25, 1e-9));
  // margenNeto evaluado en el crudo (no en el redondeado): reconstruido a mano
  // con la misma fórmula de §A.6, para no acoplar el test a un campo interno.
  const K0_1 = 24000 + 20000 + (0.25 / 0.75) * (20000 + 20000);
  const cac = 4000 / (0.20 * 0.75);
  const margenNetoEnCrudo = (r.recomendacion.precioCrudo * (1 - 0.05) - K0_1 - cac) / r.recomendacion.precioCrudo;
  assert.ok(cerca(margenNetoEnCrudo, 0.25, 1e-9));
});

test('§A.11 con CAC: precio redondeado = $120.100; margenNeto logrado >= 25% (25.058%)', () => {
  const r = analizar(FIXTURE);
  assert.equal(r.recomendacion.precio, 120100);
  assert.ok(r.recomendacion.margenLogrado >= 0.25 - 1e-9);
  assert.ok(cerca(r.recomendacion.margenLogrado, 0.25058, 1e-4));
  assert.equal(r.recomendacion.tipoMargen, 'neto');
});

test('§A.11 sin CAC (cc=0): P_crudo=81904.76, precio=$82.100, margenOperativo=25.00% exacto en el crudo', () => {
  const sinCac = { ...FIXTURE, mercado: { ...FIXTURE.mercado, costoConversacion: 0 } };
  const r = analizar(sinCac);
  assert.ok(cerca(r.recomendacion.precioCrudo, 81904.7619, 1e-2));
  assert.equal(r.recomendacion.precio, 82100);
  assert.equal(r.recomendacion.tipoMargen, 'operativo');
  const K0_1 = 24000 + 20000 + (0.25 / 0.75) * (20000 + 20000);
  const margenOperativoEnCrudo = (r.recomendacion.precioCrudo * (1 - 0.05) - K0_1) / r.recomendacion.precioCrudo;
  assert.ok(cerca(margenOperativoEnCrudo, 0.25, 1e-9));
  assert.match(r.recomendacion.estado, /^estimacion_bruto|ok_bruto$/);
});

test('§A.11 combos n=2,3: el mismo % de margen neto se reproduce exacto (identidad, no solo n=1)', () => {
  const r = analizar(FIXTURE);
  for (const n of [2, 3]) {
    const combo = r.combos.find((c) => c.n === n);
    assert.ok(cerca(combo.margen.neto, 0.25, 1e-9), `n=${n} margen=${combo.margen.neto}`);
  }
});

test('§A.11 sensibilidad de t: P_crudo(65%) > P_crudo(75%) > P_crudo(85%) (monotonía)', () => {
  const t65 = analizar({ ...FIXTURE, mercado: { ...FIXTURE.mercado, tasaEntrega: 0.65 } }).recomendacion.precioCrudo;
  const t75 = analizar(FIXTURE).recomendacion.precioCrudo;
  const t85 = analizar({ ...FIXTURE, mercado: { ...FIXTURE.mercado, tasaEntrega: 0.85 } }).recomendacion.precioCrudo;
  assert.ok(t65 > t75);
  assert.ok(t75 > t85);
});

test('§A.11 sensibilidad de t: precios redondeados esperados exactos (65%/75%/85%)', () => {
  const precioA = (t) => analizar({ ...FIXTURE, mercado: { ...FIXTURE.mercado, tasaEntrega: t } }).recomendacion.precio;
  assert.equal(precioA(0.65), 138100);
  assert.equal(precioA(0.75), 120100);
  assert.equal(precioA(0.85), 107100);
});
```

- [ ] **Step 2: Run it**

Run: `node --test test/identidad-margen-neto.test.js`
Expected: PASS (all 6 tests). If any of the hardcoded numbers (`138100`, `107100`, `81904.7619`, `0.25058`) don't match, do not "fix" the test by changing the number — first re-derive it by hand from the formulas in `docs/diseno-v2.md` §A.6/§A.7 and `src/redondeo.js`'s actual algorithm; a mismatch here means Task 3, 6, or 7 has a bug, since these numbers were independently verified against both the spec's own worked example and the real `redondear()` implementation while writing this plan.

- [ ] **Step 3: Commit**

```bash
git add test/identidad-margen-neto.test.js
git commit -m "test(v2): automate the §A.11 identity proof (margen_neto, with and without CAC)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: The 8 recommendation states — one fixture each

**Files:**
- Create: `test/recomendacion-8-estados.test.js`

**Interfaces:**
- Consumes: `analizar` from `src/index.js` (Task 7).
- Produces: nothing consumed by later tasks — leaf regression test satisfying `docs/diseno-v2.md`'s "Pruebas (resumen)" §"Estados (A.7)" requirement in one place, so a future reviewer can see all 8 states side by side.

- [ ] **Step 1: Write the test**

```js
// test/recomendacion-8-estados.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizar } from '../src/index.js';

const BASE_REAL_TODO = {
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

test('sin_costo: costoUnitario ausente', () => {
  const r = analizar({ mercado: { costoConversacion: 4000 } });
  assert.equal(r.recomendacion.estado, 'sin_costo');
  assert.equal(r.recomendacion.precio, null);
});

test('sin_objetivo: regla.valor null', () => {
  const r = analizar({ producto: { costoUnitario: 24000 }, objetivo: { regla: { tipo: 'margen_neto', valor: null } } });
  assert.equal(r.recomendacion.estado, 'sin_objetivo');
  assert.equal(r.recomendacion.precio, null);
});

test('no_calculable: fleteIda FALTANTE', () => {
  const r = analizar({ producto: { costoUnitario: 24000 }, supuestos: { fleteIda: null } });
  assert.equal(r.recomendacion.estado, 'no_calculable');
  assert.equal(r.recomendacion.precio, null);
  assert.equal(r.recomendacion.parametroFaltante, 'fleteIda');
});

test('no_alcanzable: comisión de recaudo + margen suman >= 100%', () => {
  const r = analizar({ producto: { costoUnitario: 24000 }, supuestos: { fleteIda: 20000, comisionRecaudoPct: 0.80 }, objetivo: { regla: { tipo: 'margen_neto', valor: 0.25 } } });
  assert.equal(r.recomendacion.estado, 'no_alcanzable');
  assert.equal(r.recomendacion.precio, null);
});

test('ok_neto: todo REAL, CAC disponible', () => {
  const r = analizar(BASE_REAL_TODO);
  assert.equal(r.recomendacion.estado, 'ok_neto');
  assert.ok(r.recomendacion.precio > 0);
});

test('estimacion_neto: CAC disponible, algo no REAL', () => {
  const r = analizar({ producto: { costoUnitario: 24000 }, procedencia: { costoUnitario: 'REAL' }, supuestos: { fleteIda: 20000, fleteDevolucion: 20000, comisionRecaudoPct: 0.05 }, mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 } });
  assert.equal(r.recomendacion.estado, 'estimacion_neto');
});

test('ok_bruto: todo REAL, sin CAC (costoConversacion=0)', () => {
  const r = analizar({ ...BASE_REAL_TODO, mercado: { ...BASE_REAL_TODO.mercado, costoConversacion: 0 } });
  assert.equal(r.recomendacion.estado, 'ok_bruto');
});

test('estimacion_bruto: sin CAC, algo no REAL', () => {
  const r = analizar({ producto: { costoUnitario: 24000 }, procedencia: { costoUnitario: 'REAL' }, supuestos: { fleteIda: 20000, fleteDevolucion: 20000, comisionRecaudoPct: 0.05 }, mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 0 } });
  assert.equal(r.recomendacion.estado, 'estimacion_bruto');
});
```

- [ ] **Step 2: Run it**

Run: `node --test test/recomendacion-8-estados.test.js`
Expected: PASS (all 8 tests — one per state).

- [ ] **Step 3: Commit**

```bash
git add test/recomendacion-8-estados.test.js
git commit -m "test(v2): one fixture per recommendation state (all 8)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Deferred, on purpose (not gaps — noted so nobody "fixes" them by accident)

- **`criticidadDevoluciones: 'estricta'`** (§A.4.1's "Opción de rigor"): would make `F_d`/`f_d`/`ρ`/`q`/`E` FALTANTE also produce `no_calculable` instead of degrading with an aviso. The spec marks this as an optional config with `'permisiva'` as the default, and V2's whole point is to be usable in Etapa 1 with almost no real data — so the default (implemented here) is `'permisiva'`, and `'estricta'` is not built. If the business ever wants it, it's a small addition to `recomendacion.js`'s early-return chain.
- **"Solo C → estimación con 7 FALTANTE" (§A.12, first row):** with a truly bare `entrada` (only `producto.costoUnitario`), this plan's engine correctly returns `no_calculable` (because `fleteIda` is FALTANTE too) — not `estimacion_neto` as that row's parenthetical seems to suggest. Re-reading the row, it's describing what happens once **the UI's JDSMPlus profile** (Plan 2, `ui/perfil.js`) has already pre-filled `fleteIda`/`tasaEntrega`/`tasaCierre`/`costoConversacion` as SUPUESTO defaults before the engine ever sees the entrada — a UI-plan responsibility, not a Motor-plan one. The engine's behavior on a genuinely bare entrada (`no_calculable`) is correct and intentional per §A.4.1's own crítico-tier rule for `Fᵢ`.
- **A richer `no_alcanzable` aviso message** ("...el mínimo para no perder es $Y"): the message built in `recomendacion.js` doesn't interpolate `precioMinimoOperativo` (threading `eq` into `construirRecomendacion` just for a string felt like scope creep for this plan). The number itself is already exposed, unconditionally, at `resultado.equilibrio.precioMinimoOperativo` — Plan 2's `no_alcanzable` hero-card copy (§B.7) should read it from there directly rather than expect it embedded in the aviso text.

---

### Task 10: Final full-suite check

- [ ] **Step 1:** Run `npm test` from the repo root. Expected: **every test file passes**, including the pre-existing ones this plan didn't touch (`test/costos.test.js`, `test/publicidad.test.js`, `test/redondeo.test.js`, `test/escenarios.test.js`, `test/formato.test.js`, `test/ui-separada.test.js`, `test/adapter-*.test.js`).
- [ ] **Step 2:** `test/adapter-*.test.js` and `test/ui-separada.test.js` are expected to still pass unmodified — this plan never touches `ui/`. If any of them fail, something in Tasks 1-9 leaked a shape change into `ui/adapter.js`'s consumption of `analizar()` in a way that broke it; investigate before declaring this plan done (the adapter's own `objetivo: { modo, utilidadObjetivo: g('utilidadObjetivo') }` in `ui/adapter.js:formToEntrada` still sends the old field name, which `normalizarEntrada` now simply ignores — harmless, since `ui/adapter.js`'s tests never assert on `regla`).
- [ ] **Step 3:** Confirm nothing under `src/` mentions `ui/`, `document`, `window`, or `localStorage` (already enforced by `test/ui-separada.test.js`, but worth a manual `grep` gut-check given how much of `src/` changed): `grep -rn "document\|window\|localStorage" src/` should return nothing.
- [ ] **Step 4:** Do not commit anything in this task — it's a verification checkpoint only.
