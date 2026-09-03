# Motor de rentabilidad — Fase 1 · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el motor puro `src/` de este repo: `analizar(entrada) → Resultado`, funciones puras sin BD/red/UI, con las fórmulas corregidas de la calculadora COD.

**Architecture:** Un `normalizarEntrada` produce un contexto (`ctx`) con defaults y clamps aplicados. Factories `crearX(ctx, deps)` cierran sobre ese `ctx` y devuelven conjuntos de funciones puras (costos, publicidad, rentabilidad, combos, equilibrio). `index.js` orquesta: normaliza → construye las factories → arma los tres combos → equilibrio → proyección → validación → escenarios → ensambla `Resultado`. Los escenarios reusan `analizar` sobre copias de la entrada, con un flag que corta la recursión.

**Tech Stack:** Node.js ≥ 22.5 ESM. Test runner nativo (`node:test` + `node:assert/strict`). Cero dependencias.

**Spec:** [`docs/diseno-fase1.md`](diseno-fase1.md) (y el «por qué» en [`docs/auditoria-calculadora-actual.md`](auditoria-calculadora-actual.md)).

## Global Constraints

- **Node ≥ 22.5.0**, ESM (`"type": "module"` ya está en `package.json`). **Cero dependencias.**
- Tests: `node --test --test-concurrency=1`, **sin `--env-file`**. Correr un archivo suelto: `node --test test/<archivo>.test.js`.
- `analizar` es **pura y total**: no lee entorno, disco ni red; un input inválido produce un aviso en `resultado.avisos`, **nunca una excepción**.
- **Plata**: los cálculos internos son `float`. `redondear()` se aplica **solo al precio sugerido final**. Los números de `Resultado` (utilidades, costos, márgenes) van **sin redondear** — redondear para mostrar es trabajo de la UI (Fase 2).
- **Clamps** (en `normalizarEntrada`): `tasaEntrega` y `tasaCierre` a `[0.01, 1]`; `comisionRecaudoPct` a `[0, 0.99]`; `pctProductoPerdidoEnDevolucion` a `[0, 1]`; `diasOperacionMes` a `[1, ∞)`; `granularidad` a `[1, ∞)`; `terminacion` a `[0, ∞)`.
- **`costoConversacion <= 0`** ⇒ `cac`, `pautaPorPedido`, `pautaPorVenta`, `roasActual`, y todo lo que dependa de ellos (`utilidad.final`, `margen.neto`, la proyección mensual) se reportan **`null`**, nunca `Infinity` ni `NaN`.
- Identificadores y comentarios **en español**. El motor **no importa de ningún otro proyecto**.
- Cada `aviso` es `{ codigo, nivel, mensaje }` con `nivel ∈ {'error','aviso'}`.

---

### Task 1: Utilidades compartidas y redondeo

**Files:**
- Create: `src/util.js`
- Create: `src/redondeo.js`
- Test: `test/redondeo.test.js`

**Interfaces:**
- Produces:
  - `src/util.js`: `num(v, def = 0) → number` (Number finito o `def`), `clamp(v, lo, hi) → number`, `aviso(codigo, nivel, mensaje) → {codigo,nivel,mensaje}`, `pesos(n) → string` (`"$1.234"`, `es-CO`).
  - `src/redondeo.js`: `redondear(v, { granularidad, terminacion, direccion }) → number`. `direccion ∈ {'arriba','cercano','abajo'}`. Resultado nunca negativo.

- [ ] **Step 1: Write the failing test**

`test/redondeo.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redondear } from '../src/redondeo.js';

const R = { granularidad: 1000, terminacion: 900, direccion: 'arriba' };

test("'arriba' garantiza precio final >= valor crudo", () => {
  // ceil(104.167)=105 -> 105000-900=104100 < 104166.67 -> sube un escalón -> 106000-900
  assert.equal(redondear(104166.67, R), 105100);
  // ceil(104)=104 -> 104000-900=103100 < 104000 -> sube -> 105000-900
  assert.equal(redondear(104000, R), 104100);
});

test("'arriba': un valor que ya termina en …900 se queda igual", () => {
  assert.equal(redondear(103100, R), 103100); // 104000-900=103100, no es < 103100
});

test('dirección cercano y abajo', () => {
  assert.equal(redondear(104400, { ...R, direccion: 'cercano' }), 103100); // round(104.4)=104
  assert.equal(redondear(104600, { ...R, direccion: 'cercano' }), 104100); // round(104.6)=105
  assert.equal(redondear(104900, { ...R, direccion: 'abajo' }), 103100);   // floor(104.9)=104
});

test('valor <= 0 devuelve 0', () => {
  assert.equal(redondear(0, R), 0);
  assert.equal(redondear(-5, R), 0);
});

test('terminación 0 = múltiplo puro hacia arriba', () => {
  assert.equal(redondear(104166.67, { granularidad: 1000, terminacion: 0, direccion: 'arriba' }), 105000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/redondeo.test.js`
Expected: FAIL — `Cannot find module '../src/redondeo.js'`.

- [ ] **Step 3: Write `src/util.js`**

```js
/** Helpers compartidos del motor. Sin dependencias. */

/** Number finito o el valor por defecto. */
export const num = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

/** Acota v al rango [lo, hi]. */
export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/** Un aviso estructurado para resultado.avisos. */
export const aviso = (codigo, nivel, mensaje) => ({ codigo, nivel, mensaje });

/** Monto en pesos colombianos para los mensajes de aviso. */
export const pesos = (n) => `$${Math.round(num(n)).toLocaleString('es-CO')}`;
```

- [ ] **Step 4: Write `src/redondeo.js`**

```js
import { num } from './util.js';

/**
 * Redondea un precio sugerido a un múltiplo de `granularidad` menos `terminacion`
 * (p.ej. precios que terminan en …900). `direccion`:
 *  - 'arriba'  (default): el precio final queda >= el valor crudo — nunca por debajo
 *                         del objetivo de utilidad, aunque haya que subir un escalón.
 *  - 'cercano': al múltiplo más próximo.
 *  - 'abajo':   al múltiplo inferior.
 * Un valor <= 0 devuelve 0.
 */
export function redondear(v, { granularidad, terminacion, direccion } = {}) {
  const g = Math.max(1, num(granularidad, 1000));
  const term = Math.max(0, num(terminacion, 900));
  const val = num(v, 0);
  if (val <= 0) return 0;

  if (direccion === 'cercano') return Math.max(0, Math.round(val / g) * g - term);
  if (direccion === 'abajo') return Math.max(0, Math.floor(val / g) * g - term);

  // 'arriba': asegura que el resultado no quede por debajo de val
  let base = Math.ceil(val / g) * g;
  if (base - term < val) base += g;
  return base - term;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/redondeo.test.js`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/util.js src/redondeo.js test/redondeo.test.js
git commit -m "feat: helpers compartidos (util) y redondeo de precio sugerido"
```

---

### Task 2: Normalización de la entrada

**Files:**
- Create: `src/normalizar.js`
- Test: `test/normalizar.test.js`

**Interfaces:**
- Consumes: `num`, `clamp`, `aviso` de `src/util.js`.
- Produces: `src/normalizar.js`:
  - `DEFAULTS` — objeto con los valores por defecto (ver spec §Entrada).
  - `normalizarEntrada(entrada = {}) → { ctx, entradaNormalizada, avisos }` donde:
    - `ctx` es plano: `{ costoUnitario, precioBase, escaleraPrecios, fleteIda, fleteDevolucion, feeDevolucion, pctProductoPerdidoEnDevolucion, comisionRecaudoPct, comisionRecaudoFijo, empaquePorPedido, costoAtencionConversacion, cesionUtilidadPorUnidadExtra, redondeo:{granularidad,terminacion,direccion}, tasaEntrega, tasaCierre, costoConversacion, presupuestoDia, costosFijosMes, diasOperacionMes, mezcla:{1,2,3}, objetivo:{modo,utilidadObjetivo} }`.
    - `escaleraPrecios` normalizada: `[{cantidad,precio}]`, `cantidad>1`, `precio>0`, ordenada asc.
    - `mezcla` renormalizada a fracciones que suman 1 (default `{1:1,2:0,3:0}`).
    - `objetivo.modo` resuelto: `'sugerir'` si `precioBase == null`, si no `'evaluar'` (salvo que la entrada lo fije explícito).
    - `avisos`: solo los de normalización — `entrega_en_piso`, `cierre_en_piso`, `mezcla_renormalizada`.

- [ ] **Step 1: Write the failing test**

`test/normalizar.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarEntrada, DEFAULTS } from '../src/normalizar.js';

test('aplica defaults cuando la entrada está casi vacía', () => {
  const { ctx } = normalizarEntrada({ producto: { costoUnitario: 37500 }, objetivo: { modo: 'sugerir', utilidadObjetivo: 40000 } });
  assert.equal(ctx.fleteIda, 0);
  assert.equal(ctx.cesionUtilidadPorUnidadExtra, 0.20);
  assert.equal(ctx.tasaEntrega, 0.75);
  assert.equal(ctx.diasOperacionMes, 30);
  assert.deepEqual(ctx.mezcla, { 1: 1, 2: 0, 3: 0 });
  assert.equal(ctx.redondeo.direccion, 'arriba');
});

test('clampa tasas al piso y avisa', () => {
  const { ctx, avisos } = normalizarEntrada({ producto: { costoUnitario: 1 }, mercado: { tasaEntrega: 0, tasaCierre: -1 } });
  assert.equal(ctx.tasaEntrega, 0.01);
  assert.equal(ctx.tasaCierre, 0.01);
  assert.ok(avisos.find((a) => a.codigo === 'entrega_en_piso'));
  assert.ok(avisos.find((a) => a.codigo === 'cierre_en_piso'));
});

test('renormaliza la mezcla y avisa', () => {
  const { ctx, avisos } = normalizarEntrada({ producto: { costoUnitario: 1 }, mezcla: { 1: 2, 2: 1, 3: 1 } });
  assert.deepEqual(ctx.mezcla, { 1: 0.5, 2: 0.25, 3: 0.25 });
  assert.ok(avisos.find((a) => a.codigo === 'mezcla_renormalizada'));
});

test('resuelve el modo por precioBase', () => {
  assert.equal(normalizarEntrada({ producto: { costoUnitario: 1, precioBase: 100000 } }).ctx.objetivo.modo, 'evaluar');
  assert.equal(normalizarEntrada({ producto: { costoUnitario: 1, precioBase: null } }).ctx.objetivo.modo, 'sugerir');
  assert.equal(normalizarEntrada({ producto: { costoUnitario: 1, precioBase: 100000 }, objetivo: { modo: 'sugerir', utilidadObjetivo: 1 } }).ctx.objetivo.modo, 'sugerir');
});

test('normaliza y ordena la escalera de precios, descarta filas basura', () => {
  const { ctx } = normalizarEntrada({ producto: { costoUnitario: 1, escaleraPrecios: [
    { cantidad: 3, precio: 240000 }, { cantidad: 2, precio: 170000 }, { cantidad: 1, precio: 90000 }, { cantidad: 4, precio: 0 },
  ] } });
  assert.deepEqual(ctx.escaleraPrecios, [{ cantidad: 2, precio: 170000 }, { cantidad: 3, precio: 240000 }]);
});

test('clampa comisionRecaudoPct y pctProductoPerdido', () => {
  const { ctx } = normalizarEntrada({ producto: { costoUnitario: 1 }, supuestos: { comisionRecaudoPct: 5, pctProductoPerdidoEnDevolucion: 9 } });
  assert.equal(ctx.comisionRecaudoPct, 0.99);
  assert.equal(ctx.pctProductoPerdidoEnDevolucion, 1);
});

test('no lanza con entrada undefined', () => {
  assert.doesNotThrow(() => normalizarEntrada());
  assert.doesNotThrow(() => normalizarEntrada(null));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/normalizar.test.js`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Write `src/normalizar.js`**

```js
import { num, clamp, aviso } from './util.js';

const PISO_TASA = 0.01;

export const DEFAULTS = {
  supuestos: {
    fleteIda: 0, fleteDevolucion: 0, feeDevolucion: 0,
    pctProductoPerdidoEnDevolucion: 0,
    comisionRecaudoPct: 0, comisionRecaudoFijo: 0,
    empaquePorPedido: 0, costoAtencionConversacion: 0,
    cesionUtilidadPorUnidadExtra: 0.20,
    redondeo: { granularidad: 1000, terminacion: 900, direccion: 'arriba' },
  },
  mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 0 },
  publicidad: { presupuestoDia: 0 },
  overhead: { costosFijosMes: 0, diasOperacionMes: 30 },
  mezcla: { 1: 1, 2: 0, 3: 0 },
};

function normalizarEscalera(cruda) {
  if (!Array.isArray(cruda)) return [];
  return cruda
    .map((f) => ({ cantidad: Math.floor(num(f?.cantidad, 0)), precio: num(f?.precio, 0) }))
    .filter((f) => f.cantidad > 1 && f.precio > 0)
    .sort((a, b) => a.cantidad - b.cantidad);
}

function normalizarMezcla(cruda, avisos) {
  const dada = cruda ?? {};
  const vals = { 1: num(dada[1], NaN), 2: num(dada[2], NaN), 3: num(dada[3], NaN) };
  const presentes = [1, 2, 3].filter((n) => Number.isFinite(vals[n]));
  if (presentes.length === 0) return { ...DEFAULTS.mezcla };
  const positivos = presentes.map((n) => Math.max(0, vals[n]));
  const suma = positivos.reduce((a, b) => a + b, 0);
  if (suma <= 0) return { ...DEFAULTS.mezcla };
  const out = { 1: 0, 2: 0, 3: 0 };
  for (const n of [1, 2, 3]) out[n] = Math.max(0, Number.isFinite(vals[n]) ? vals[n] : 0) / suma;
  if (Math.abs(suma - 1) > 1e-9) avisos.push(aviso('mezcla_renormalizada', 'aviso', 'La mezcla de ventas no sumaba 1; se reescaló.'));
  return out;
}

export function normalizarEntrada(entrada = {}) {
  const e = entrada ?? {};
  const avisos = [];

  const s = { ...DEFAULTS.supuestos, ...(e.supuestos ?? {}) };
  const redondeo = { ...DEFAULTS.supuestos.redondeo, ...((e.supuestos ?? {}).redondeo ?? {}) };
  const m = { ...DEFAULTS.mercado, ...(e.mercado ?? {}) };
  const pub = { ...DEFAULTS.publicidad, ...(e.publicidad ?? {}) };
  const ov = { ...DEFAULTS.overhead, ...(e.overhead ?? {}) };
  const prod = e.producto ?? {};
  const obj = e.objetivo ?? {};

  const tCruda = num(m.tasaEntrega, DEFAULTS.mercado.tasaEntrega);
  const kCruda = num(m.tasaCierre, DEFAULTS.mercado.tasaCierre);
  const tasaEntrega = clamp(tCruda, PISO_TASA, 1);
  const tasaCierre = clamp(kCruda, PISO_TASA, 1);
  if (tCruda < PISO_TASA) avisos.push(aviso('entrega_en_piso', 'aviso', 'La tasa de entrega se limitó al 1%.'));
  if (kCruda < PISO_TASA) avisos.push(aviso('cierre_en_piso', 'aviso', 'La tasa de cierre se limitó al 1%.'));

  const mezcla = normalizarMezcla(e.mezcla, avisos);

  const costoUnitario = num(prod.costoUnitario, 0);
  const precioBase = prod.precioBase == null ? null : num(prod.precioBase, 0);
  const escaleraPrecios = normalizarEscalera(prod.escaleraPrecios);

  const modo = obj.modo === 'evaluar' || obj.modo === 'sugerir'
    ? obj.modo
    : (precioBase == null ? 'sugerir' : 'evaluar');

  const ctx = {
    costoUnitario, precioBase, escaleraPrecios,
    fleteIda: num(s.fleteIda), fleteDevolucion: num(s.fleteDevolucion), feeDevolucion: num(s.feeDevolucion),
    pctProductoPerdidoEnDevolucion: clamp(num(s.pctProductoPerdidoEnDevolucion), 0, 1),
    comisionRecaudoPct: clamp(num(s.comisionRecaudoPct), 0, 0.99),
    comisionRecaudoFijo: num(s.comisionRecaudoFijo),
    empaquePorPedido: num(s.empaquePorPedido),
    costoAtencionConversacion: num(s.costoAtencionConversacion),
    cesionUtilidadPorUnidadExtra: clamp(num(s.cesionUtilidadPorUnidadExtra, 0.20), 0, 1),
    redondeo: {
      granularidad: Math.max(1, num(redondeo.granularidad, 1000)),
      terminacion: Math.max(0, num(redondeo.terminacion, 900)),
      direccion: ['arriba', 'cercano', 'abajo'].includes(redondeo.direccion) ? redondeo.direccion : 'arriba',
    },
    tasaEntrega, tasaCierre,
    costoConversacion: num(m.costoConversacion, 0),
    presupuestoDia: num(pub.presupuestoDia, 0),
    costosFijosMes: num(ov.costosFijosMes, 0),
    diasOperacionMes: Math.max(1, num(ov.diasOperacionMes, 30)),
    mezcla,
    objetivo: { modo, utilidadObjetivo: num(obj.utilidadObjetivo, 0) },
  };

  const entradaNormalizada = {
    producto: { costoUnitario, precioBase, escaleraPrecios },
    supuestos: {
      fleteIda: ctx.fleteIda, fleteDevolucion: ctx.fleteDevolucion, feeDevolucion: ctx.feeDevolucion,
      pctProductoPerdidoEnDevolucion: ctx.pctProductoPerdidoEnDevolucion,
      comisionRecaudoPct: ctx.comisionRecaudoPct, comisionRecaudoFijo: ctx.comisionRecaudoFijo,
      empaquePorPedido: ctx.empaquePorPedido, costoAtencionConversacion: ctx.costoAtencionConversacion,
      cesionUtilidadPorUnidadExtra: ctx.cesionUtilidadPorUnidadExtra, redondeo: ctx.redondeo,
    },
    mercado: { tasaEntrega, tasaCierre, costoConversacion: ctx.costoConversacion },
    publicidad: { presupuestoDia: ctx.presupuestoDia },
    overhead: { costosFijosMes: ctx.costosFijosMes, diasOperacionMes: ctx.diasOperacionMes },
    mezcla, objetivo: ctx.objetivo,
  };

  return { ctx, entradaNormalizada, avisos };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/normalizar.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/normalizar.js test/normalizar.test.js
git commit -m "feat: normalizarEntrada — defaults, clamps, mezcla, ctx"
```

---

### Task 3: Costos

**Files:**
- Create: `src/costos.js`
- Test: `test/costos.test.js`

**Interfaces:**
- Consumes: `ctx` de `normalizarEntrada` (Task 2).
- Produces: `crearCostos(ctx) → { cogs, costoPedidoFallido, colchonDevoluciones, comisionRecaudo, costoTotalPorVenta }`
  - `cogs(n) → number`
  - `costoPedidoFallido(n) → number` = `fleteIda + fleteDevolucion + feeDevolucion + pctProductoPerdidoEnDevolucion·C·n`
  - `colchonDevoluciones(n) → number` = `((1 − t)/t)·costoPedidoFallido(n)`
  - `comisionRecaudo(precio) → number` = `comisionRecaudoPct·precio + comisionRecaudoFijo`
  - `costoTotalPorVenta(n, precio, cac) → number` = `cogs(n) + fleteIda + comisionRecaudo(precio) + empaquePorPedido + colchonDevoluciones(n) + cac`

- [ ] **Step 1: Write the failing test**

`test/costos.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarEntrada } from '../src/normalizar.js';
import { crearCostos } from '../src/costos.js';

const ctxDe = (over = {}) => normalizarEntrada({
  producto: { costoUnitario: 37500 },
  supuestos: { fleteIda: 20000, ...over.supuestos },
  mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000, ...over.mercado },
}).ctx;

const cerca = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('cogs escala lineal con n', () => {
  const c = crearCostos(ctxDe());
  assert.equal(c.cogs(1), 37500);
  assert.equal(c.cogs(3), 112500);
});

test('costoPedidoFallido: solo fletes cuando no hay pérdida de producto', () => {
  const c = crearCostos(ctxDe());
  assert.equal(c.costoPedidoFallido(1), 20000);
  assert.equal(c.costoPedidoFallido(3), 20000); // pct = 0 -> no escala
});

test('costoPedidoFallido escala con n cuando hay pérdida de producto', () => {
  const c = crearCostos(ctxDe({ supuestos: { fleteIda: 20000, fleteDevolucion: 15000, feeDevolucion: 3000, pctProductoPerdidoEnDevolucion: 0.5 } }));
  // 20000 + 15000 + 3000 + 0.5*37500*2 = 38000 + 37500 = 75500
  assert.equal(c.costoPedidoFallido(2), 75500);
});

test('colchonDevoluciones = ((1-t)/t) * costoPedidoFallido', () => {
  const c = crearCostos(ctxDe());
  assert.ok(cerca(c.colchonDevoluciones(1), (0.25 / 0.75) * 20000)); // 6666.666...
});

test('comisionRecaudo mezcla porcentaje y fijo', () => {
  const c = crearCostos(ctxDe({ supuestos: { fleteIda: 20000, comisionRecaudoPct: 0.03, comisionRecaudoFijo: 1500 } }));
  assert.ok(cerca(c.comisionRecaudo(100000), 3000 + 1500));
});

test('costoTotalPorVenta suma todos los componentes + cac', () => {
  const c = crearCostos(ctxDe());
  const total = c.costoTotalPorVenta(1, 104166.6667, 26666.6667);
  // 37500 + 20000 + 0 + 0 + 6666.667 + 26666.667 = 90833.334
  assert.ok(cerca(total, 90833.3334, 1e-3));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/costos.test.js`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Write `src/costos.js`**

```js
/** Costos del modelo COD. Factory que cierra sobre el ctx normalizado. */
export function crearCostos(ctx) {
  const {
    costoUnitario: C, fleteIda, fleteDevolucion, feeDevolucion,
    pctProductoPerdidoEnDevolucion: pctPerd,
    comisionRecaudoPct, comisionRecaudoFijo, empaquePorPedido,
    tasaEntrega: t,
  } = ctx;

  const cogs = (n) => C * n;

  const costoPedidoFallido = (n) =>
    fleteIda + fleteDevolucion + feeDevolucion + pctPerd * C * n;

  const colchonDevoluciones = (n) =>
    ((1 - t) / t) * costoPedidoFallido(n);

  const comisionRecaudo = (precio) =>
    comisionRecaudoPct * precio + comisionRecaudoFijo;

  const costoTotalPorVenta = (n, precio, cac) =>
    cogs(n) + fleteIda + comisionRecaudo(precio) + empaquePorPedido
    + colchonDevoluciones(n) + cac;

  return { cogs, costoPedidoFallido, colchonDevoluciones, comisionRecaudo, costoTotalPorVenta };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/costos.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/costos.js test/costos.test.js
git commit -m "feat: costos — cogs, costoPedidoFallido, colchón, comisión, costoTotalPorVenta"
```

---

### Task 4: Publicidad (CAC, pauta, ROAS)

**Files:**
- Create: `src/publicidad.js`
- Test: `test/publicidad.test.js`

**Interfaces:**
- Consumes: `ctx` (Task 2).
- Produces: `crearPublicidad(ctx) → { disponible, cac, pautaPorPedido, pautaPorVenta, roasActual }`
  - `disponible → boolean` = `ctx.costoConversacion > 0`.
  - `cac() → number | null` = `(cc + ca) / (k·t)`; `null` si no `disponible`.
  - `pautaPorPedido() → number | null` = `cc / k`.
  - `pautaPorVenta() → number | null` = `cc / (k·t)`.
  - `roasActual(precio) → number | null` = `(t·precio·k) / cc`.

- [ ] **Step 1: Write the failing test**

`test/publicidad.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarEntrada } from '../src/normalizar.js';
import { crearPublicidad } from '../src/publicidad.js';

const cerca = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const ctxDe = (mercado) => normalizarEntrada({ producto: { costoUnitario: 1 }, mercado }).ctx;

test('cac = (cc + ca) / (k*t)', () => {
  const p = crearPublicidad(ctxDe({ tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 }));
  assert.ok(cerca(p.cac(), 4000 / (0.20 * 0.75))); // 26666.666...
  assert.ok(cerca(p.pautaPorPedido(), 4000 / 0.20));
  assert.ok(cerca(p.pautaPorVenta(), 4000 / (0.20 * 0.75)));
});

test('cac incluye costoAtencionConversacion', () => {
  const ctx = normalizarEntrada({ producto: { costoUnitario: 1 }, supuestos: { costoAtencionConversacion: 1000 }, mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 } }).ctx;
  assert.ok(cerca(crearPublicidad(ctx).cac(), 5000 / (0.20 * 0.75)));
});

test('roasActual = (t*precio*k)/cc', () => {
  const p = crearPublicidad(ctxDe({ tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 }));
  assert.ok(cerca(p.roasActual(100000), (0.75 * 100000 * 0.20) / 4000));
});

test('sin costo por conversación: todo null, nunca Infinity', () => {
  const p = crearPublicidad(ctxDe({ costoConversacion: 0 }));
  assert.equal(p.disponible, false);
  assert.equal(p.cac(), null);
  assert.equal(p.pautaPorPedido(), null);
  assert.equal(p.roasActual(100000), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/publicidad.test.js`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Write `src/publicidad.js`**

```js
/** Costo de adquisición y ROAS. `null` cuando no hay costo por conversación. */
export function crearPublicidad(ctx) {
  const {
    costoConversacion: cc, costoAtencionConversacion: ca,
    tasaCierre: k, tasaEntrega: t,
  } = ctx;

  const disponible = cc > 0;

  const pautaPorPedido = () => (disponible ? cc / k : null);
  const pautaPorVenta = () => (disponible ? cc / (k * t) : null);
  const cac = () => (disponible ? (cc + ca) / (k * t) : null);
  const roasActual = (precio) => (disponible ? (t * precio * k) / cc : null);

  return { disponible, cac, pautaPorPedido, pautaPorVenta, roasActual };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/publicidad.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/publicidad.js test/publicidad.test.js
git commit -m "feat: publicidad — CAC, pauta por pedido/venta, ROAS actual"
```

---

### Task 5: Rentabilidad (bruto, utilidad, margen, markup)

**Files:**
- Create: `src/rentabilidad.js`
- Test: `test/rentabilidad.test.js`

**Interfaces:**
- Consumes: `ctx` (Task 2), `crearCostos` (Task 3), `crearPublicidad` (Task 4).
- Produces: `crearRentabilidad(ctx, costos, publicidad) → { brutoPorPedido, utilidadPorPedido, utilidadPorVentaEntregada, utilidadFinal, margen, markup, cac }`
  - `brutoPorPedido(n, precio) → number` = `precio − cogs(n) − fleteIda − comisionRecaudo(precio) − empaquePorPedido`
  - `utilidadPorPedido(n, precio) → number` = `t·brutoPorPedido − (1−t)·costoPedidoFallido(n)`
  - `utilidadPorVentaEntregada(n, precio) → number` = `utilidadPorPedido / t`
  - `utilidadFinal(n, precio) → number | null` = `utilidadPorVentaEntregada − cac`; `null` si `cac == null`
  - `margen(n, precio) → { bruto: number|null, neto: number|null }` (fracciones sobre `precio`; `null` si `precio <= 0`; `neto` además `null` si `utilidadFinal == null`)
  - `markup(n, precio) → { sobreProducto: number|null, sobreProductoYFlete: number|null }` (`null` si el denominador es 0)
  - `cac` — el valor `number | null` (de `publicidad.cac()`), expuesto para otros módulos.

- [ ] **Step 1: Write the failing test**

`test/rentabilidad.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarEntrada } from '../src/normalizar.js';
import { crearCostos } from '../src/costos.js';
import { crearPublicidad } from '../src/publicidad.js';
import { crearRentabilidad } from '../src/rentabilidad.js';

const cerca = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

function motor(over = {}) {
  const { ctx } = normalizarEntrada({
    producto: { costoUnitario: 37500 },
    supuestos: { fleteIda: 20000, ...over.supuestos },
    mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000, ...over.mercado },
  });
  const costos = crearCostos(ctx);
  return crearRentabilidad(ctx, costos, crearPublicidad(ctx));
}

const PRECIO = 104166.6667; // precioCrudo(1) de los defaults del HTML

test('bruto por pedido con comisión 0', () => {
  assert.ok(cerca(motor().brutoPorPedido(1, PRECIO), PRECIO - 37500 - 20000));
});

test('utilidad por pedido y por venta entregada', () => {
  const r = motor();
  assert.ok(cerca(r.utilidadPorPedido(1, PRECIO), 0.75 * (PRECIO - 57500) - 0.25 * 20000));
  assert.ok(cerca(r.utilidadPorVentaEntregada(1, PRECIO), 40000)); // reconcilia con la utilidad objetivo
});

test('utilidad final resta el CAC', () => {
  assert.ok(cerca(motor().utilidadFinal(1, PRECIO), 40000 - 4000 / (0.20 * 0.75)));
});

test('margen bruto y neto son fracciones sobre el precio', () => {
  const m = motor().margen(1, PRECIO);
  assert.ok(m.bruto > 0 && m.bruto < 1);
  assert.ok(cerca(m.neto, motor().utilidadFinal(1, PRECIO) / PRECIO));
});

test('markup sobre producto y sobre producto+flete', () => {
  const mk = motor().markup(1, PRECIO);
  assert.ok(cerca(mk.sobreProducto, PRECIO / 37500));
  assert.ok(cerca(mk.sobreProductoYFlete, PRECIO / 57500));
});

test('sin pauta: utilidadFinal y margen neto null, bruto sí calcula', () => {
  const r = motor({ mercado: { costoConversacion: 0 } });
  assert.equal(r.utilidadFinal(1, PRECIO), null);
  assert.equal(r.margen(1, PRECIO).neto, null);
  assert.ok(r.margen(1, PRECIO).bruto > 0);
});

test('costo unitario 0: markup null, no divide por cero', () => {
  const r = motor({}); // C=37500... forzamos con override directo
  const { ctx } = normalizarEntrada({ producto: { costoUnitario: 0 }, supuestos: { fleteIda: 0 }, mercado: { costoConversacion: 4000 } });
  const r0 = crearRentabilidad(ctx, crearCostos(ctx), crearPublicidad(ctx));
  assert.equal(r0.markup(1, 50000).sobreProducto, null);
  assert.equal(r0.markup(1, 50000).sobreProductoYFlete, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/rentabilidad.test.js`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Write `src/rentabilidad.js`**

```js
/** Rentabilidad por combo. Factory sobre ctx + costos + publicidad. */
export function crearRentabilidad(ctx, costos, publicidad) {
  const { fleteIda, empaquePorPedido, tasaEntrega: t } = ctx;
  const { cogs, costoPedidoFallido, colchonDevoluciones, comisionRecaudo } = costos;
  const cac = publicidad.cac();

  const brutoPorPedido = (n, precio) =>
    precio - cogs(n) - fleteIda - comisionRecaudo(precio) - empaquePorPedido;

  const utilidadPorPedido = (n, precio) =>
    t * brutoPorPedido(n, precio) - (1 - t) * costoPedidoFallido(n);

  const utilidadPorVentaEntregada = (n, precio) =>
    utilidadPorPedido(n, precio) / t;

  const utilidadFinal = (n, precio) =>
    (cac == null ? null : utilidadPorVentaEntregada(n, precio) - cac);

  const margen = (n, precio) => {
    if (!(precio > 0)) return { bruto: null, neto: null };
    const brutoAntes = precio - cogs(n) - fleteIda - comisionRecaudo(precio);
    const final = utilidadFinal(n, precio);
    return { bruto: brutoAntes / precio, neto: final == null ? null : final / precio };
  };

  const markup = (n, precio) => {
    const base = cogs(n);
    const baseFlete = cogs(n) + fleteIda;
    return {
      sobreProducto: base > 0 ? precio / base : null,
      sobreProductoYFlete: baseFlete > 0 ? precio / baseFlete : null,
    };
  };

  return { brutoPorPedido, utilidadPorPedido, utilidadPorVentaEntregada, utilidadFinal, margen, markup, cac };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/rentabilidad.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/rentabilidad.js test/rentabilidad.test.js
git commit -m "feat: rentabilidad — bruto, utilidad (3 denominadores), margen, markup"
```

---

### Task 6: Combos (sugerir precio, evaluar, semáforo)

**Files:**
- Create: `src/combos.js`
- Test: `test/combos.test.js`

**Interfaces:**
- Consumes: `ctx` (Task 2), `crearCostos` (Task 3), `crearRentabilidad` (Task 5), `redondear` (Task 1).
- Produces: `crearCombos(ctx, costos, rent) → { sugerirPrecioCombo, precioCrudo, evaluarCombo, semaforoDe }`
  - `precioCrudo(n) → number` — precio sin redondear que reconcilia con `Utotal(n)`.
  - `sugerirPrecioCombo(n) → number` — `redondear(precioCrudo(n), ctx.redondeo)`.
  - `semaforoDe(margenNeto | null) → { nivel, pct }` — `nivel ∈ {'premium','sano','apretado','muy-apretado','pierde','sin-dato'}`, `pct = margenNeto*100` (o `null`).
  - `evaluarCombo(n) → { combo, avisos }` — `combo` con la forma de `Resultado.combos[i]` **salvo** `roas` y `descuentoMaximoPct` (los completa `index.js`). `avisos` puede traer `combo_sin_precio`.
- Reglas de `ingreso`:
  - modo `sugerir`: si hay fila de escalera para `n` → ese precio (`sugerido:false`); si no → `sugerirPrecioCombo(n)` (`sugerido:true`). Para `n=1` sin escalera → `sugerirPrecioCombo(1)`.
  - modo `evaluar`: `n=1` → `ctx.precioBase`; `n>1` con fila de escalera → ese precio; `n>1` sin fila → `ctx.precioBase*n` + aviso `combo_sin_precio`.

- [ ] **Step 1: Write the failing test**

`test/combos.test.js`:
```js
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

const BASE = {
  producto: { costoUnitario: 37500 },
  supuestos: { fleteIda: 20000 },
  mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 },
  objetivo: { modo: 'sugerir', utilidadObjetivo: 40000 },
};

test('precioCrudo reproduce los números de la auditoría (supuestos nuevos en 0)', () => {
  const { m } = mod(BASE);
  assert.ok(cerca(m.precioCrudo(1), 104166.6667));
  assert.ok(cerca(m.precioCrudo(2), 173666.6667));
  assert.ok(cerca(m.precioCrudo(3), 243166.6667));
});

test('sugerirPrecioCombo redondea hacia arriba a terminación 900, sin quedar bajo el crudo', () => {
  const { m } = mod(BASE);
  // precioCrudo(1) = 104166.67 ; 105000-900=104100 < crudo -> sube -> 106000-900
  assert.equal(m.sugerirPrecioCombo(1), 105100);
});

test('modo sugerir sin escalera: los 3 combos son sugeridos', () => {
  const { m } = mod(BASE);
  for (const n of [1, 2, 3]) {
    const { combo } = m.evaluarCombo(n);
    assert.equal(combo.sugerido, true);
    assert.equal(combo.n, n);
    assert.ok(combo.ingreso > 0);
  }
});

test('modo sugerir con escalera: usa el precio de la escalera y marca sugerido:false', () => {
  const { m } = mod({ ...BASE, producto: { costoUnitario: 37500, escaleraPrecios: [{ cantidad: 2, precio: 170000 }] } });
  assert.equal(m.evaluarCombo(2).combo.ingreso, 170000);
  assert.equal(m.evaluarCombo(2).combo.sugerido, false);
});

test('modo evaluar sin fila de escalera para n=2: precioBase*2 + aviso', () => {
  const { m } = mod({ ...BASE, producto: { costoUnitario: 37500, precioBase: 119900 }, objetivo: { modo: 'evaluar' } });
  const { combo, avisos } = m.evaluarCombo(2);
  assert.equal(combo.ingreso, 239800);
  assert.ok(avisos.find((a) => a.codigo === 'combo_sin_precio'));
});

test('el combo trae costo desglosado y utilidad en 3 denominadores', () => {
  const { m } = mod(BASE);
  const { combo } = m.evaluarCombo(1);
  assert.ok('cogs' in combo.costo && 'colchonDevoluciones' in combo.costo);
  assert.ok('porPedidoGenerado' in combo.utilidad && 'porVentaEntregada' in combo.utilidad && 'final' in combo.utilidad);
});

test('semaforoDe clasifica por margen neto', () => {
  const { m } = mod(BASE);
  assert.equal(m.semaforoDe(0.35).nivel, 'premium');
  assert.equal(m.semaforoDe(0.22).nivel, 'sano');
  assert.equal(m.semaforoDe(0.12).nivel, 'apretado');
  assert.equal(m.semaforoDe(0.03).nivel, 'muy-apretado');
  assert.equal(m.semaforoDe(-0.1).nivel, 'pierde');
  assert.equal(m.semaforoDe(null).nivel, 'sin-dato');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/combos.test.js`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Write `src/combos.js`**

```js
import { redondear } from './redondeo.js';
import { aviso } from './util.js';

/** Umbrales del semáforo de margen neto (fracción sobre el precio). */
const UMBRALES = [
  { min: 0.30, nivel: 'premium' },
  { min: 0.20, nivel: 'sano' },
  { min: 0.10, nivel: 'apretado' },
  { min: 0.00001, nivel: 'muy-apretado' },
];

export function crearCombos(ctx, costos, rent) {
  const {
    objetivo, cesionUtilidadPorUnidadExtra: d, comisionRecaudoPct,
    comisionRecaudoFijo, fleteIda, empaquePorPedido, redondeo,
    escaleraPrecios, precioBase,
  } = ctx;

  const utotal = (n) => objetivo.utilidadObjetivo * (1 + (n - 1) * (1 - d));

  const precioCrudo = (n) =>
    (costos.cogs(n) + fleteIda + comisionRecaudoFijo + empaquePorPedido
      + costos.colchonDevoluciones(n) + utotal(n)) / (1 - comisionRecaudoPct);

  const sugerirPrecioCombo = (n) => redondear(precioCrudo(n), redondeo);

  const filaEscalera = (n) => (n === 1 ? null : escaleraPrecios.find((f) => f.cantidad === n) ?? null);

  const semaforoDe = (margenNeto) => {
    if (margenNeto == null) return { nivel: 'sin-dato', pct: null };
    const pct = margenNeto * 100;
    const hit = UMBRALES.find((u) => margenNeto >= u.min);
    return { nivel: hit ? hit.nivel : 'pierde', pct };
  };

  const evaluarCombo = (n) => {
    const avisos = [];
    let ingreso;
    let sugerido = false;
    const fila = filaEscalera(n);

    if (objetivo.modo === 'sugerir') {
      if (fila) { ingreso = fila.precio; }
      else { ingreso = sugerirPrecioCombo(n); sugerido = true; }
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
      sugerido,
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
      roas: null,               // lo completa index.js
      descuentoMaximoPct: null, // lo completa index.js
      semaforo: semaforoDe(margen.neto),
    };
    return { combo, avisos };
  };

  return { sugerirPrecioCombo, precioCrudo, evaluarCombo, semaforoDe };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/combos.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/combos.js test/combos.test.js
git commit -m "feat: combos — precio sugerido, evaluar combo, semáforo de margen"
```

---

### Task 7: Puntos de equilibrio

**Files:**
- Create: `src/equilibrio.js`
- Test: `test/equilibrio.test.js`

**Interfaces:**
- Consumes: `ctx` (Task 2), `crearCostos` (Task 3), `crearRentabilidad` (Task 5), `crearPublicidad` (Task 4).
- Produces: `crearEquilibrio(ctx, costos, rent, publicidad) → { precioMinimo, descuentoMaximoPct, tasaEntregaMinima, tasaCierreMinima, costoConversacionMaximo, roasMinimo, unidadesDiaParaFijos }`
  - `precioMinimo(n) → number | null` — precio al que `utilidadFinal(n, precio) = 0` (con CAC). `null` si no hay pauta.
  - `descuentoMaximoPct(n, precio) → number | null` — `max(0, 1 − precioMinimo(n)/precio)`.
  - `tasaEntregaMinima(n, precio) → number | null` — `null` si sale fuera de `(0, 1]` o sin pauta.
  - `tasaCierreMinima(n, precio) → number | null` — idem.
  - `costoConversacionMaximo(n, precio) → number | null` — `k·t·utilidadPorVentaEntregada − ca`; `null` si `<= 0`.
  - `roasMinimo(n, precio) → number | null` — `(t·precio·k) / costoConversacionMaximo(n, precio)`.
  - `unidadesDiaParaFijos(combos, mezcla) → number | null` — `0` si no hay fijos; `null` si la utilidad ponderada `<= 0`.

- [ ] **Step 1: Write the failing test**

`test/equilibrio.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarEntrada } from '../src/normalizar.js';
import { crearCostos } from '../src/costos.js';
import { crearPublicidad } from '../src/publicidad.js';
import { crearRentabilidad } from '../src/rentabilidad.js';
import { crearEquilibrio } from '../src/equilibrio.js';

const cerca = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

function mod(over = {}) {
  const { ctx } = normalizarEntrada({
    producto: { costoUnitario: 37500 },
    supuestos: { fleteIda: 20000, ...over.supuestos },
    mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000, ...over.mercado },
    overhead: over.overhead,
  });
  const costos = crearCostos(ctx);
  const rent = crearRentabilidad(ctx, costos, crearPublicidad(ctx));
  return { ctx, rent, costos, eq: crearEquilibrio(ctx, costos, rent, crearPublicidad(ctx)) };
}

const PRECIO = 104166.6667;

test('en precioMinimo(n) la utilidad final es 0', () => {
  const { rent, eq } = mod();
  const pm = eq.precioMinimo(1);
  assert.ok(cerca(rent.utilidadFinal(1, pm), 0));
});

test('descuentoMaximoPct: bajar el precio a precioMinimo deja utilidad 0', () => {
  const { eq } = mod();
  const d = eq.descuentoMaximoPct(1, PRECIO);
  assert.ok(d > 0 && d < 1);
  assert.ok(cerca(PRECIO * (1 - d), eq.precioMinimo(1)));
});

test('sustituir la tasa de entrega mínima deja utilidad final ~0', () => {
  const { ctx, eq } = mod();
  const tmin = eq.tasaEntregaMinima(1, PRECIO);
  const { ctx: ctx2 } = normalizarEntrada({
    producto: { costoUnitario: 37500 }, supuestos: { fleteIda: 20000 },
    mercado: { tasaEntrega: tmin, tasaCierre: 0.20, costoConversacion: 4000 },
  });
  const c2 = crearCostos(ctx2);
  const r2 = crearRentabilidad(ctx2, c2, crearPublicidad(ctx2));
  assert.ok(cerca(r2.utilidadFinal(1, PRECIO), 0, 1));
});

test('costoConversacionMaximo: usarlo como cc deja utilidad final ~0', () => {
  const { eq } = mod();
  const ccMax = eq.costoConversacionMaximo(1, PRECIO);
  const { ctx: ctx2 } = normalizarEntrada({
    producto: { costoUnitario: 37500 }, supuestos: { fleteIda: 20000 },
    mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: ccMax },
  });
  const c2 = crearCostos(ctx2);
  const r2 = crearRentabilidad(ctx2, c2, crearPublicidad(ctx2));
  assert.ok(cerca(r2.utilidadFinal(1, PRECIO), 0, 1));
});

test('unidadesDiaParaFijos: fijos / utilidad final ponderada', () => {
  const { rent, eq } = mod({ overhead: { costosFijosMes: 3000000, diasOperacionMes: 30 } });
  const combos = [{ n: 1, utilidad: { final: rent.utilidadFinal(1, PRECIO), porVentaEntregada: rent.utilidadPorVentaEntregada(1, PRECIO) } }];
  const u = eq.unidadesDiaParaFijos(combos, { 1: 1, 2: 0, 3: 0 });
  assert.ok(cerca(u, (3000000 / 30) / rent.utilidadFinal(1, PRECIO)));
});

test('sin fijos: unidadesDiaParaFijos es 0', () => {
  const { eq, rent } = mod();
  assert.equal(eq.unidadesDiaParaFijos([{ n: 1, utilidad: { final: rent.utilidadFinal(1, PRECIO) } }], { 1: 1 }), 0);
});

test('sin pauta: precioMinimo y tasas mínimas null', () => {
  const { eq } = mod({ mercado: { costoConversacion: 0 } });
  assert.equal(eq.precioMinimo(1), null);
  assert.equal(eq.tasaEntregaMinima(1, PRECIO), null);
  assert.equal(eq.tasaCierreMinima(1, PRECIO), null);
});

test('equilibrio fuera de rango devuelve null, nunca > 1', () => {
  // precio altísimo -> tasa de entrega mínima ínfima pero válida; precio ínfimo -> imposible
  const { eq } = mod();
  assert.equal(eq.tasaEntregaMinima(1, 1), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/equilibrio.test.js`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Write `src/equilibrio.js`**

```js
/**
 * Puntos de equilibrio. Al despejar denominadores, utilidadFinal = 0 es lineal
 * en cada palanca por separado, así que todo sale en forma cerrada.
 */
export function crearEquilibrio(ctx, costos, rent, publicidad) {
  const {
    tasaEntrega: t, tasaCierre: k, costoConversacion: cc,
    costoAtencionConversacion: ca, comisionRecaudoPct, comisionRecaudoFijo,
    fleteIda, empaquePorPedido, costosFijosMes, diasOperacionMes,
  } = ctx;
  const cac = publicidad.cac();
  const hayPauta = publicidad.disponible;

  const precioMinimo = (n) => {
    if (cac == null) return null;
    return (costos.cogs(n) + fleteIda + comisionRecaudoFijo + empaquePorPedido
      + costos.colchonDevoluciones(n) + cac) / (1 - comisionRecaudoPct);
  };

  const descuentoMaximoPct = (n, precio) => {
    const pm = precioMinimo(n);
    if (pm == null || !(precio > 0)) return null;
    return Math.max(0, 1 - pm / precio);
  };

  const tasaEntregaMinima = (n, precio) => {
    if (!hayPauta) return null;
    const CPF = costos.costoPedidoFallido(n);
    const bruto = rent.brutoPorPedido(n, precio); // no depende de t
    const den = bruto + CPF;
    if (den <= 0) return null;
    const tm = (CPF + (cc + ca) / k) / den;
    return tm > 0 && tm <= 1 ? tm : null;
  };

  const tasaCierreMinima = (n, precio) => {
    if (!hayPauta) return null;
    const uPVE = rent.utilidadPorVentaEntregada(n, precio);
    if (!(uPVE > 0)) return null;
    const km = (cc + ca) / (t * uPVE);
    return km > 0 && km <= 1 ? km : null;
  };

  const costoConversacionMaximo = (n, precio) => {
    const uPVE = rent.utilidadPorVentaEntregada(n, precio);
    const v = k * t * uPVE - ca;
    return v > 0 ? v : null;
  };

  const roasMinimo = (n, precio) => {
    const ccMax = costoConversacionMaximo(n, precio);
    return ccMax != null && ccMax > 0 ? (t * precio * k) / ccMax : null;
  };

  const unidadesDiaParaFijos = (combos, mezcla) => {
    const fijoDia = costosFijosMes / diasOperacionMes;
    if (!(fijoDia > 0)) return 0;
    const uPond = combos.reduce((acc, c) => {
      const u = c.utilidad.final ?? c.utilidad.porVentaEntregada ?? 0;
      return acc + (mezcla[c.n] ?? 0) * u;
    }, 0);
    return uPond > 0 ? fijoDia / uPond : null;
  };

  return {
    precioMinimo, descuentoMaximoPct, tasaEntregaMinima, tasaCierreMinima,
    costoConversacionMaximo, roasMinimo, unidadesDiaParaFijos,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/equilibrio.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/equilibrio.js test/equilibrio.test.js
git commit -m "feat: equilibrio — seis puntos de break-even en forma cerrada"
```

---

### Task 8: Validación

**Files:**
- Create: `src/validacion.js`
- Test: `test/validacion.test.js`

**Interfaces:**
- Consumes: `ctx` (Task 2), y el array `combos` ya armado (forma de `Resultado.combos[]`, de Task 6).
- Produces: `revisar(ctx, combos) → aviso[]` con estos códigos: `costo_faltante` (error), `precio_bajo_costo` (error), `devolucion_sin_costo` (aviso), `sin_pauta` (aviso), `escalera_incoherente` (aviso). (Los códigos `entrega_en_piso`, `cierre_en_piso`, `mezcla_renormalizada` los emite `normalizarEntrada`; `combo_sin_precio` lo emite `evaluarCombo`; `equilibrio_inalcanzable` lo emite `index.js`.)

- [ ] **Step 1: Write the failing test**

`test/validacion.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarEntrada } from '../src/normalizar.js';
import { revisar } from '../src/validacion.js';

const ctxDe = (entrada) => normalizarEntrada(entrada).ctx;
const tiene = (avs, cod) => avs.some((a) => a.codigo === cod);

test('costo faltante es error', () => {
  const av = revisar(ctxDe({ producto: { costoUnitario: 0 }, mercado: { costoConversacion: 4000 } }), []);
  const f = av.find((a) => a.codigo === 'costo_faltante');
  assert.ok(f && f.nivel === 'error');
});

test('precio bajo costo es error', () => {
  const ctx = ctxDe({ producto: { costoUnitario: 37500 }, supuestos: { fleteIda: 20000 }, mercado: { costoConversacion: 4000 } });
  const combos = [{ n: 1, ingreso: 40000 }]; // < 37500 + 20000
  assert.ok(tiene(revisar(ctx, combos), 'precio_bajo_costo'));
});

test('devolución sin costo modelado avisa', () => {
  const ctx = ctxDe({ producto: { costoUnitario: 37500 }, supuestos: { fleteIda: 0 }, mercado: { costoConversacion: 4000 } });
  assert.ok(tiene(revisar(ctx, [{ n: 1, ingreso: 100000 }]), 'devolucion_sin_costo'));
});

test('sin pauta avisa', () => {
  const ctx = ctxDe({ producto: { costoUnitario: 37500 }, supuestos: { fleteIda: 20000 }, mercado: { costoConversacion: 0 } });
  assert.ok(tiene(revisar(ctx, [{ n: 1, ingreso: 100000 }]), 'sin_pauta'));
});

test('escalera incoherente: un combo mayor con peor precio por unidad', () => {
  const ctx = ctxDe({ producto: { costoUnitario: 37500 }, supuestos: { fleteIda: 20000 }, mercado: { costoConversacion: 4000 } });
  const combos = [{ n: 1, ingreso: 100000 }, { n: 2, ingreso: 210000 }]; // 105000/u > 100000/u
  assert.ok(tiene(revisar(ctx, combos), 'escalera_incoherente'));
});

test('caso sano: sin avisos de error', () => {
  const ctx = ctxDe({ producto: { costoUnitario: 37500 }, supuestos: { fleteIda: 20000 }, mercado: { costoConversacion: 4000 } });
  const combos = [{ n: 1, ingreso: 104100 }, { n: 2, ingreso: 173100 }, { n: 3, ingreso: 242100 }];
  assert.equal(revisar(ctx, combos).filter((a) => a.nivel === 'error').length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/validacion.test.js`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Write `src/validacion.js`**

```js
import { aviso } from './util.js';

/** Chequeos estáticos sobre el ctx y los combos ya armados. */
export function revisar(ctx, combos) {
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

  const cpf1 = ctx.fleteIda + ctx.fleteDevolucion + ctx.feeDevolucion
    + ctx.pctProductoPerdidoEnDevolucion * ctx.costoUnitario;
  if (cpf1 === 0) {
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

  return avisos;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/validacion.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/validacion.js test/validacion.test.js
git commit -m "feat: validación — costo faltante, precio bajo costo, escalera incoherente"
```

---

### Task 9: `analizar()` — orquestación (sin escenarios)

**Files:**
- Create: `src/index.js`
- Test: `test/analizar.test.js`

**Interfaces:**
- Consumes: todas las factories anteriores.
- Produces: `analizar(entrada, { conEscenarios = true } = {}) → Resultado`. En esta task `escenarios` se deja en `null` (se completa en Task 11). El resto de `Resultado` completo:
  - `entradaNormalizada`, `avisos[]`, `combos[]` (con `roas` y `descuentoMaximoPct` completos), `mejorCombo { n, criterio }`, `equilibrio {…}`, `proyeccion {…}`, `escenarios` (`null` por ahora).
  - Re-exporta `normalizarEntrada` y `DEFAULTS` desde `./normalizar.js` para conveniencia de los tests.
- `mejorCombo`: el `n` con mayor `combo.utilidad.final`; si todos son `null` (sin pauta), el de mayor `combo.utilidad.porVentaEntregada`. `criterio: 'mayor utilidad limpia por venta entregada'`.
- `proyeccion`: ver código. Si `costoConversacion <= 0` **o** `presupuestoDia <= 0` ⇒ `{ pedidosDia: 0, ventasEntregadasDia: 0, utilidadDia: null, utilidadMes: null }`.
- `equilibrio.tasaEntregaMinima` / `tasaCierreMinima` / `costoConversacionMaximo` se calculan sobre el **combo 1** (`combos[0].ingreso`). Si alguno es `null` (y hay pauta), se agrega un aviso `equilibrio_inalcanzable`.

- [ ] **Step 1: Write the failing test**

`test/analizar.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizar } from '../src/index.js';

const cerca = (a, b, eps = 1e-2) => Math.abs(a - b) < eps;

const DEFAULTS_HTML = {
  producto: { costoUnitario: 37500, precioBase: null, escaleraPrecios: [] },
  supuestos: { fleteIda: 20000 },
  mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 },
  publicidad: { presupuestoDia: 20000 },
  overhead: { costosFijosMes: 0, diasOperacionMes: 30 },
  objetivo: { modo: 'sugerir', utilidadObjetivo: 40000 },
};

test('devuelve la forma completa de Resultado', () => {
  const r = analizar(DEFAULTS_HTML);
  assert.ok(Array.isArray(r.combos) && r.combos.length === 3);
  assert.ok(r.entradaNormalizada && Array.isArray(r.avisos));
  assert.ok(r.mejorCombo && r.equilibrio && r.proyeccion);
  assert.equal(r.escenarios, null); // se completa en Task 11
});

test('cada combo trae roas y descuentoMaximoPct completos', () => {
  const r = analizar(DEFAULTS_HTML);
  for (const c of r.combos) {
    assert.ok(c.roas && typeof c.roas.actual === 'number');
    assert.ok(typeof c.descuentoMaximoPct === 'number');
  }
});

test('identidad: ingreso - costo.total == utilidad.final para cada combo', () => {
  const r = analizar(DEFAULTS_HTML);
  for (const c of r.combos) {
    assert.ok(cerca(c.ingreso - c.costo.total, c.utilidad.final, 1e-6));
  }
});

test('proyección mensual con los defaults del HTML', () => {
  const r = analizar(DEFAULTS_HTML);
  // conversacionesDia = 20000/4000 = 5; pedidosDia = 1; ventasEntregadasDia = 0.75
  assert.ok(cerca(r.proyeccion.pedidosDia, 1));
  assert.ok(cerca(r.proyeccion.ventasEntregadasDia, 0.75));
  // identidad: utilidadMes ~= ventasEntregadasMes * utilidadFinalPonderada - costosFijosMes
  const vem = r.proyeccion.ventasEntregadasDia * 30;
  const uFinal = r.combos[0].utilidad.final; // mezcla por defecto = todo combo 1
  assert.ok(cerca(r.proyeccion.utilidadMes, vem * uFinal, 1e-2));
});

test('sin pauta: utilidad.final null, proyección mensual null, no lanza', () => {
  const r = analizar({ ...DEFAULTS_HTML, mercado: { ...DEFAULTS_HTML.mercado, costoConversacion: 0 } });
  assert.equal(r.combos[0].utilidad.final, null);
  assert.equal(r.proyeccion.utilidadMes, null);
  assert.ok(r.avisos.find((a) => a.codigo === 'sin_pauta'));
});

test('entrada vacía no lanza y avisa costo_faltante', () => {
  assert.doesNotThrow(() => analizar({}));
  assert.ok(analizar({}).avisos.find((a) => a.codigo === 'costo_faltante'));
});

test('mejorCombo elige por utilidad limpia', () => {
  const r = analizar(DEFAULTS_HTML);
  const mejorReal = [...r.combos].sort((a, b) => (b.utilidad.final ?? -Infinity) - (a.utilidad.final ?? -Infinity))[0].n;
  assert.equal(r.mejorCombo.n, mejorReal);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/analizar.test.js`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Write `src/index.js`**

```js
import { normalizarEntrada, DEFAULTS } from './normalizar.js';
import { crearCostos } from './costos.js';
import { crearPublicidad } from './publicidad.js';
import { crearRentabilidad } from './rentabilidad.js';
import { crearCombos } from './combos.js';
import { crearEquilibrio } from './equilibrio.js';
import { revisar } from './validacion.js';
import { aviso } from './util.js';

export { normalizarEntrada, DEFAULTS };

function elegirMejorCombo(combos) {
  const conFinal = combos.filter((c) => c.utilidad.final != null);
  const pool = conFinal.length ? conFinal : combos;
  const clave = conFinal.length ? 'final' : 'porVentaEntregada';
  const mejor = pool.reduce((a, b) => (b.utilidad[clave] > a.utilidad[clave] ? b : a));
  return { n: mejor.n, criterio: 'mayor utilidad limpia por venta entregada' };
}

function calcularProyeccion(ctx, combos, rent) {
  const {
    costoConversacion: cc, costoAtencionConversacion: ca, tasaCierre: k, tasaEntrega: t,
    presupuestoDia: B, costosFijosMes, diasOperacionMes, mezcla,
  } = ctx;

  if (!(cc > 0) || !(B > 0)) {
    return { pedidosDia: 0, ventasEntregadasDia: 0, utilidadDia: null, utilidadMes: null };
  }

  const conversacionesDia = B / cc;
  const pedidosDia = conversacionesDia * k;
  const ventasEntregadasDia = pedidosDia * t;
  const uPPpond = combos.reduce((acc, c) => acc + (mezcla[c.n] ?? 0) * rent.utilidadPorPedido(c.n, c.ingreso), 0);
  const utilidadDia = pedidosDia * uPPpond - B - conversacionesDia * ca - costosFijosMes / diasOperacionMes;
  return { pedidosDia, ventasEntregadasDia, utilidadDia, utilidadMes: utilidadDia * diasOperacionMes };
}

export function analizar(entrada, { conEscenarios = true } = {}) {
  const { ctx, entradaNormalizada, avisos: avisosNorm } = normalizarEntrada(entrada);
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

  avisos.push(...revisar(ctx, combos));

  const ing1 = combos[0].ingreso;
  const equilibrio = {
    precioMinimo: combos.map((c) => ({ n: c.n, valor: eq.precioMinimo(c.n) })),
    tasaEntregaMinima: eq.tasaEntregaMinima(1, ing1),
    tasaCierreMinima: eq.tasaCierreMinima(1, ing1),
    costoConversacionMaximo: eq.costoConversacionMaximo(1, ing1),
    roasMinimo: eq.roasMinimo(1, ing1),
    unidadesDiaParaFijos: eq.unidadesDiaParaFijos(combos, ctx.mezcla),
  };

  if (publicidad.disponible
    && [equilibrio.tasaEntregaMinima, equilibrio.tasaCierreMinima, equilibrio.costoConversacionMaximo].some((v) => v == null)) {
    avisos.push(aviso('equilibrio_inalcanzable', 'aviso', 'Algún punto de equilibrio quedó fuera de rango.'));
  }

  const proyeccion = calcularProyeccion(ctx, combos, rent);
  const mejorCombo = elegirMejorCombo(combos);

  // escenarios: se completan en Task 11
  const escenarios = null;
  void conEscenarios;

  return { entradaNormalizada, avisos, combos, mejorCombo, equilibrio, proyeccion, escenarios };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/analizar.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS — todos los archivos hasta ahora.

- [ ] **Step 6: Commit**

```bash
git add src/index.js test/analizar.test.js
git commit -m "feat: analizar() — orquesta combos, equilibrio, proyección y validación"
```

---

### Task 10: Identidades, bordes y snapshot de regresión

**Files:**
- Create: `test/identidades.test.js`
- Create: `test/bordes.test.js`
- Create: `test/fixtures/snapshot-defaults-html.json`
- Create: `test/_generar-snapshot.mjs`

**Interfaces:**
- Consumes: `analizar` de `src/index.js`.
- Produces: sin API nueva — bloquea el comportamiento del motor con identidades algebraicas, casos borde y un snapshot del `Resultado` (números redondeados) para los defaults del HTML.

- [ ] **Step 1: Write `test/identidades.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizar } from '../src/index.js';

const cerca = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

const BASE = {
  producto: { costoUnitario: 37500, precioBase: null, escaleraPrecios: [] },
  supuestos: { fleteIda: 20000 },
  mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 },
  publicidad: { presupuestoDia: 20000 },
  objetivo: { modo: 'sugerir', utilidadObjetivo: 40000 },
};

test('identidad ingreso - costoTotal == utilidad.final (varios supuestos)', () => {
  for (const over of [
    {},
    { supuestos: { fleteIda: 20000, fleteDevolucion: 15000, feeDevolucion: 2000, pctProductoPerdidoEnDevolucion: 0.4, comisionRecaudoPct: 0.03, comisionRecaudoFijo: 1500, empaquePorPedido: 800 } },
    { mercado: { tasaEntrega: 0.6, tasaCierre: 0.15, costoConversacion: 6000 } },
  ]) {
    const r = analizar({ ...BASE, ...over, supuestos: { ...BASE.supuestos, ...over.supuestos }, mercado: { ...BASE.mercado, ...over.mercado } });
    for (const c of r.combos) assert.ok(cerca(c.ingreso - c.costo.total, c.utilidad.final, 1e-5), `combo ${c.n}`);
  }
});

test('en precioMinimo(n) la utilidad final es 0', () => {
  const r = analizar(BASE);
  const rEval = (n, precio) => analizar({
    ...BASE, producto: { costoUnitario: 37500, precioBase: precio, escaleraPrecios: [] }, objetivo: { modo: 'evaluar' },
  }).combos.find((c) => c.n === n);
  for (const pm of r.equilibrio.precioMinimo) {
    if (pm.valor == null) continue;
    assert.ok(cerca(rEval(1, pm.valor).utilidad.final, 0, 1), `n=${pm.n}`);
  }
});

test('compat HTML: precio sugerido reconcilia con la utilidad objetivo (± granularidad)', () => {
  const r = analizar(BASE);
  const rEval = (precio) => analizar({
    ...BASE, producto: { costoUnitario: 37500, precioBase: precio, escaleraPrecios: [] }, objetivo: { modo: 'evaluar' },
  }).combos[0];
  const c1 = r.combos[0];
  const uPVE = rEval(c1.ingreso).utilidad.porVentaEntregada;
  assert.ok(uPVE >= 40000 - 1e-6);          // redondeo hacia arriba -> nunca por debajo
  assert.ok(uPVE < 40000 + 1000);           // dentro de una granularidad
});

test('monotonía: subir devolución nunca sube la utilidad final', () => {
  const bajo = analizar({ ...BASE, supuestos: { fleteIda: 20000, fleteDevolucion: 5000 } }).combos[0].utilidad.final;
  const alto = analizar({ ...BASE, supuestos: { fleteIda: 20000, fleteDevolucion: 25000 } }).combos[0].utilidad.final;
  assert.ok(alto <= bajo);
});

test('monotonía: subir el costo por conversación nunca sube la utilidad final', () => {
  const bajo = analizar({ ...BASE, mercado: { ...BASE.mercado, costoConversacion: 3000 } }).combos[0].utilidad.final;
  const alto = analizar({ ...BASE, mercado: { ...BASE.mercado, costoConversacion: 8000 } }).combos[0].utilidad.final;
  assert.ok(alto <= bajo);
});
```

- [ ] **Step 2: Write `test/bordes.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizar } from '../src/index.js';

const BASE = {
  producto: { costoUnitario: 37500, precioBase: null, escaleraPrecios: [] },
  supuestos: { fleteIda: 20000 },
  mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 },
  objetivo: { modo: 'sugerir', utilidadObjetivo: 40000 },
};

const finito = (v) => v == null || Number.isFinite(v);

function todoFinitoONull(obj) {
  if (obj == null) return true;
  if (typeof obj === 'number') return finito(obj);
  if (Array.isArray(obj)) return obj.every(todoFinitoONull);
  if (typeof obj === 'object') return Object.values(obj).every(todoFinitoONull);
  return true;
}

test('tasaEntrega = 0 -> clamp + aviso, sin NaN ni Infinity', () => {
  const r = analizar({ ...BASE, mercado: { ...BASE.mercado, tasaEntrega: 0 } });
  assert.ok(r.avisos.find((a) => a.codigo === 'entrega_en_piso'));
  assert.ok(todoFinitoONull(r));
});

test('escaleraPrecios vacía en modo sugerir -> 3 combos sugeridos', () => {
  const r = analizar(BASE);
  assert.deepEqual(r.combos.map((c) => c.sugerido), [true, true, true]);
});

test('mezcla que no suma 1 -> renormaliza + aviso', () => {
  const r = analizar({ ...BASE, mezcla: { 1: 2, 2: 1, 3: 1 } });
  assert.ok(r.avisos.find((a) => a.codigo === 'mezcla_renormalizada'));
  const m = r.entradaNormalizada.mezcla;
  assert.ok(Math.abs(m[1] + m[2] + m[3] - 1) < 1e-9);
});

test('costoUnitario = 0 -> aviso costo_faltante, markup null', () => {
  const r = analizar({ ...BASE, producto: { costoUnitario: 0, precioBase: null, escaleraPrecios: [] } });
  assert.ok(r.avisos.find((a) => a.codigo === 'costo_faltante'));
  assert.equal(r.combos[0].markup.sobreProducto, null);
});

test('costoConversacion = 0 -> cac/roas/utilidad.final null, aviso sin_pauta', () => {
  const r = analizar({ ...BASE, mercado: { ...BASE.mercado, costoConversacion: 0 } });
  assert.equal(r.combos[0].cac, null);
  assert.equal(r.combos[0].roas.actual, null);
  assert.equal(r.combos[0].utilidad.final, null);
  assert.ok(r.avisos.find((a) => a.codigo === 'sin_pauta'));
  assert.ok(todoFinitoONull(r));
});

test('entrega 1% -> el precio sugerido es enorme pero finito, sin crash', () => {
  const r = analizar({ ...BASE, mercado: { ...BASE.mercado, tasaEntrega: 0.01 } });
  assert.ok(Number.isFinite(r.combos[0].ingreso) && r.combos[0].ingreso > 1_000_000);
});
```

- [ ] **Step 3: Write `test/_generar-snapshot.mjs`**

```js
// Regenera el snapshot de regresión a propósito:  node test/_generar-snapshot.mjs
import { writeFileSync } from 'node:fs';
import { analizar } from '../src/index.js';
import { ENTRADA_SNAPSHOT, redondearProfundo } from './identidades.snapshot-util.mjs';

const r = analizar(ENTRADA_SNAPSHOT, { conEscenarios: false });
writeFileSync(new URL('./fixtures/snapshot-defaults-html.json', import.meta.url), JSON.stringify(redondearProfundo(r, 2), null, 2) + '\n');
console.log('snapshot regenerado');
```

- [ ] **Step 4: Write `test/identidades.snapshot-util.mjs`**

```js
export const ENTRADA_SNAPSHOT = {
  producto: { costoUnitario: 37500, precioBase: null, escaleraPrecios: [] },
  supuestos: { fleteIda: 20000 },
  mercado: { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 },
  publicidad: { presupuestoDia: 20000 },
  overhead: { costosFijosMes: 0, diasOperacionMes: 30 },
  objetivo: { modo: 'sugerir', utilidadObjetivo: 40000 },
};

/** Redondea todos los números de una estructura a `d` decimales, para comparar snapshots sin ruido de float. */
export function redondearProfundo(obj, d = 2) {
  const f = 10 ** d;
  if (typeof obj === 'number') return Number.isFinite(obj) ? Math.round(obj * f) / f : obj;
  if (Array.isArray(obj)) return obj.map((x) => redondearProfundo(x, d));
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, redondearProfundo(v, d)]));
  }
  return obj;
}
```

- [ ] **Step 5: Generate the fixture and eyeball it**

Run: `node test/_generar-snapshot.mjs`
Then open `test/fixtures/snapshot-defaults-html.json` and sanity-check: `combos[0].ingreso` ≈ `105100` (crudo 104166,67 redondeado hacia arriba a …900), `combos[0].utilidad.porVentaEntregada` ≈ `40933` (por encima de la utilidad objetivo 40000, por el redondeo), `combos[0].utilidad.final` positivo, `proyeccion.pedidosDia` = `1`.

- [ ] **Step 6: Write the snapshot test — append to `test/identidades.test.js`**

```js
import { readFileSync } from 'node:fs';
import { ENTRADA_SNAPSHOT, redondearProfundo } from './identidades.snapshot-util.mjs';

test('snapshot de regresión: Resultado para los defaults del HTML', () => {
  const esperado = JSON.parse(readFileSync(new URL('./fixtures/snapshot-defaults-html.json', import.meta.url)));
  const actual = redondearProfundo(analizar(ENTRADA_SNAPSHOT, { conEscenarios: false }), 2);
  assert.deepEqual(actual, esperado);
});
```

- [ ] **Step 7: Run the tests**

Run: `node --test test/identidades.test.js test/bordes.test.js`
Expected: PASS.

- [ ] **Step 8: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add test/identidades.test.js test/bordes.test.js test/identidades.snapshot-util.mjs test/_generar-snapshot.mjs test/fixtures/snapshot-defaults-html.json
git commit -m "test: identidades algebraicas, casos borde y snapshot de regresión"
```

---

### Task 11: Escenarios (sensibilidad, tornado, matriz)

**Files:**
- Create: `src/escenarios.js`
- Modify: `src/index.js` (completar `escenarios` en `analizar`)
- Test: `test/escenarios.test.js`
- Modify: `test/analizar.test.js` (el test `escenarios === null` cambia a `escenarios` presente)

**Interfaces:**
- Consumes: una función `analizar` que se le pasa como argumento (para no crear import circular).
- Produces: `src/escenarios.js`:
  - `VARIABLES = ['costoConversacion','tasaEntrega','costoPedidoFallido','precio','tasaCierre']`
  - `sensibilidadUnaVariable(entrada, variable, analizar) → [{ delta, utilidadFinal, margenNeto, utilidadMes, cruzaCero }]` — 11 pasos, `delta` de −0.5 a +0.5 en 0.1.
  - `tornado(entrada, analizar) → [{ variable, impactoAbajo, impactoArriba }]` — ordenado por impacto absoluto desc, sobre `combos[0].utilidad.final`.
  - `matrizEntregaCierre(entrada, analizar) → { ejes: { entrega, cierre }, celdas }` — `celdas` es `entrega[] × cierre[]` de `{ entrega, cierre, utilidadMes, actual }`.
- `index.js`: cuando `conEscenarios` es `true`, arma `escenarios` llamando estas funciones con `(e) => analizar(e, { conEscenarios: false })`.

- [ ] **Step 1: Write the failing test**

`test/escenarios.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/escenarios.test.js`
Expected: FAIL — `src/escenarios.js` no existe.

- [ ] **Step 3: Write `src/escenarios.js`**

```js
export const VARIABLES = ['costoConversacion', 'tasaEntrega', 'costoPedidoFallido', 'precio', 'tasaCierre'];

/** Devuelve una copia de la entrada con `variable` escalada por `factor`. */
function escalar(entrada, variable, factor) {
  const e = structuredClone(entrada);
  e.mercado = e.mercado ?? {};
  e.supuestos = e.supuestos ?? {};
  e.producto = e.producto ?? {};
  e.objetivo = e.objetivo ?? {};

  if (variable === 'costoConversacion') e.mercado.costoConversacion = (e.mercado.costoConversacion ?? 0) * factor;
  else if (variable === 'tasaEntrega') e.mercado.tasaEntrega = (e.mercado.tasaEntrega ?? 0.75) * factor;
  else if (variable === 'tasaCierre') e.mercado.tasaCierre = (e.mercado.tasaCierre ?? 0.20) * factor;
  else if (variable === 'costoPedidoFallido') {
    for (const k of ['fleteIda', 'fleteDevolucion', 'feeDevolucion', 'pctProductoPerdidoEnDevolucion']) {
      if (e.supuestos[k] != null) e.supuestos[k] *= factor;
    }
  } else if (variable === 'precio') {
    // "subir/bajar el precio": en modo evaluar mueve precioBase y la escalera;
    // en modo sugerir mueve la utilidad objetivo (proxy razonable).
    if (e.producto.precioBase != null) e.producto.precioBase *= factor;
    if (Array.isArray(e.producto.escaleraPrecios)) {
      e.producto.escaleraPrecios = e.producto.escaleraPrecios.map((f) => ({ ...f, precio: f.precio * factor }));
    }
    if ((e.objetivo.modo ?? 'sugerir') === 'sugerir' && e.objetivo.utilidadObjetivo != null) {
      e.objetivo.utilidadObjetivo *= factor;
    }
  }
  return e;
}

export function sensibilidadUnaVariable(entrada, variable, analizar) {
  const pasos = [];
  for (let i = -5; i <= 5; i++) {
    const delta = i / 10;
    const r = analizar(escalar(entrada, variable, 1 + delta));
    const c = r.combos[0];
    pasos.push({
      delta,
      utilidadFinal: c.utilidad.final,
      margenNeto: c.margen.neto,
      utilidadMes: r.proyeccion.utilidadMes,
      cruzaCero: false,
    });
  }
  for (let i = 1; i < pasos.length; i++) {
    const a = pasos[i - 1].utilidadFinal;
    const b = pasos[i].utilidadFinal;
    if (a != null && b != null && a !== 0 && Math.sign(a) !== Math.sign(b)) {
      pasos[i].cruzaCero = true;
      break;
    }
  }
  return pasos;
}

export function tornado(entrada, analizar) {
  const base = analizar(entrada).combos[0].utilidad.final;
  const filas = VARIABLES.map((variable) => {
    const abajo = analizar(escalar(entrada, variable, 0.9)).combos[0].utilidad.final;
    const arriba = analizar(escalar(entrada, variable, 1.1)).combos[0].utilidad.final;
    return {
      variable,
      impactoAbajo: abajo != null && base != null ? abajo - base : null,
      impactoArriba: arriba != null && base != null ? arriba - base : null,
    };
  });
  const mag = (f) => Math.max(Math.abs(f.impactoAbajo ?? 0), Math.abs(f.impactoArriba ?? 0));
  filas.sort((a, b) => mag(b) - mag(a));
  return filas;
}

export function matrizEntregaCierre(entrada, analizar) {
  const entregas = [0.5, 0.6, 0.7, 0.8, 0.9];
  const cierres = [0.10, 0.15, 0.20, 0.25, 0.30];
  const cerca = (arr, v) => arr.reduce((p, c) => (Math.abs(c - v) < Math.abs(p - v) ? c : p), arr[0]);
  const actualT = cerca(entregas, entrada?.mercado?.tasaEntrega ?? 0.75);
  const actualK = cerca(cierres, entrada?.mercado?.tasaCierre ?? 0.20);

  const celdas = entregas.map((te) => cierres.map((tk) => {
    const e = structuredClone(entrada);
    e.mercado = { ...(e.mercado ?? {}), tasaEntrega: te, tasaCierre: tk };
    return {
      entrega: te,
      cierre: tk,
      utilidadMes: analizar(e).proyeccion.utilidadMes,
      actual: te === actualT && tk === actualK,
    };
  }));

  return { ejes: { entrega: entregas, cierre: cierres }, celdas };
}
```

- [ ] **Step 4: Wire escenarios into `src/index.js`**

Add the import near the top:
```js
import { sensibilidadUnaVariable, tornado, matrizEntregaCierre, VARIABLES } from './escenarios.js';
```

Replace the `const escenarios = null; void conEscenarios;` block with:
```js
  let escenarios = null;
  if (conEscenarios) {
    const A = (e) => analizar(e, { conEscenarios: false });
    escenarios = {
      sensibilidad: Object.fromEntries(VARIABLES.map((v) => [v, sensibilidadUnaVariable(entradaNormalizada, v, A)])),
      tornado: tornado(entradaNormalizada, A),
      matrizEntregaCierre: matrizEntregaCierre(entradaNormalizada, A),
    };
  }
```

- [ ] **Step 5: Update `test/analizar.test.js`**

Change the assertion in the test `'devuelve la forma completa de Resultado'` from:
```js
  assert.equal(r.escenarios, null); // se completa en Task 11
```
to:
```js
  assert.ok(r.escenarios && r.escenarios.tornado && r.escenarios.sensibilidad);
```

- [ ] **Step 6: Run the tests**

Run: `node --test test/escenarios.test.js test/analizar.test.js`
Expected: PASS.

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: PASS — toda la suite verde.

- [ ] **Step 8: Commit**

```bash
git add src/escenarios.js src/index.js test/escenarios.test.js test/analizar.test.js
git commit -m "feat: escenarios — sensibilidad de una variable, tornado y matriz entrega×cierre"
```

---

## Self-Review

**1. Spec coverage**

| Spec | Task |
|---|---|
| `analizar(entrada) → Resultado`, pura y total | Task 9, 11 |
| `entrada` con defaults / clamps / mezcla / modo | Task 2 |
| `Resultado` (combos, mejorCombo, equilibrio, proyeccion, escenarios, avisos) | Tasks 6, 7, 9, 11 |
| Módulos `redondeo` / `costos` / `rentabilidad` / `publicidad` / `combos` / `equilibrio` / `escenarios` / `validacion` | Tasks 1, 3, 5, 4, 6, 7, 11, 8 |
| Fórmulas C.1–C.6 (costo fallido descompuesto, comisión, 3 denominadores) | Tasks 3, 5 |
| C.7 sugerir precio (despejar comisión, redondeo arriba) | Tasks 1, 6 |
| C.8 seis puntos de equilibrio en forma cerrada | Task 7 |
| C.9 proyección con fijos, `pedidosDia` vs `ventasEntregadasDia` | Task 9 |
| Escenarios: sensibilidad / tornado / matriz | Task 11 |
| Tabla de avisos de validación | Tasks 2, 6, 7, 8, 9 (repartida por origen; documentada en Task 8) |
| Redondeo configurable | Task 1 |
| Tests: identidades, equilibrio, escenarios, bordes, snapshot | Tasks 3–11 (unitarios) + Task 10 (integración/regresión) |
| `cc <= 0` ⇒ `null`, nunca `Infinity` | Tasks 4, 5, 9, 10 |

Sin huecos.

**2. Placeholder scan** — no hay "TBD"/"TODO"/"handle edge cases" sin código. Cada step de código trae el código completo.

**3. Type consistency**
- `crearCostos(ctx)` → `{cogs, costoPedidoFallido, colchonDevoluciones, comisionRecaudo, costoTotalPorVenta}` — usado igual en Tasks 5, 6, 7, 8.
- `costoTotalPorVenta(n, precio, cac)` — 3 args, el `cac` inyectado; usado así en `combos.js` (`costos.costoTotalPorVenta(n, ingreso, cac)`).
- `crearPublicidad(ctx)` → `{disponible, cac, pautaPorPedido, pautaPorVenta, roasActual}` — `cac` y demás son **funciones** (`p.cac()`); en `rentabilidad.js` se llama `publicidad.cac()` una vez y se guarda el número en `rent.cac`. En `equilibrio.js` también `publicidad.cac()`. Consistente.
- `crearRentabilidad(ctx, costos, publicidad)` → incluye `cac` (número|null). `combos.js` usa `rent.cac` (número), `rent.margen`, `rent.markup`, `rent.utilidad*`. Consistente.
- `evaluarCombo(n)` → `{combo, avisos}`; `combo.roas` y `combo.descuentoMaximoPct` arrancan en `null` y los completa `index.js`. Consistente con Task 9.
- `redondear(v, opts)` — mismo objeto `{granularidad, terminacion, direccion}` en Task 1 y Task 6 (`ctx.redondeo`).
- Escenarios reciben `analizar` como parámetro (`sensibilidadUnaVariable(entrada, variable, analizar)`) — Task 11 test y `index.js` lo pasan igual (`A`).

**Desviaciones del spec (deliberadas, menores):**
- El spec listaba `normalizarEntrada` dentro de `index.js`; se extrajo a `src/normalizar.js` para que `index.js` quede chico (el spec pide "< ~200 líneas"). `index.js` lo re-exporta.
- `roasEquilibrio` lo posee `equilibrio.js` (`roasMinimo`), no `publicidad.js`, para evitar la dependencia circular publicidad↔equilibrio. `publicidad.js` solo tiene `roasActual`.
- `mejorCombo.criterio` = `'mayor utilidad limpia por venta entregada'` en vez de `'utilidad/día ponderada por mezcla'`: elegir un único combo por una cantidad "ponderada por mezcla" no está bien definido (la mezcla ya alimenta proyección y `unidadesDiaParaFijos`). Con las fórmulas corregidas (colchón que escala con `n`, precios de escalera reales) `argmax(utilidad.final)` ya no es circular.
- Se añadió `src/util.js` (helpers `num`/`clamp`/`aviso`/`pesos`), no listado en el spec pero implícito.

---

## Execution Handoff

**Plan complete and saved to `docs/plan-fase1.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
