# Fase 2 — UI web · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la UI web de dos paneles sobre el motor de Fase 1: `index.html` + `ui/` (adapter puro sin DOM + renderers que solo conocen la `vista`), sin build, sin persistencia, sin catálogo.

**Architecture:** Tres capas con dependencia en un solo sentido — `ui/app.js` (DOM, eventos) → `ui/adapter.js` (puro, sin DOM, único que mapea `form`↔`entrada` y `Resultado`↔`vista`) → `src/index.js` (el motor, congelado). Los renderers (`render.js`, `graficos.js`) reciben la `vista` con todo pre-formateado y pre-escalado a 0–100 y solo pintan DOM/SVG. Recálculo debounced en cada cambio; escenarios diferidos vía `IntersectionObserver`.

**Tech Stack:** HTML + CSS + JavaScript ESM nativo, cero dependencias, cero bundler. Google Fonts (Geist). Tests puros con `node --test`. Server estático local de Node para previsualizar.

**Spec:** [`docs/diseno-fase2.md`](diseno-fase2.md). El motor que consume: [`docs/diseno-fase1.md`](diseno-fase1.md).

## Global Constraints

- **Sin build, sin dependencias.** `index.html` carga `ui/app.js` como `<script type="module">`; los módulos se importan con rutas relativas. Nada de npm packages nuevos.
- **Dependencia en un solo sentido:** `ui/app.js` → `ui/adapter.js` → `src/index.js`. `src/**` NO se modifica y no menciona `ui`/`document`/`window`. `ui/adapter.js` y `ui/formato.js` NO tocan `document`/`window`/`localStorage`/`fetch` (son puros, `node --test`). `ui/render.js` y `ui/graficos.js` NO importan de `../src/` — solo conocen la `vista`.
- **El renderer no hace aritmética de pricing.** Todo número (montos, %, anchos de barra, coordenadas SVG) llega ya calculado y escalado en la `vista`. El renderer hace `el.textContent = v`, `el.style.width = pct + '%'`, `el.className = clase`.
- **Plata:** entero COP, formato `es-CO` (`"$105.100"`). Porcentajes con coma decimal es-CO donde lleven decimales (`"59,2 %"`). Identificadores y comentarios **en español**.
- **Esta fase NO:** lee catálogo/CRM/`localStorage`/red; persiste nada; tiene modo oscuro cableado; cambia `src/`.
- **Tests:** `npm test` = `node --test --test-concurrency=1`, sin `--env-file`. Un archivo: `node --test test/<archivo>.test.js`. Las tareas de DOM se verifican abriendo la página con `npm run dev`; no hay runner de navegador.
- **`prefers-reduced-motion: reduce`** desactiva toda animación. Foco visible en todo control (`outline: 2px var(--acento)`).

---

### Task 1: `ui/formato.js` — helpers de formato puros

**Files:**
- Create: `ui/formato.js`
- Test: `test/formato.test.js`

**Interfaces:**
- Produces `ui/formato.js`:
  - `pesos(n) → string` — `"$105.100"` (es-CO, `Math.round`, sin decimales). `pesos(0) → "$0"`.
  - `pesosCompacto(n) → string` — `"$321k"` / `"−$1,2M"` para celdas chicas de la matriz (miles → `k`, millones → `M` con 1 decimal es-CO; < 1000 → `pesos(n)`).
  - `pct(fr, dec = 0) → string` — recibe una FRACCIÓN (`0.752`) → `"75 %"` (o `"75,2 %"` con `dec=1`). Coma decimal es-CO.
  - `ratio(n, dec = 1) → string` — `2.83` → `"2,8×"`.
  - `oGuion(v, fmt) → string` — `v == null` → `"—"`; si no `fmt(v)`.
  - `numero(n, dec = 1) → string` — `1.0` → `"1,0"` (es-CO), para pedidos/día etc.

- [ ] **Step 1: Write the failing test**

`test/formato.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pesos, pesosCompacto, pct, ratio, oGuion, numero } from '../ui/formato.js';

test('pesos: entero COP con separador de miles es-CO', () => {
  assert.equal(pesos(105100), '$105.100');
  assert.equal(pesos(0), '$0');
  assert.equal(pesos(104166.67), '$104.167');
  assert.equal(pesos(-2140), '-$2.140');
});

test('pesosCompacto: k / M con coma decimal', () => {
  assert.equal(pesosCompacto(321000), '$321k');
  assert.equal(pesosCompacto(-1200000), '-$1,2M');
  assert.equal(pesosCompacto(850), '$850');
});

test('pct: recibe fracción, devuelve porcentaje', () => {
  assert.equal(pct(0.75), '75 %');
  assert.equal(pct(0.592, 1), '59,2 %');
  assert.equal(pct(0.132), '13 %');
});

test('ratio: sufijo × con coma', () => {
  assert.equal(ratio(2.83), '2,8×');
  assert.equal(ratio(2.0), '2,0×');
});

test('oGuion: null → raya', () => {
  assert.equal(oGuion(null, pesos), '—');
  assert.equal(oGuion(0, pesos), '$0');
  assert.equal(oGuion(13333, pesos), '$13.333');
});

test('numero: un decimal es-CO', () => {
  assert.equal(numero(1), '1,0');
  assert.equal(numero(0.75), '0,8');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/formato.test.js`
Expected: FAIL — `Cannot find module '../ui/formato.js'`.

- [ ] **Step 3: Write `ui/formato.js`**

```js
/** Helpers de formato para la vista. Puros, sin DOM. Formato es-CO. */

const CO = 'es-CO';

/** Entero COP: "$105.100". Negativo: "-$2.140". */
export function pesos(n) {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString(CO);
}

/** Compacto para celdas chicas: "$321k", "-$1,2M". < 1000 → pesos(). */
export function pesosCompacto(n) {
  const v = Math.round(Number(n) || 0);
  const abs = Math.abs(v);
  const sig = v < 0 ? '-$' : '$';
  if (abs >= 1_000_000) return sig + (abs / 1_000_000).toLocaleString(CO, { maximumFractionDigits: 1 }) + 'M';
  if (abs >= 10_000) return sig + Math.round(abs / 1000).toLocaleString(CO) + 'k';
  return pesos(v);
}

/** Fracción → porcentaje. pct(0.75) → "75 %". */
export function pct(fr, dec = 0) {
  const v = (Number(fr) || 0) * 100;
  return v.toLocaleString(CO, { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' %';
}

/** "2,8×". */
export function ratio(n, dec = 1) {
  const v = Number(n) || 0;
  return v.toLocaleString(CO, { minimumFractionDigits: dec, maximumFractionDigits: dec }) + '×';
}

/** null/undefined → "—"; si no, fmt(v). */
export function oGuion(v, fmt) {
  return v == null ? '—' : fmt(v);
}

/** "1,0". */
export function numero(n, dec = 1) {
  return (Number(n) || 0).toLocaleString(CO, { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/formato.test.js`
Expected: PASS (6 tests). If a `toLocaleString` assertion differs by a NBSP vs space before `%` on your Node build, adjust the test literal to match `pct()`'s real output (Node 22 ICU uses a normal space here) — do not change the function.

- [ ] **Step 5: Commit**

```bash
git add ui/formato.js test/formato.test.js
git commit -m "$(cat <<'EOF'
feat(ui): formato.js — helpers de formato es-CO puros

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `ui/adapter.js` — `CAMPOS` + `formToEntrada`

**Files:**
- Create: `ui/adapter.js`
- Test: `test/adapter-form-a-entrada.test.js`

**Interfaces:**
- Consumes: `{ DEFAULTS }` de `../src/index.js`.
- Produces `ui/adapter.js` (esta task deja el archivo con estas exports; Task 3 y 4 le agregan más):
  - `export const CAMPOS` — array de `{ id, grupo:'basico'|'avanzado', modo:'ambos'|'sugerir'|'evaluar', seccion:'producto'|'contraentrega'|'publicidad'|'avanzado', tipo:'moneda'|'porcentaje'|'entero'|'opciones', label, ayuda, defecto, opciones? }`.
  - `export function formToEntrada(form) → entrada` — objeto anidado `{ producto, supuestos, mercado, publicidad, overhead, mezcla, objetivo }` que consume `analizar()`.

**Reglas de parseo** (en `formToEntrada`):
- Moneda / entero: quitar todo lo que no sea dígito, `-` o coma decimal; coma → punto; `Number()`. `"$37.500"` → `37500`, `"37.500,50"` → `37500.5`, `""`/basura → el `defecto` del campo.
- Porcentaje: parsear como número (coma → punto) y **dividir entre 100**. `"75"` → `0.75`, `"7,5"` → `0.075`, `""` → `defecto/100` si el defecto está en escala 0–1… NO: los `defecto` de `CAMPOS` para campos `%` se guardan ya en escala 0–100 (lo que el usuario ve), y `formToEntrada` los divide. `""` → `defecto/100`.
- `modo`: `form.modo === 'evaluar' ? 'evaluar' : 'sugerir'`.
- `escaleraPrecios`: en modo evaluar, `[{cantidad:2, precio:P2}, {cantidad:3, precio:P3}]` solo con las filas cuyo precio parseó > 0; `precio2`/`precio3` vacíos → no se incluye esa fila. En modo sugerir → `[]`.
- `precioBase`: en modo evaluar = `parse(form.precioBase)`; en modo sugerir = `null`.
- `objetivo.utilidadObjetivo`: `parse(form.utilidadObjetivo)` (0 si vacío).
- `mezcla`: `{ 1: parse(mezcla1), 2: parse(mezcla2), 3: parse(mezcla3) }` — **sin** dividir entre 100 (el motor renormaliza; da igual la escala). Vacío en los 3 → `{ 1: 100, 2: 0, 3: 0 }`.
- `redondeoDireccion` fuera de `['arriba','cercano','abajo']` → `'arriba'`.

- [ ] **Step 1: Write the failing test**

`test/adapter-form-a-entrada.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPOS, formToEntrada } from '../ui/adapter.js';

// Un form "vacío" = todos los campos como los deja el navegador al arrancar: el string del defecto.
function formDefecto(over = {}) {
  const f = { modo: 'sugerir' };
  for (const c of CAMPOS) f[c.id] = String(c.defecto ?? '');
  return { ...f, ...over };
}

test('CAMPOS: cubre los campos del spec, con grupo y modo', () => {
  const ids = CAMPOS.map((c) => c.id);
  for (const req of ['costoUnitario', 'utilidadObjetivo', 'precioBase', 'precio2', 'precio3',
    'fleteIda', 'fleteDevolucion', 'tasaEntrega', 'tasaCierre', 'costoConversacion', 'presupuestoDia',
    'comisionRecaudoPct', 'comisionRecaudoFijo', 'feeDevolucion', 'pctProductoPerdido', 'empaque',
    'costoAtencionConv', 'cesionCombo', 'costosFijosMes', 'diasOperacionMes',
    'mezcla1', 'mezcla2', 'mezcla3', 'redondeoGranularidad', 'redondeoTerminacion', 'redondeoDireccion']) {
    assert.ok(ids.includes(req), `falta CAMPOS.${req}`);
  }
  assert.ok(CAMPOS.find((c) => c.id === 'utilidadObjetivo').modo === 'sugerir');
  assert.ok(CAMPOS.find((c) => c.id === 'precioBase').modo === 'evaluar');
});

test('moneda: distintos formatos → mismo número', () => {
  const e = formToEntrada(formDefecto({ costoUnitario: '$37.500' }));
  assert.equal(e.producto.costoUnitario, 37500);
  assert.equal(formToEntrada(formDefecto({ costoUnitario: '37500' })).producto.costoUnitario, 37500);
  assert.equal(formToEntrada(formDefecto({ costoUnitario: '37.500,50' })).producto.costoUnitario, 37500.5);
  assert.equal(formToEntrada(formDefecto({ costoUnitario: 'abc' })).producto.costoUnitario,
    Number(CAMPOS.find((c) => c.id === 'costoUnitario').defecto));
});

test('porcentaje: se divide entre 100', () => {
  const e = formToEntrada(formDefecto({ tasaEntrega: '75', tasaCierre: '7,5' }));
  assert.equal(e.mercado.tasaEntrega, 0.75);
  assert.equal(e.mercado.tasaCierre, 0.075);
});

test('modo sugerir: precioBase null, escalera vacía, utilidadObjetivo se usa', () => {
  const e = formToEntrada(formDefecto({ modo: 'sugerir', utilidadObjetivo: '40000' }));
  assert.equal(e.producto.precioBase, null);
  assert.deepEqual(e.producto.escaleraPrecios, []);
  assert.equal(e.objetivo.modo, 'sugerir');
  assert.equal(e.objetivo.utilidadObjetivo, 40000);
});

test('modo evaluar: precioBase + escalera de las filas con precio', () => {
  const e = formToEntrada(formDefecto({ modo: 'evaluar', precioBase: '119900', precio2: '198900', precio3: '' }));
  assert.equal(e.objetivo.modo, 'evaluar');
  assert.equal(e.producto.precioBase, 119900);
  assert.deepEqual(e.producto.escaleraPrecios, [{ cantidad: 2, precio: 198900 }]);
});

test('mezcla: los 3 campos, sin dividir', () => {
  const e = formToEntrada(formDefecto({ mezcla1: '50', mezcla2: '30', mezcla3: '20' }));
  assert.deepEqual(e.mezcla, { 1: 50, 2: 30, 3: 20 });
});

test('redondeoDireccion inválida → arriba', () => {
  const e = formToEntrada(formDefecto({ redondeoDireccion: 'lateral' }));
  assert.equal(e.supuestos.redondeo.direccion, 'arriba');
});

test('avanzado: comisión %/fijo, empaque, fijos, días — mapean al lugar correcto', () => {
  const e = formToEntrada(formDefecto({
    comisionRecaudoPct: '3', comisionRecaudoFijo: '1500', empaque: '800',
    costosFijosMes: '3000000', diasOperacionMes: '26',
  }));
  assert.equal(e.supuestos.comisionRecaudoPct, 0.03);
  assert.equal(e.supuestos.comisionRecaudoFijo, 1500);
  assert.equal(e.supuestos.empaquePorPedido, 800);
  assert.equal(e.overhead.costosFijosMes, 3000000);
  assert.equal(e.overhead.diasOperacionMes, 26);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/adapter-form-a-entrada.test.js`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Write `ui/adapter.js`**

```js
/**
 * Adapter puro (sin DOM). Único módulo que habla los dos vocabularios:
 * (form del panel izquierdo) <-> entrada del motor, y Resultado <-> vista.
 * Task 2: CAMPOS + formToEntrada. Task 3/4 agregan resultadoToVista y las funciones públicas.
 */
import { analizar, DEFAULTS } from '../src/index.js';
import { pesos, pesosCompacto, pct, ratio, oGuion, numero } from './formato.js';

const D = DEFAULTS;

// --- Metadata del formulario. app.js/formulario.js construye el <form> desde acá. ---
// `defecto` de campos `%` se guarda en escala 0–100 (lo que ve el usuario); formToEntrada divide.
export const CAMPOS = [
  // PRODUCTO
  { id: 'costoUnitario', grupo: 'basico', modo: 'ambos', seccion: 'producto', tipo: 'moneda',
    label: 'Costo del proveedor (por unidad)', ayuda: 'Lo que te cuesta una unidad, sin flete.', defecto: 0 },
  { id: 'utilidadObjetivo', grupo: 'basico', modo: 'sugerir', seccion: 'producto', tipo: 'moneda',
    label: 'Utilidad que querés ganar', ayuda: 'Por venta entregada, antes de descontar publicidad.', defecto: 40000 },
  { id: 'precioBase', grupo: 'basico', modo: 'evaluar', seccion: 'producto', tipo: 'moneda',
    label: 'Precio 1 unidad', ayuda: 'El precio al que vendés una unidad.', defecto: 0 },
  { id: 'precio2', grupo: 'basico', modo: 'evaluar', seccion: 'producto', tipo: 'moneda',
    label: 'Precio 2 unidades (combo)', ayuda: 'Opcional. Vacío = 2 × el precio de 1.', defecto: '' },
  { id: 'precio3', grupo: 'basico', modo: 'evaluar', seccion: 'producto', tipo: 'moneda',
    label: 'Precio 3 unidades (combo)', ayuda: 'Opcional. Vacío = 3 × el precio de 1.', defecto: '' },
  // CONTRAENTREGA
  { id: 'fleteIda', grupo: 'basico', modo: 'ambos', seccion: 'contraentrega', tipo: 'moneda',
    label: 'Flete de ida (se paga siempre)', ayuda: 'El transportador lo cobra entregue o no.', defecto: D.supuestos.fleteIda },
  { id: 'fleteDevolucion', grupo: 'basico', modo: 'ambos', seccion: 'contraentrega', tipo: 'moneda',
    label: 'Flete de devolución (si rebota)', ayuda: 'Lo que cuesta que la guía vuelva.', defecto: D.supuestos.fleteDevolucion },
  { id: 'tasaEntrega', grupo: 'basico', modo: 'ambos', seccion: 'contraentrega', tipo: 'porcentaje',
    label: 'Entrega efectiva', ayuda: '% de pedidos generados que se entregan y pagan.', defecto: D.mercado.tasaEntrega * 100 },
  // PUBLICIDAD
  { id: 'costoConversacion', grupo: 'basico', modo: 'ambos', seccion: 'publicidad', tipo: 'moneda',
    label: 'Costo por conversación', ayuda: 'Lo que te cobra la plataforma por cada conversación iniciada.', defecto: D.mercado.costoConversacion },
  { id: 'tasaCierre', grupo: 'basico', modo: 'ambos', seccion: 'publicidad', tipo: 'porcentaje',
    label: 'Cierre chat → venta', ayuda: '% de conversaciones que terminan en pedido.', defecto: D.mercado.tasaCierre * 100 },
  { id: 'presupuestoDia', grupo: 'basico', modo: 'ambos', seccion: 'publicidad', tipo: 'moneda',
    label: 'Presupuesto diario de pauta', ayuda: 'Cuánto gastás por día en anuncios.', defecto: D.publicidad.presupuestoDia },
  // AVANZADO
  { id: 'comisionRecaudoPct', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'porcentaje',
    label: 'Comisión de recaudo (%)', ayuda: '% sobre el valor recaudado (Dropi/transportadora).', defecto: D.supuestos.comisionRecaudoPct * 100 },
  { id: 'comisionRecaudoFijo', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'moneda',
    label: 'Comisión de recaudo (fijo)', ayuda: 'Monto fijo por pedido entregado.', defecto: D.supuestos.comisionRecaudoFijo },
  { id: 'feeDevolucion', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'moneda',
    label: 'Fee fijo por devolución', ayuda: 'Cargo fijo del operador cuando una guía se devuelve.', defecto: D.supuestos.feeDevolucion },
  { id: 'pctProductoPerdido', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'porcentaje',
    label: '% de producto perdido en devolución', ayuda: 'Qué parte del costo del producto no recuperás cuando vuelve.', defecto: D.supuestos.pctProductoPerdidoEnDevolucion * 100 },
  { id: 'empaque', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'moneda',
    label: 'Empaque por pedido', ayuda: 'Caja, relleno, etiqueta.', defecto: D.supuestos.empaquePorPedido },
  { id: 'costoAtencionConv', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'moneda',
    label: 'Costo de atender la conversación', ayuda: 'Tiempo del asesor / herramienta, aparte del costo de ads.', defecto: D.supuestos.costoAtencionConversacion },
  { id: 'cesionCombo', grupo: 'avanzado', modo: 'sugerir', seccion: 'avanzado', tipo: 'porcentaje',
    label: 'Cesión de utilidad por unidad extra', ayuda: 'Cuánta utilidad "regalás" por cada unidad de más en el combo.', defecto: D.supuestos.cesionUtilidadPorUnidadExtra * 100 },
  { id: 'costosFijosMes', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'moneda',
    label: 'Costos fijos al mes', ayuda: 'Sueldos, software, arriendo — lo que pagás vendas o no.', defecto: D.overhead.costosFijosMes },
  { id: 'diasOperacionMes', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'entero',
    label: 'Días de operación al mes', ayuda: 'Para repartir los fijos y proyectar.', defecto: D.overhead.diasOperacionMes },
  { id: 'mezcla1', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'porcentaje',
    label: 'Mezcla de ventas · 1u (%)', ayuda: 'Qué parte de tus ventas es de 1 unidad.', defecto: 100 },
  { id: 'mezcla2', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'porcentaje',
    label: 'Mezcla de ventas · 2u (%)', ayuda: '', defecto: 0 },
  { id: 'mezcla3', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'porcentaje',
    label: 'Mezcla de ventas · 3u (%)', ayuda: '', defecto: 0 },
  { id: 'redondeoGranularidad', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'entero',
    label: 'Redondeo · múltiplo', ayuda: 'El precio sugerido se redondea a este múltiplo.', defecto: D.supuestos.redondeo.granularidad },
  { id: 'redondeoTerminacion', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'entero',
    label: 'Redondeo · terminación', ayuda: 'Se resta al múltiplo (900 = precios "…900").', defecto: D.supuestos.redondeo.terminacion },
  { id: 'redondeoDireccion', grupo: 'avanzado', modo: 'ambos', seccion: 'avanzado', tipo: 'opciones',
    label: 'Redondeo · dirección', ayuda: '"arriba" nunca deja el precio bajo el objetivo.',
    defecto: D.supuestos.redondeo.direccion, opciones: ['arriba', 'cercano', 'abajo'] },
];

const CAMPO_POR_ID = Object.fromEntries(CAMPOS.map((c) => [c.id, c]));

function parseNum(str, defecto = 0) {
  if (str == null) return defecto;
  const limpio = String(str).replace(/[^\d,.\-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(limpio);
  return Number.isFinite(n) ? n : defecto;
}

function leerCampo(form, id) {
  const c = CAMPO_POR_ID[id];
  const crudo = form[id];
  if (c.tipo === 'opciones') {
    return c.opciones.includes(crudo) ? crudo : c.defecto;
  }
  const vacio = crudo == null || String(crudo).trim() === '';
  if (c.tipo === 'porcentaje') {
    const base = vacio ? Number(c.defecto) : parseNum(crudo, Number(c.defecto));
    return base / 100;
  }
  return vacio ? Number(c.defecto) || 0 : parseNum(crudo, Number(c.defecto) || 0);
}

/** form (strings del DOM) → entrada anidada que consume analizar(). */
export function formToEntrada(form) {
  const g = (id) => leerCampo(form, id);
  const modo = form.modo === 'evaluar' ? 'evaluar' : 'sugerir';

  const escaleraPrecios = [];
  if (modo === 'evaluar') {
    const p2 = parseNum(form.precio2, 0);
    const p3 = parseNum(form.precio3, 0);
    if (p2 > 0) escaleraPrecios.push({ cantidad: 2, precio: p2 });
    if (p3 > 0) escaleraPrecios.push({ cantidad: 3, precio: p3 });
  }

  return {
    producto: {
      costoUnitario: g('costoUnitario'),
      precioBase: modo === 'evaluar' ? g('precioBase') : null,
      escaleraPrecios,
    },
    supuestos: {
      fleteIda: g('fleteIda'),
      fleteDevolucion: g('fleteDevolucion'),
      feeDevolucion: g('feeDevolucion'),
      pctProductoPerdidoEnDevolucion: g('pctProductoPerdido'),
      comisionRecaudoPct: g('comisionRecaudoPct'),
      comisionRecaudoFijo: g('comisionRecaudoFijo'),
      empaquePorPedido: g('empaque'),
      costoAtencionConversacion: g('costoAtencionConv'),
      cesionUtilidadPorUnidadExtra: g('cesionCombo'),
      redondeo: {
        granularidad: g('redondeoGranularidad'),
        terminacion: g('redondeoTerminacion'),
        direccion: g('redondeoDireccion'),
      },
    },
    mercado: {
      tasaEntrega: g('tasaEntrega'),
      tasaCierre: g('tasaCierre'),
      costoConversacion: g('costoConversacion'),
    },
    publicidad: { presupuestoDia: g('presupuestoDia') },
    overhead: { costosFijosMes: g('costosFijosMes'), diasOperacionMes: g('diasOperacionMes') },
    // mezcla sin dividir: el motor renormaliza (da igual la escala).
    mezcla: { 1: parseNum(form.mezcla1, 100), 2: parseNum(form.mezcla2, 0), 3: parseNum(form.mezcla3, 0) },
    objetivo: { modo, utilidadObjetivo: g('utilidadObjetivo') },
  };
}
```

Nota sobre `parseNum`: el `replace` de puntos de miles borra un `.` seguido de exactamente 3 dígitos y luego un no-dígito o fin; deja intacto el `.` decimal de `"37.5"` o `"37500.50"`. Suficiente para entrada de un formulario COP.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/adapter-form-a-entrada.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Run the whole suite (el motor no debe romperse)**

Run: `npm test`
Expected: PASS — 90 de Fase 1 + 6 de Task 1 + 8 de Task 2.

- [ ] **Step 6: Commit**

```bash
git add ui/adapter.js test/adapter-form-a-entrada.test.js
git commit -m "$(cat <<'EOF'
feat(ui): adapter — CAMPOS + formToEntrada (form del DOM → entrada del motor)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `ui/adapter.js` — `resultadoToVista` (bloques 1–5)

**Files:**
- Modify: `ui/adapter.js` (agrega `resultadoToVista` y helpers `vistaVeredicto/vistaCombos/vistaDesglose/vistaEquilibrio/vistaProyeccion` + `vistaAvisos`)
- Test: `test/adapter-resultado-a-vista.test.js`

**Interfaces:**
- Consumes: `analizar` de `../src/index.js` (para armar `Resultado` reales en el test), los helpers de `./formato.js`, y `formToEntrada` (Task 2).
- Produces: `export function resultadoToVista(resultado, modo) → vista` **sin la parte `escenarios`** (queda `escenarios: null` acá; Task 4 la llena). `vista` tiene: `meta`, `veredicto`, `avisos`, `resumenAvisos`, `combos`, `desglose`, `equilibrio`, `proyeccion`, `escenarios: null`. Forma exacta en `docs/diseno-fase2.md` §«Forma de vista».

**Reglas de derivación** (del spec, resumidas — implementalas tal cual):
- `veredicto.estado`: `'sin-pauta'` si `combos[0].utilidad.final == null`; si no `'gana'` si algún combo tiene `utilidad.final > 0`, `'pierde'` si ninguno. `clase`: `ver-gana`/`ver-pierde`/`ver-neutro`. `titulo`: `'SÍ, VAS GANANDO'` / `'NO, VAS PERDIENDO'` / `'FALTAN DATOS DE PAUTA'`.
- `veredicto.gananciaComboN` = `resultado.mejorCombo.n`. `gananciaLimpia` = `oGuion(mejorComboObj.utilidad.final, pesos)`. `mejorCombo` = `{ n, precio: pesos(mejorComboObj.ingreso), margenPct: oGuion(mejorComboObj.margen.neto, (f)=>pct(f)) }`.
- `veredicto.topeConversacion` = `oGuion(resultado.equilibrio.costoConversacionMaximo, pesos)`. `costoConversacionActual` = `pesos(resultado.entradaNormalizada.mercado.costoConversacion)`. `holguraConversacion` = si ambos números: `pesos(tope - actual)` (con signo); si tope null → `'—'`.
- `veredicto.lineas`: 3 frases armadas (ver test). Si `sin-pauta`, `lineas` = `['Cargá el costo por conversación para ver si la campaña te sirve.']`.
- `vistaAvisos`: `resultado.avisos.map(a => ({ ...a, clase: a.nivel === 'error' ? 'av-error' : 'av-aviso' }))`; `resumenAvisos` = conteo por nivel.
- `combos[i]`: `n`, `titulo` (`'1 unidad'`/`'2 unidades'`/`'3 unidades'`), `esMejor` (`n === mejorCombo.n`), `precio: pesos(ingreso)`, `precioRaw: ingreso`, `esSugerido`, `precioSugerido: pesos(combo.precioSugerido)`, `editable: modo === 'evaluar'`, `gana: oGuion(utilidad.final, pesos)`, `margenNeto: oGuion(margen.neto, (f)=>pct(f))`, `margenBruto: oGuion(margen.bruto, (f)=>pct(f))`, `markup: oGuion(markup.sobreProducto, ratio)`, `cac: oGuion(cac, pesos)`, `descuentoMax: oGuion(descuentoMaximoPct, (f)=>pct(f))`, `semaforo: { nivel, clase: 'sem-'+nivel, anchoPct: ANCHO_SEMAFORO[nivel], etiqueta: ETIQUETA_SEMAFORO[nivel] }`.
  - `ANCHO_SEMAFORO = { premium:100, sano:75, apretado:48, 'muy-apretado':25, pierde:12, 'sin-dato':0 }`
  - `ETIQUETA_SEMAFORO = { premium:'Margen premium', sano:'Margen sano', apretado:'Apretado', 'muy-apretado':'Muy apretado', pierde:'Pierde plata', 'sin-dato':'Sin datos' }`
- `desglose` (combo seleccionado, default n=1): `comboN`, `precio: pesos(ingreso)`, `precioRaw: ingreso`. `partes`: las 5 de `combo.costo` (`cogs, fleteIda, comisionRecaudo, empaque, colchonDevoluciones`) + `utilidad` = `ingreso − suma(las 5)`. Cada parte: `{ clave, label, monto: pesos(v), anchoPct: clamp(v/ingreso*100, 0, 100), clase: 'part-'+idx }`. `cac: oGuion(combo.cac, pesos)`, `notaCac` (texto fijo del spec).
  - labels: `cogs→'Producto'`, `fleteIda→'Flete'`, `comisionRecaudo→'Comisión de recaudo'`, `empaque→'Empaque'`, `colchonDevoluciones→'Colchón devoluciones'`, `utilidad→'Tu utilidad'`.
- `equilibrio`: 6 filas (ver spec §«Forma de vista» y §«Reglas de derivación»). Fuente:
  - `precioMinimo` → `resultado.equilibrio.precioMinimo[0].valor` (n=1); `actual` = `combos[0].ingreso`.
  - `entregaMinima` → `resultado.equilibrio.tasaEntregaMinima`; `actual` = `entradaNormalizada.mercado.tasaEntrega`.
  - `cierreMinimo` → `tasaCierreMinima`; `actual` = `mercado.tasaCierre`.
  - `costoConvMax` → `costoConversacionMaximo`; `actual` = `mercado.costoConversacion`.
  - `roasMinimo` → `resultado.equilibrio.roasMinimo`; `actual` = `combos[0].roas.actual`.
  - `unidadesDiaFijos` → `resultado.equilibrio.unidadesDiaParaFijos`; sin `actual`.
  - Por fila: `limite` formateado según el tipo (moneda / % / ratio); `alcanzable = limite != null`; si no alcanzable → `limite: '—'`. `clase`: `'eq-malo'` si el valor actual ya está del lado perdedor del límite (para mínimos: actual < límite; para máximos como `costoConvMax`: actual > límite); `'eq-ajustado'` si `|actual - límite| / límite < 0.15`; si no `'eq-ok'`. `holguraPct` = `clamp(|actual - límite| / límite * 100, 0, 100)` (0 si no aplica).
- `proyeccion`: `disponible = resultado.proyeccion.utilidadMes != null`. Si no disponible → `{ disponible:false, nota:'Cargá presupuesto de pauta y costo por conversación para proyectar.', pedidosDia:'—', ventasEntregadasDia:'—', utilidadDia:'—', utilidadMes:'—' }`. Si disponible → `numero()` para pedidos/ventas, `pesos()` para utilidad día/mes, `nota` fija.

- [ ] **Step 1: Write the failing test**

`test/adapter-resultado-a-vista.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/adapter-resultado-a-vista.test.js`
Expected: FAIL — `resultadoToVista` no exportado.

- [ ] **Step 3: Implement `resultadoToVista` en `ui/adapter.js`**

Agregá al final de `ui/adapter.js` (antes o después de `formToEntrada`, mismo archivo):

```js
// --- Resultado del motor → vista que pinta el renderer ---

const ANCHO_SEMAFORO = { premium: 100, sano: 75, apretado: 48, 'muy-apretado': 25, pierde: 12, 'sin-dato': 0 };
const ETIQUETA_SEMAFORO = {
  premium: 'Margen premium', sano: 'Margen sano', apretado: 'Apretado',
  'muy-apretado': 'Muy apretado', pierde: 'Pierde plata', 'sin-dato': 'Sin datos',
};
const LABEL_PARTE = {
  cogs: 'Producto', fleteIda: 'Flete', comisionRecaudo: 'Comisión de recaudo',
  empaque: 'Empaque', colchonDevoluciones: 'Colchón devoluciones', utilidad: 'Tu utilidad',
};
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const pctFr = (f, d = 0) => pct(f, d);

function vistaAvisos(avisos) {
  const lista = avisos.map((a) => ({ ...a, clase: a.nivel === 'error' ? 'av-error' : 'av-aviso' }));
  const resumen = { errores: 0, avisos: 0 };
  for (const a of lista) resumen[a.nivel === 'error' ? 'errores' : 'avisos']++;
  return { lista, resumen };
}

function vistaVeredicto(r) {
  const c1 = r.combos[0];
  const mejor = r.combos.find((c) => c.n === r.mejorCombo.n) || c1;
  const sinPauta = c1.utilidad.final == null;
  const gana = !sinPauta && r.combos.some((c) => c.utilidad.final > 0);
  const estado = sinPauta ? 'sin-pauta' : gana ? 'gana' : 'pierde';
  const tope = r.equilibrio.costoConversacionMaximo;
  const actualCC = r.entradaNormalizada.mercado.costoConversacion;
  const holgura = tope == null ? null : tope - actualCC;

  const lineas = sinPauta
    ? ['Cargá el costo por conversación para ver si la campaña te sirve.']
    : [
        `Ganás ${oGuion(mejor.utilidad.final, pesos)} limpios por venta entregada (combo de ${mejor.n}u).`,
        `Mejor combo: ${mejor.n} unidad${mejor.n > 1 ? 'es' : ''} · ${pesos(mejor.ingreso)} · margen neto ${oGuion(mejor.margen.neto, pctFr)}.`,
        tope == null
          ? 'No se puede estimar el tope por conversación con estos datos.'
          : `Podés pagar hasta ${pesos(tope)} por conversación (hoy pagás ${pesos(actualCC)}).`,
      ];

  return {
    estado,
    titulo: sinPauta ? 'FALTAN DATOS DE PAUTA' : gana ? 'SÍ, VAS GANANDO' : 'NO, VAS PERDIENDO',
    clase: sinPauta ? 'ver-neutro' : gana ? 'ver-gana' : 'ver-pierde',
    gananciaLimpia: oGuion(mejor.utilidad.final, pesos),
    gananciaComboN: mejor.n,
    mejorCombo: { n: mejor.n, precio: pesos(mejor.ingreso), margenPct: oGuion(mejor.margen.neto, pctFr) },
    topeConversacion: oGuion(tope, pesos),
    costoConversacionActual: pesos(actualCC),
    holguraConversacion: holgura == null ? '—' : pesos(holgura),
    lineas,
  };
}

function vistaCombos(r, modo) {
  return r.combos.map((c) => ({
    n: c.n,
    titulo: `${c.n} unidad${c.n > 1 ? 'es' : ''}`,
    esMejor: c.n === r.mejorCombo.n,
    precio: pesos(c.ingreso),
    precioRaw: c.ingreso,
    esSugerido: c.esSugerido,
    precioSugerido: pesos(c.precioSugerido),
    editable: modo === 'evaluar',
    gana: oGuion(c.utilidad.final, pesos),
    margenNeto: oGuion(c.margen.neto, pctFr),
    margenBruto: oGuion(c.margen.bruto, pctFr),
    markup: oGuion(c.markup.sobreProducto, ratio),
    cac: oGuion(c.cac, pesos),
    descuentoMax: oGuion(c.descuentoMaximoPct, pctFr),
    semaforo: {
      nivel: c.semaforo.nivel,
      clase: 'sem-' + c.semaforo.nivel,
      anchoPct: ANCHO_SEMAFORO[c.semaforo.nivel] ?? 0,
      etiqueta: ETIQUETA_SEMAFORO[c.semaforo.nivel] ?? '',
    },
  }));
}

function vistaDesglose(r, comboN = 1) {
  const c = r.combos.find((x) => x.n === comboN) || r.combos[0];
  const ing = c.ingreso;
  const claves = ['cogs', 'fleteIda', 'comisionRecaudo', 'empaque', 'colchonDevoluciones'];
  const base = claves.map((k) => c.costo[k]);
  const utilidad = ing - base.reduce((a, b) => a + b, 0);
  const montos = [...base, utilidad];
  const partes = [...claves, 'utilidad'].map((k, i) => ({
    clave: k,
    label: LABEL_PARTE[k],
    monto: pesos(montos[i]),
    anchoPct: ing > 0 ? clamp((montos[i] / ing) * 100, 0, 100) : 0,
    clase: 'part-' + (i + 1),
  }));
  return {
    comboN: c.n,
    precio: pesos(ing),
    precioRaw: ing,
    partes,
    cac: oGuion(c.cac, pesos),
    notaCac: 'No es costo de la unidad: es lo que cuesta traer al cliente que paga (pauta + atención ÷ cierre ÷ entrega).',
  };
}

function filaEquilibrio(clave, label, limite, actual, tipo, dir) {
  // tipo: 'moneda' | 'pct' | 'ratio' | 'numero'.  dir: 'min' (actual debe superar el límite) | 'max' (actual debe estar por debajo).
  const fmt = tipo === 'moneda' ? pesos
    : tipo === 'ratio' ? ratio
    : tipo === 'numero' ? ((x) => numero(x, 1))
    : (x) => pct(x, 1);
  const alcanzable = limite != null;
  let clase = 'eq-ok';
  let holguraPct = 0;
  if (alcanzable && actual != null && limite > 0) {
    const rel = Math.abs(actual - limite) / limite;
    holguraPct = clamp(rel * 100, 0, 100);
    const perdiendo = dir === 'min' ? actual < limite : actual > limite;
    clase = perdiendo ? 'eq-malo' : rel < 0.15 ? 'eq-ajustado' : 'eq-ok';
  }
  return {
    clave, label,
    limite: alcanzable ? fmt(limite) : '—',
    actualLabel: actual == null ? '' : dir === 'max' ? 'hoy pagás' : 'tu valor',
    actual: actual == null ? '' : fmt(actual),
    holguraPct, clase, alcanzable,
  };
}

function vistaEquilibrio(r) {
  const eq = r.equilibrio;
  const m = r.entradaNormalizada.mercado;
  const ing1 = r.combos[0].ingreso;
  const filas = [
    filaEquilibrio('precioMinimo', 'Precio mínimo (1u)', eq.precioMinimo[0]?.valor, ing1, 'moneda', 'min'),
    filaEquilibrio('entregaMinima', 'Entrega mínima', eq.tasaEntregaMinima, m.tasaEntrega, 'pct', 'min'),
    filaEquilibrio('cierreMinimo', 'Cierre mínimo', eq.tasaCierreMinima, m.tasaCierre, 'pct', 'min'),
    filaEquilibrio('costoConvMax', 'Costo/conversación máx', eq.costoConversacionMaximo, m.costoConversacion, 'moneda', 'max'),
    filaEquilibrio('roasMinimo', 'ROAS mínimo', eq.roasMinimo, r.combos[0].roas.actual, 'ratio', 'min'),
    filaEquilibrio('unidadesDiaFijos', 'Unidades/día para fijos', eq.unidadesDiaParaFijos, null, 'numero', 'min'),
  ];
  // etiqueta de actual más específica
  filas[0].actualLabel = 'vendés a';
  filas[1].actualLabel = filas[2].actualLabel = 'tu tasa';
  filas[4].actualLabel = 'tu ROAS';
  return filas;
}

function vistaProyeccion(r) {
  const p = r.proyeccion;
  if (p.utilidadMes == null) {
    return {
      disponible: false,
      nota: 'Cargá presupuesto de pauta y costo por conversación para proyectar.',
      pedidosDia: '—', ventasEntregadasDia: '—', utilidadDia: '—', utilidadMes: '—',
    };
  }
  return {
    disponible: true,
    pedidosDia: numero(p.pedidosDia),
    ventasEntregadasDia: numero(p.ventasEntregadasDia),
    utilidadDia: pesos(p.utilidadDia),
    utilidadDiaRaw: p.utilidadDia,
    utilidadMes: pesos(p.utilidadMes),
    utilidadMesRaw: p.utilidadMes,
    nota: 'Ya restados pauta, atención y costos fijos.',
  };
}

export function resultadoToVista(resultado, modo, comboSeleccionado = 1) {
  const av = vistaAvisos(resultado.avisos);
  return {
    meta: { modo, comboSeleccionado },
    veredicto: vistaVeredicto(resultado),
    avisos: av.lista,
    resumenAvisos: av.resumen,
    combos: vistaCombos(resultado, modo),
    desglose: vistaDesglose(resultado, comboSeleccionado),
    equilibrio: vistaEquilibrio(resultado),
    proyeccion: vistaProyeccion(resultado),
    escenarios: null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/adapter-resultado-a-vista.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ui/adapter.js test/adapter-resultado-a-vista.test.js
git commit -m "$(cat <<'EOF'
feat(ui): adapter — resultadoToVista (bloques 1–5: veredicto/combos/desglose/equilibrio/proyección)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `ui/adapter.js` — escenarios + funciones públicas

**Files:**
- Modify: `ui/adapter.js` (agrega `vistaEscenarios`, `analizarDesdeFormulario`, `escenariosDesdeFormulario`)
- Test: `test/adapter-escenarios.test.js`

**Interfaces:**
- Produces:
  - `export function analizarDesdeFormulario(form) → { vista, entradaNormalizada, avisos }` — llama `analizar(formToEntrada(form), { conEscenarios: false })` → `resultadoToVista(...)`; `vista.escenarios` queda `null`.
  - `export function escenariosDesdeFormulario(form) → vistaEscenarios` — llama `analizar(formToEntrada(form), { conEscenarios: true })` y devuelve **solo** la parte escenarios ya reshaped: `{ sensibilidad: { variables: [...] }, tornado: [...], matriz: {...} }`.
- Consumes: la forma de `resultado.escenarios` del motor: `{ sensibilidad: { [clave]: [{delta, utilidadFinal, margenNeto, utilidadMes, cruzaCero}] (11) }, tornado: [{variable, impactoAbajo, impactoArriba}], matrizEntregaCierre: { ejes:{entrega:[…5], cierre:[…5]}, celdas: [[{entrega,cierre,utilidadMes,actual}] …5] …5 } }`.

**Reglas de reshape** (del spec §«Reglas de derivación»):
- `sensibilidad.variables`: por cada clave de `resultado.escenarios.sensibilidad`:
  - `puntos`: los 11 pasos → `{ xPct: i*10, yPct, delta: pct(paso.delta, 0) con signo, valor: pesos(paso.utilidadFinal) }` (i de 0..10). Dominio Y = `[min, max]` de `utilidadFinal` de los 11 con margen 8 %; `yPct = 100 - normaliza(v)` (invertido, SVG y crece hacia abajo). Si `min === max` → todos `yPct = 50`.
  - `ejeY`: `{ ceroPct: 100 - normaliza(0), max: pesosCompacto(max), min: pesosCompacto(min) }`.
  - `cruceXPct`: primer `i` (1..10) donde `sign(puntos[i-1].valorRaw) !== sign(puntos[i].valorRaw)` con ambos no nulos y no cero → interpolar linealmente el `x` del cruce entre `(i-1)*10` y `i*10`. Si ninguno → `null`.
  - `LABELS` de variables: `costoConversacion→'Costo por conversación'`, `tasaEntrega→'Tasa de entrega'`, `costoPedidoFallido→'Costo de devolución'`, `precio→'Precio'`, `tasaCierre→'Tasa de cierre'`.
- `tornado`: `maxMag = max(|impactoAbajo|, |impactoArriba|)` sobre todas las filas. Por fila: `{ clave: f.variable, label: LABELS[f.variable], abajoPct: |f.impactoAbajo|/maxMag*100, arribaPct: |f.impactoArriba|/maxMag*100, abajo: (f.impactoAbajo<0?'−':'+') + pesos(|f.impactoAbajo|).slice(1)... }` — más simple: `abajo: pesosConSigno(f.impactoAbajo)`, `arriba: pesosConSigno(f.impactoArriba)`, `dirAbajo: f.impactoAbajo < 0 ? 'neg':'pos'`, `dirArriba: f.impactoArriba < 0 ? 'neg':'pos'`. Mantené el orden que ya trae el motor (viene ordenado por magnitud desc).
- `matriz`: de `resultado.escenarios.matrizEntregaCierre`:
  - `ejeEntrega = ejes.entrega.map((x) => pct(x))`, `ejeCierre = ejes.cierre.map((x) => pct(x))`.
  - `todos = celdas.flat().map((c) => c.utilidadMes)`; `min/max` para la escala divergente de 5 pasos centrada en 0: `mx-n2 mx-n1 mx-0 mx-p1 mx-p2` (n2 = más negativo, p2 = más positivo; 0 si `|v|` < 5 % del `max(|min|,|max|)`).
  - `celdas[i][j] = { valor: pesosCompacto(c.utilidadMes), clase, actual: c.actual }`. `actual` (índices) = `{ fila, col }` de la celda con `c.actual === true`.

- [ ] **Step 1: Write the failing test**

`test/adapter-escenarios.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPOS, analizarDesdeFormulario, escenariosDesdeFormulario } from '../ui/adapter.js';

function formDefecto(over = {}) {
  const f = { modo: 'sugerir' };
  for (const c of CAMPOS) f[c.id] = String(c.defecto ?? '');
  return { ...f, ...over };
}
const FORM = formDefecto({ costoUnitario: '37500', fleteIda: '20000', fleteDevolucion: '8000',
  tasaEntrega: '75', tasaCierre: '20', costoConversacion: '4000', presupuestoDia: '20000', utilidadObjetivo: '40000' });

test('analizarDesdeFormulario: vista completa, escenarios null', () => {
  const { vista, entradaNormalizada, avisos } = analizarDesdeFormulario(FORM);
  assert.equal(vista.combos.length, 3);
  assert.equal(vista.escenarios, null);
  assert.ok(entradaNormalizada && Array.isArray(avisos));
});

test('escenariosDesdeFormulario: forma de la vista de escenarios', () => {
  const e = escenariosDesdeFormulario(FORM);
  assert.equal(e.sensibilidad.variables.length, 5);
  for (const v of e.sensibilidad.variables) {
    assert.equal(v.puntos.length, 11);
    assert.equal(v.puntos[0].xPct, 0);
    assert.equal(v.puntos[10].xPct, 100);
    assert.ok(v.puntos.every((p) => p.yPct >= 0 && p.yPct <= 100));
    assert.ok('cruceXPct' in v);
  }
  assert.equal(e.tornado.length, 5);
  const mag = (f) => Math.max(f.abajoPct, f.arribaPct);
  for (let i = 1; i < e.tornado.length; i++) assert.ok(mag(e.tornado[i - 1]) >= mag(e.tornado[i]) - 0.001);
  assert.ok(e.tornado[0].abajoPct <= 100 && e.tornado[0].arribaPct <= 100);
  assert.equal(e.matriz.celdas.length, 5);
  assert.equal(e.matriz.celdas[0].length, 5);
  const actuales = e.matriz.celdas.flat().filter((c) => c.actual).length;
  assert.equal(actuales, 1);
  assert.ok(e.matriz.actual.fila >= 0 && e.matriz.actual.col >= 0);
});

test('escenarios: signo del tornado — subir un costo baja la utilidad', () => {
  const e = escenariosDesdeFormulario(FORM);
  const cc = e.tornado.find((f) => f.clave === 'costoConversacion');
  assert.equal(cc.dirArriba, 'neg'); // +10% de costoConversacion → utilidad baja
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/adapter-escenarios.test.js`
Expected: FAIL — funciones no exportadas.

- [ ] **Step 3: Implement en `ui/adapter.js`**

```js
// --- Escenarios: resultado.escenarios → vista.escenarios ---

const LABELS_VAR = {
  costoConversacion: 'Costo por conversación',
  tasaEntrega: 'Tasa de entrega',
  costoPedidoFallido: 'Costo de devolución',
  precio: 'Precio',
  tasaCierre: 'Tasa de cierre',
};
const signo = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);
const pesosConSigno = (n) => (n < 0 ? '−' : '+') + pesos(Math.abs(n));

function vistaSensibilidad(sens) {
  const variables = Object.entries(sens).map(([clave, pasos]) => {
    const vals = pasos.map((p) => p.utilidadFinal);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (!(max > min)) { max = min + 1; }
    const margen = (max - min) * 0.08;
    min -= margen; max += margen;
    const norm = (v) => ((v - min) / (max - min)) * 100;
    const puntos = pasos.map((p, i) => ({
      xPct: i * 10,
      yPct: clamp(100 - norm(p.utilidadFinal), 0, 100),
      valor: pesos(p.utilidadFinal),
      valorRaw: p.utilidadFinal,
      delta: (p.delta > 0 ? '+' : '') + pct(p.delta, 0),
    }));
    let cruceXPct = null;
    for (let i = 1; i < puntos.length; i++) {
      const a = puntos[i - 1].valorRaw, b = puntos[i].valorRaw;
      if (a == null || b == null || a === 0) continue;
      if (signo(a) !== signo(b)) {
        const t = a / (a - b); // 0..1 entre i-1 e i
        cruceXPct = clamp((i - 1) * 10 + t * 10, 0, 100);
        break;
      }
    }
    return {
      clave, label: LABELS_VAR[clave] || clave,
      puntos: puntos.map(({ valorRaw, ...p }) => p),
      cruceXPct,
      ejeY: { ceroPct: clamp(100 - norm(0), 0, 100), max: pesosCompacto(max), min: pesosCompacto(min) },
    };
  });
  return { variables };
}

function vistaTornado(filas) {
  const maxMag = Math.max(1, ...filas.map((f) => Math.max(Math.abs(f.impactoAbajo ?? 0), Math.abs(f.impactoArriba ?? 0))));
  return filas.map((f) => ({
    clave: f.variable,
    label: LABELS_VAR[f.variable] || f.variable,
    abajoPct: clamp((Math.abs(f.impactoAbajo ?? 0) / maxMag) * 100, 0, 100),
    arribaPct: clamp((Math.abs(f.impactoArriba ?? 0) / maxMag) * 100, 0, 100),
    abajo: f.impactoAbajo == null ? '—' : pesosConSigno(f.impactoAbajo),
    arriba: f.impactoArriba == null ? '—' : pesosConSigno(f.impactoArriba),
    dirAbajo: (f.impactoAbajo ?? 0) < 0 ? 'neg' : 'pos',
    dirArriba: (f.impactoArriba ?? 0) < 0 ? 'neg' : 'pos',
  }));
}

function vistaMatriz(mx) {
  const todos = mx.celdas.flat().map((c) => c.utilidadMes ?? 0);
  const esc = Math.max(1, ...todos.map((v) => Math.abs(v)));
  const clase = (v) => {
    const r = v / esc;
    if (r <= -0.5) return 'mx-n2';
    if (r < -0.05) return 'mx-n1';
    if (r <= 0.05) return 'mx-0';
    if (r < 0.5) return 'mx-p1';
    return 'mx-p2';
  };
  let actual = { fila: 0, col: 0 };
  const celdas = mx.celdas.map((fila, i) => fila.map((c, j) => {
    if (c.actual) actual = { fila: i, col: j };
    return { valor: pesosCompacto(c.utilidadMes), clase: clase(c.utilidadMes ?? 0), actual: !!c.actual };
  }));
  return {
    ejeEntrega: mx.ejes.entrega.map((x) => pct(x)),
    ejeCierre: mx.ejes.cierre.map((x) => pct(x)),
    celdas, actual,
  };
}

function vistaEscenarios(esc) {
  if (!esc) return null;
  return {
    sensibilidad: vistaSensibilidad(esc.sensibilidad),
    tornado: vistaTornado(esc.tornado),
    matriz: vistaMatriz(esc.matrizEntregaCierre),
  };
}

// --- Funciones públicas ---

export function analizarDesdeFormulario(form) {
  const entrada = formToEntrada(form);
  const resultado = analizar(entrada, { conEscenarios: false });
  return {
    vista: resultadoToVista(resultado, entrada.objetivo.modo),
    entradaNormalizada: resultado.entradaNormalizada,
    avisos: resultado.avisos,
  };
}

export function escenariosDesdeFormulario(form) {
  const entrada = formToEntrada(form);
  const resultado = analizar(entrada, { conEscenarios: true });
  return vistaEscenarios(resultado.escenarios);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/adapter-escenarios.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ui/adapter.js test/adapter-escenarios.test.js
git commit -m "$(cat <<'EOF'
feat(ui): adapter — escenarios (sensibilidad/tornado/matriz) + funciones públicas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Shell — `index.html`, `ui/estilos.css`, `scripts/servir.mjs`, `ui/app.js` (stub)

**Files:**
- Create: `index.html`
- Create: `ui/estilos.css`
- Create: `scripts/servir.mjs`
- Create: `ui/app.js` (stub que se completará en Tasks 6–9)
- Modify: `package.json` (script `dev`)

**Interfaces:**
- Produces: la página abrible. `index.html` con `<link>` a Geist + `ui/estilos.css`, y `<script type="module" src="ui/app.js">`. Estructura DOM con IDs estables que Tasks 6–9 rellenan: `#rail` (panel izq.), `#resultados` (panel der.) con `#bloque-veredicto #bloque-combos #bloque-desglose #bloque-equilibrio #bloque-proyeccion #bloque-escenarios`.
- `scripts/servir.mjs`: server estático Node (cero deps) que sirve la raíz del repo en `http://localhost:5173` (o el que diga `PORT`). Content-Type correcto para `.html/.css/.js/.mjs/.json/.svg`.
- `npm run dev` → `node scripts/servir.mjs`.

- [ ] **Step 1: Write `scripts/servir.mjs`**

```js
// Server estático mínimo para previsualizar la UI. Cero dependencias.
//   npm run dev   →   http://localhost:5173
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const RAIZ = process.cwd();
const PUERTO = Number(process.env.PORT) || 5173;
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.map': 'application/json',
};

createServer(async (req, res) => {
  try {
    let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (ruta === '/' || ruta.endsWith('/')) ruta += 'index.html';
    const abs = normalize(join(RAIZ, ruta));
    if (!abs.startsWith(RAIZ)) { res.writeHead(403).end('403'); return; }
    const cuerpo = await readFile(abs);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(abs)] || 'application/octet-stream' });
    res.end(cuerpo);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404');
  }
}).listen(PUERTO, () => console.log(`UI en  http://localhost:${PUERTO}`));
```

- [ ] **Step 2: Add the `dev` script to `package.json`**

Change the `scripts` block to:
```json
  "scripts": {
    "test": "node --test --test-concurrency=1",
    "snapshot": "node scripts/generar-snapshot.mjs",
    "dev": "node scripts/servir.mjs"
  }
```

- [ ] **Step 3: Write `index.html`**

```html
<!doctype html>
<html lang="es-CO">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Calculadora de rentabilidad · contraentrega</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap">
  <link rel="stylesheet" href="ui/estilos.css">
</head>
<body>
  <div class="app">
    <aside id="rail" class="rail">
      <header class="rail-head">
        <h1>Calculadora de rentabilidad</h1>
        <p class="rail-sub">contraentrega · Colombia</p>
      </header>
      <div id="rail-form"><!-- formulario.js --></div>
      <p class="rail-nota">Los valores por defecto salen del motor. Un valor fuera de rango se ajusta y aparece un aviso.</p>
    </aside>

    <main id="resultados" class="resultados">
      <section id="bloque-veredicto" class="bloque"></section>
      <section id="bloque-combos" class="bloque"></section>
      <section id="bloque-desglose" class="bloque"></section>
      <section id="bloque-equilibrio" class="bloque"></section>
      <section id="bloque-proyeccion" class="bloque"></section>
      <section id="bloque-escenarios" class="bloque"></section>
    </main>
  </div>
  <script type="module" src="ui/app.js"></script>
</body>
</html>
```

- [ ] **Step 4: Write `ui/estilos.css`**

Escribí el archivo completo con: (a) el sistema de tokens del spec §«Dirección visual» bajo
`:root`; (b) `*{box-sizing:border-box}` y reset mínimo; (c) el layout `.app` (grid de 2 columnas,
rail `340px` + `min(780px,100%)` centrado, gap 36px); (d) `.rail` sticky con scroll propio;
(e) clases de componente que los renderers van a usar — enumeradas acá para que existan desde el
principio:

```css
:root{
  --fondo:#FBFCFE; --superficie:#FFFFFF; --borde:#E7EAEF; --tinta:#1A1D21; --tinta-suave:#5B6470;
  --acento:#3B5BDB; --acento-suave:#EDF0FD;
  --ok:#0E9F6E; --ok-bg:#E7F6F0; --warn:#D97706; --warn-bg:#FDF3E7; --mal:#DC2626; --mal-bg:#FCECEC;
  --r-card:14px; --r-input:10px; --sombra-veredicto:0 1px 3px rgba(20,23,33,.08), 0 8px 24px rgba(20,23,33,.06);
  --sans:'Geist', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  --mono:'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --part-1:#C7CDDA; --part-2:#A9B2C6; --part-3:#8B96B2; --part-4:#6D7B9E; --part-5:#4F5F8A; --part-6:var(--acento);
}
*{box-sizing:border-box}
body{margin:0;background:var(--fondo);color:var(--tinta);font-family:var(--sans);font-size:15px;line-height:1.55}
h1{font-size:18px;font-weight:600;margin:0}
.num,.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
.app{display:grid;grid-template-columns:340px minmax(0,1fr);gap:36px;max-width:1200px;margin:0 auto;padding:28px}
.rail{position:sticky;top:0;align-self:start;max-height:100vh;overflow-y:auto;padding-right:6px}
.rail-head{margin-bottom:18px}
.rail-sub,.rail-nota{color:var(--tinta-suave);font-size:12px}
.rail-nota{margin-top:16px}
.resultados{min-width:0;display:flex;flex-direction:column;gap:26px;max-width:780px}
.bloque:empty{display:none}
.bloque > h2{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--tinta-suave);font-weight:600;margin:0 0 12px}
.card{background:var(--superficie);border:1px solid var(--borde);border-radius:var(--r-card);padding:18px}

/* formulario */
.campo{margin-bottom:12px}
.campo label{display:block;font-size:12px;color:var(--tinta-suave);margin-bottom:5px}
.campo .caja{position:relative}
.campo input,.campo select{width:100%;height:40px;border:1px solid var(--borde);border-radius:var(--r-input);
  padding:0 12px;font:inherit;background:var(--superficie);color:var(--tinta)}
.campo.moneda input{padding-left:26px}
.campo.moneda .caja::before{content:'$';position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--tinta-suave)}
.campo.porcentaje .caja::after{content:'%';position:absolute;right:12px;top:50%;transform:translateY(-50%);color:var(--tinta-suave)}
input:focus,select:focus,button:focus-visible{outline:2px solid var(--acento);outline-offset:1px;border-color:transparent}
.grupo-seccion{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--tinta-suave);font-weight:600;margin:18px 0 8px}
.toggle{display:inline-flex;background:var(--acento-suave);border-radius:999px;padding:3px;margin-bottom:16px}
.toggle button{border:0;background:none;padding:7px 16px;border-radius:999px;font:inherit;color:var(--tinta-suave);cursor:pointer}
.toggle button[aria-pressed=true]{background:var(--acento);color:#fff;font-weight:600}
details.avanzado{margin-top:14px;border-top:1px solid var(--borde);padding-top:10px}
details.avanzado summary{cursor:pointer;font-weight:600;font-size:13px;list-style:none}
details.avanzado summary::-webkit-details-marker{display:none}
details.avanzado summary::before{content:'▸ ';color:var(--tinta-suave)}
details.avanzado[open] summary::before{content:'▾ '}

/* veredicto */
.veredicto{border-radius:var(--r-card);padding:22px;box-shadow:var(--sombra-veredicto);border:1px solid var(--borde)}
.veredicto.ver-gana{background:var(--ok-bg);border-color:color-mix(in srgb,var(--ok) 30%,transparent)}
.veredicto.ver-pierde{background:var(--mal-bg);border-color:color-mix(in srgb,var(--mal) 30%,transparent)}
.veredicto.ver-neutro{background:var(--superficie)}
.veredicto .grande{font-family:var(--mono);font-weight:600;font-size:clamp(30px,5vw,40px);line-height:1;margin:8px 0}
.veredicto.ver-gana .grande{color:var(--ok)} .veredicto.ver-pierde .grande{color:var(--mal)}
.veredicto ul{margin:10px 0 0;padding-left:18px;color:var(--tinta)}
.veredicto .avisos-linea{margin-top:12px;font-size:13px;color:var(--tinta-suave)}

/* combos */
.combos{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.combo{background:var(--superficie);border:1px solid var(--borde);border-radius:12px;padding:16px;position:relative}
.combo.mejor{border-color:var(--acento)}
.combo .badge{position:absolute;top:-9px;right:12px;background:var(--acento);color:#fff;font-size:10px;
  letter-spacing:.06em;text-transform:uppercase;padding:2px 8px;border-radius:999px}
.combo .precio{font-family:var(--mono);font-size:22px;font-weight:600}
.combo .precio-input{width:100%;height:36px;font-family:var(--mono);font-size:18px}
.combo .sug{font-size:12px;color:var(--tinta-suave)}
.combo dl{display:grid;grid-template-columns:auto 1fr;gap:3px 8px;margin:12px 0 0;font-size:13px}
.combo dt{color:var(--tinta-suave)} .combo dd{margin:0;font-family:var(--mono);text-align:right}
.gauge{height:8px;border-radius:6px;background:var(--borde);overflow:hidden;margin:10px 0 4px}
.gauge > span{display:block;height:100%;border-radius:6px;transition:width 120ms ease}
.sem-premium>span,.sem-sano>span{background:var(--ok)} .sem-apretado>span{background:var(--warn)}
.sem-muy-apretado>span,.sem-pierde>span{background:var(--mal)} .sem-sin-dato>span{background:var(--borde)}

/* desglose */
.barra{display:flex;height:14px;border-radius:6px;overflow:hidden;border:1px solid var(--borde);margin:10px 0}
.barra > span{transition:width 120ms ease}
.barra .part-1{background:var(--part-1)} .barra .part-2{background:var(--part-2)} .barra .part-3{background:var(--part-3)}
.barra .part-4{background:var(--part-4)} .barra .part-5{background:var(--part-5)} .barra .part-6{background:var(--part-6)}
.leyenda{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:4px 14px;font-size:13px}
.leyenda .dot{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px}

/* equilibrio */
.eq-fila{display:grid;grid-template-columns:1fr auto auto;gap:6px 12px;align-items:center;padding:9px 0;border-top:1px solid var(--borde)}
.eq-fila:first-child{border-top:0}
.eq-fila .lim{font-family:var(--mono);font-weight:600}
.eq-fila .act{font-family:var(--mono);color:var(--tinta-suave);font-size:13px}
.eq-fila.eq-malo .lim{color:var(--mal)} .eq-fila.eq-ajustado .lim{color:var(--warn)} .eq-fila.eq-ok .lim{color:var(--ok)}
.eq-fila.no-alcanzable{opacity:.55}
.eq-holgura{grid-column:1/-1;height:5px;border-radius:999px;background:var(--borde);overflow:hidden}
.eq-holgura>span{display:block;height:100%;background:var(--acento);transition:width 120ms ease}

/* proyección */
.proy{display:grid;grid-template-columns:1fr 1fr;gap:10px 20px}
.proy .k{font-size:12px;color:var(--tinta-suave)} .proy .v{font-family:var(--mono);font-size:20px;font-weight:600}
.proy .nota{grid-column:1/-1;font-size:12px;color:var(--tinta-suave)}

/* escenarios */
.tabs{display:inline-flex;gap:4px;margin-bottom:12px}
.tabs button{border:1px solid var(--borde);background:var(--superficie);border-radius:8px;padding:6px 12px;font:inherit;cursor:pointer}
.tabs button[aria-selected=true]{border-color:var(--acento);color:var(--acento);font-weight:600}
.sens-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px}
.sens-cel h4{font-size:12px;margin:0 0 4px}
.sens-cel svg,.tornado svg,.matriz svg{width:100%;height:auto;display:block}
.matriz .cel{stroke:var(--superficie);stroke-width:1}
.mx-n2{fill:#C0392B}.mx-n1{fill:#E8A29A}.mx-0{fill:#EDEFF3}.mx-p1{fill:#9AD9C0}.mx-p2{fill:#0E9F6E}
.matriz .actual{stroke:var(--tinta);stroke-width:2}

@media (max-width:900px){
  .app{grid-template-columns:1fr}
  .rail{position:static;max-height:none}
  .combos{grid-template-columns:1fr}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
```

Si el `<link>` de Geist devuelve 404 al abrir la página (Network tab), cambiá la URL a
`family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600` y `--sans`/`--mono` a
`'Inter'` / `'JetBrains Mono'`. Nada más cambia.

- [ ] **Step 5: Write `ui/app.js` (stub)**

```js
// Orquestador de la UI. Se completa en Tasks 6–9.
import { analizarDesdeFormulario } from './adapter.js';

console.info('UI cargada. adapter OK:', typeof analizarDesdeFormulario === 'function');
document.getElementById('bloque-veredicto').innerHTML =
  '<h2>Veredicto</h2><div class="card">Cargá los datos en el panel izquierdo…</div>';
```

- [ ] **Step 6: Verify in the browser**

Run: `npm run dev`
Then open `http://localhost:5173` and confirm:
- La página carga sin errores en la consola (F12).
- Se ve el rail izquierdo (título + nota) y a la derecha el placeholder "Cargá los datos…".
- Fuente: el texto NO está en Times/serif por defecto → Geist (o el fallback) cargó. Si en
  Network hay un 404 de `fonts.googleapis.com`, aplicá el fallback del Step 4.
- El fondo es el `--fondo` casi-blanco, no blanco puro ni gris fuerte.

- [ ] **Step 7: Commit**

```bash
git add index.html ui/estilos.css scripts/servir.mjs ui/app.js package.json
git commit -m "$(cat <<'EOF'
feat(ui): shell — index.html, tokens + estilos.css, server estático (npm run dev)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `ui/formulario.js` — panel izquierdo

**Files:**
- Create: `ui/formulario.js`
- Modify: `ui/app.js` (importar y montar el formulario)

**Interfaces:**
- Consumes: `CAMPOS` de `./adapter.js`.
- Produces `ui/formulario.js`:
  - `montarFormulario(contenedor, { alCambiar }) → { leerForm, setModo, form }` —
    construye el toggle Sugerir/Evaluar + los campos de `CAMPOS` agrupados por `seccion`, con
    los de `grupo:'avanzado'` dentro de un `<details class="avanzado">`. Cada `input`/`change`
    llama `alCambiar()`. Devuelve `leerForm()` (→ objeto `form` con `modo` + todos los `id`s como
    strings) y `setModo(m)` (cambia el toggle y muestra/oculta los campos con `modo` distinto).
  - Los campos con `modo:'sugerir'` se ocultan en modo evaluar y viceversa (`hidden`).
- NO importa de `../src/`. Sí usa `document`.

- [ ] **Step 1: Write `ui/formulario.js`**

```js
/** Construye el panel izquierdo desde CAMPOS. Sin lógica de pricing. */
import { CAMPOS } from './adapter.js';

const SECCIONES = [
  ['producto', 'Producto'],
  ['contraentrega', 'Contraentrega'],
  ['publicidad', 'Publicidad'],
];

function campoInput(c) {
  const wrap = document.createElement('div');
  wrap.className = `campo ${c.tipo}`;
  wrap.dataset.campo = c.id;
  wrap.dataset.modo = c.modo;
  const label = document.createElement('label');
  label.textContent = c.label;
  label.htmlFor = `f-${c.id}`;
  if (c.ayuda) label.title = c.ayuda;
  const caja = document.createElement('div');
  caja.className = 'caja';
  let control;
  if (c.tipo === 'opciones') {
    control = document.createElement('select');
    for (const op of c.opciones) {
      const o = document.createElement('option');
      o.value = o.textContent = op;
      control.append(o);
    }
    control.value = c.defecto;
  } else {
    control = document.createElement('input');
    control.type = 'text';
    control.inputMode = 'decimal';
    control.value = c.defecto === '' || c.defecto == null ? '' : String(c.defecto);
    control.placeholder = c.defecto === '' ? 'opcional' : '';
  }
  control.id = `f-${c.id}`;
  control.name = c.id;
  caja.append(control);
  wrap.append(label, caja);
  return wrap;
}

export function montarFormulario(contenedor, { alCambiar }) {
  contenedor.innerHTML = '';
  let modo = 'sugerir';

  // toggle
  const toggle = document.createElement('div');
  toggle.className = 'toggle';
  const bSug = document.createElement('button');
  const bEva = document.createElement('button');
  bSug.type = bEva.type = 'button';
  bSug.textContent = 'Sugerir';
  bEva.textContent = 'Evaluar';
  toggle.append(bSug, bEva);
  contenedor.append(toggle);

  // secciones básicas
  for (const [sec, titulo] of SECCIONES) {
    const h = document.createElement('div');
    h.className = 'grupo-seccion';
    h.textContent = titulo;
    contenedor.append(h);
    for (const c of CAMPOS.filter((x) => x.seccion === sec)) contenedor.append(campoInput(c));
  }

  // avanzado
  const det = document.createElement('details');
  det.className = 'avanzado';
  const sum = document.createElement('summary');
  sum.textContent = 'Avanzado';
  det.append(sum);
  for (const c of CAMPOS.filter((x) => x.seccion === 'avanzado')) det.append(campoInput(c));
  contenedor.append(det);

  function aplicarModo() {
    bSug.setAttribute('aria-pressed', String(modo === 'sugerir'));
    bEva.setAttribute('aria-pressed', String(modo === 'evaluar'));
    for (const w of contenedor.querySelectorAll('.campo')) {
      const m = w.dataset.modo;
      w.hidden = m !== 'ambos' && m !== modo;
    }
  }
  function setModo(m) {
    modo = m === 'evaluar' ? 'evaluar' : 'sugerir';
    aplicarModo();
    alCambiar();
  }
  bSug.addEventListener('click', () => setModo('sugerir'));
  bEva.addEventListener('click', () => setModo('evaluar'));
  contenedor.addEventListener('input', alCambiar);
  contenedor.addEventListener('change', alCambiar);

  function leerForm() {
    const form = { modo };
    for (const c of CAMPOS) {
      const el = contenedor.querySelector(`#f-${c.id}`);
      form[c.id] = el ? el.value : String(c.defecto ?? '');
    }
    return form;
  }

  aplicarModo();
  return { leerForm, setModo, get form() { return leerForm(); } };
}
```

- [ ] **Step 2: Wire it in `ui/app.js`**

Replace `ui/app.js` with:
```js
import { montarFormulario } from './formulario.js';
import { analizarDesdeFormulario } from './adapter.js';

const railForm = document.getElementById('rail-form');

let formulario;
function recalcular() {
  const { vista } = analizarDesdeFormulario(formulario.leerForm());
  // Task 7 pinta la vista. Por ahora, prueba de humo:
  document.getElementById('bloque-veredicto').innerHTML =
    `<h2>Veredicto</h2><div class="card">${vista.veredicto.titulo} — ${vista.veredicto.lineas[0]}</div>`;
}

formulario = montarFormulario(railForm, { alCambiar: recalcular });
recalcular();
```

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev` (si no está corriendo), recargá `http://localhost:5173`. Confirmá:
- El rail muestra el toggle **Sugerir | Evaluar**, las 3 secciones (Producto / Contraentrega /
  Publicidad) con sus campos, y un `▸ Avanzado` plegado.
- Prefijo `$` en los campos de moneda, sufijo `%` en los de porcentaje.
- En modo **Sugerir**: se ve "Utilidad que querés ganar", NO se ven "Precio 1/2/3 unidad".
- Clic en **Evaluar**: aparecen "Precio 1 unidad" + "Precio 2/3 unidades (combo)", desaparece
  "Utilidad que querés ganar" y "Cesión de utilidad por unidad extra".
- Abrir `▸ Avanzado`: se ven comisión %/fijo, empaque, fijos/mes, días, mezcla 1/2/3, redondeo.
- Editar cualquier campo → el bloque Veredicto de arriba cambia su texto (prueba de humo del
  recálculo).
- Consola sin errores.

- [ ] **Step 4: Commit**

```bash
git add ui/formulario.js ui/app.js
git commit -m "$(cat <<'EOF'
feat(ui): formulario.js — panel izquierdo (toggle, secciones, avanzado) + recálculo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `ui/render.js` — bloques 1–5

**Files:**
- Create: `ui/render.js`
- Modify: `ui/app.js` (usar `render.pintar` + debounce)

**Interfaces:**
- Consumes: `vista` (de `analizarDesdeFormulario`). NO importa de `../src/` ni de `./adapter.js`.
- Produces `ui/render.js`:
  - `pintar(vista) → void` — rellena `#bloque-veredicto`, `#bloque-combos`, `#bloque-desglose`,
    `#bloque-equilibrio`, `#bloque-proyeccion` a partir de `vista`. Idempotente (se puede llamar
    en cada cambio). No toca `#bloque-escenarios` (Task 8).
  - `alEditarPrecioCombo(cb)` — registra un callback `(n, valorString) => void` que `pintar`
    invoca cuando el usuario edita el `<input>` de precio de una tarjeta (solo en modo evaluar).
- El renderer construye HTML con `textContent`/`createElement` o plantillas string + `innerHTML`
  por bloque (aceptable: los datos ya vienen formateados y escapados como números/strings
  controlados por el adapter). NO calcula nada: anchos salen de `anchoPct`, clases de `clase`.

- [ ] **Step 1: Write `ui/render.js`**

```js
/** vista → DOM de los bloques 1–5. Sin aritmética: todo llega listo en la vista. */

const $ = (id) => document.getElementById(id);
let cbEditarPrecio = null;
export function alEditarPrecioCombo(cb) { cbEditarPrecio = cb; }

function pintarVeredicto(v) {
  const b = $('bloque-veredicto');
  const r = v.veredicto;
  b.innerHTML = `
    <h2>Veredicto</h2>
    <div class="veredicto ${r.clase}">
      <div class="k">¿Es rentable?</div>
      <div class="grande">${r.titulo}</div>
      <ul>${r.lineas.map((l) => `<li>${l}</li>`).join('')}</ul>
      <div class="avisos-linea">
        ⚠ ${v.resumenAvisos.avisos} aviso(s) · 🔴 ${v.resumenAvisos.errores} error(es)
        ${v.avisos.length ? '<button type="button" class="ver-avisos" aria-expanded="false">ver ▾</button>' : ''}
      </div>
      <ul class="lista-avisos" hidden>${v.avisos.map((a) => `<li class="${a.clase}">${a.mensaje}</li>`).join('')}</ul>
    </div>`;
  const btn = b.querySelector('.ver-avisos');
  if (btn) btn.addEventListener('click', () => {
    const ul = b.querySelector('.lista-avisos');
    const abierto = !ul.hidden;
    ul.hidden = abierto;
    btn.setAttribute('aria-expanded', String(!abierto));
    btn.textContent = abierto ? 'ver ▾' : 'ocultar ▴';
  });
}

function pintarCombos(v) {
  const b = $('bloque-combos');
  b.innerHTML = `<h2>Combos</h2><div class="combos">${v.combos.map((c) => `
    <article class="combo ${c.esMejor ? 'mejor' : ''}">
      ${c.esMejor ? '<span class="badge">★ mejor</span>' : ''}
      ${c.editable
        ? `<input class="precio-input num" data-n="${c.n}" value="${c.precioRaw}" inputmode="decimal" aria-label="Precio ${c.titulo}">`
        : `<div class="precio">${c.precio}</div>`}
      <div class="sug">${c.editable ? `sugerido ${c.precioSugerido}` : (c.esSugerido ? 'sugerido' : 'de la escalera')}</div>
      <dl>
        <dt>gana/venta</dt><dd>${c.gana}</dd>
        <dt>margen</dt><dd>${c.margenNeto}</dd>
        <dt>markup</dt><dd>${c.markup}</dd>
        <dt>CAC</dt><dd>${c.cac}</dd>
        <dt>desc. máx</dt><dd>${c.descuentoMax}</dd>
      </dl>
      <div class="gauge ${c.semaforo.clase}"><span style="width:${c.semaforo.anchoPct}%"></span></div>
      <div class="sug">${c.semaforo.etiqueta}</div>
    </article>`).join('')}</div>`;
  for (const inp of b.querySelectorAll('.precio-input')) {
    inp.addEventListener('input', () => cbEditarPrecio && cbEditarPrecio(Number(inp.dataset.n), inp.value));
  }
}

function pintarDesglose(v) {
  const d = v.desglose;
  $('bloque-desglose').innerHTML = `
    <h2>De dónde sale el precio</h2>
    <div class="card">
      <div class="mono">${d.precio} =</div>
      <div class="barra">${d.partes.map((p) => `<span class="${p.clase}" style="width:${p.anchoPct}%" title="${p.label} ${p.monto}"></span>`).join('')}</div>
      <div class="leyenda">${d.partes.map((p) => `<span><span class="dot ${p.clase}" style="background:var(--${p.clase})"></span>${p.label} <span class="mono">${p.monto}</span></span>`).join('')}</div>
      <p class="rail-sub" style="margin-top:12px">— aparte — CAC <span class="mono">${d.cac}</span>. ${d.notaCac}</p>
    </div>`;
}

function pintarEquilibrio(v) {
  $('bloque-equilibrio').innerHTML = `
    <h2>Tus límites (punto de equilibrio)</h2>
    <div class="card">${v.equilibrio.map((f) => `
      <div class="eq-fila ${f.clase} ${f.alcanzable ? '' : 'no-alcanzable'}">
        <span>${f.label}</span>
        <span class="lim">${f.limite}</span>
        <span class="act">${f.actualLabel} ${f.actual}</span>
        <span class="eq-holgura"><span style="width:${f.holguraPct}%"></span></span>
      </div>`).join('')}</div>`;
}

function pintarProyeccion(v) {
  const p = v.proyeccion;
  $('bloque-proyeccion').innerHTML = `
    <h2>Proyección (con este presupuesto)</h2>
    <div class="card proy">
      <div><div class="k">Pedidos/día</div><div class="v">${p.pedidosDia}</div></div>
      <div><div class="k">Ventas entregadas/día</div><div class="v">${p.ventasEntregadasDia}</div></div>
      <div><div class="k">Utilidad/día</div><div class="v">${p.utilidadDia}</div></div>
      <div><div class="k">Utilidad/mes</div><div class="v">${p.utilidadMes}</div></div>
      <p class="nota">${p.nota}</p>
    </div>`;
}

export function pintar(vista) {
  pintarVeredicto(vista);
  pintarCombos(vista);
  pintarDesglose(vista);
  pintarEquilibrio(vista);
  pintarProyeccion(vista);
}
```

- [ ] **Step 2: Wire it in `ui/app.js`**

Replace `ui/app.js` with:
```js
import { montarFormulario } from './formulario.js';
import { analizarDesdeFormulario } from './adapter.js';
import { pintar, alEditarPrecioCombo } from './render.js';

const railForm = document.getElementById('rail-form');
let formulario;

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function recalcular() {
  const { vista } = analizarDesdeFormulario(formulario.leerForm());
  pintar(vista);
}
const recalcularDebounced = debounce(recalcular, 120);

formulario = montarFormulario(railForm, { alCambiar: recalcularDebounced });

// editar el precio de una tarjeta (modo evaluar) escribe en el input del rail y recalcula
alEditarPrecioCombo((n, valor) => {
  const id = n === 1 ? 'f-precioBase' : `f-precio${n}`;
  const el = document.getElementById(id);
  if (el) { el.value = valor; recalcularDebounced(); }
});

recalcular();
```

- [ ] **Step 3: Verify in the browser**

Recargá `http://localhost:5173`. Con los valores por defecto (poné `costoUnitario` 37500,
`fleteIda` 20000, `costoConversacion` 4000, `presupuestoDia` 20000, `utilidadObjetivo` 40000 si
no están):
- **Bloque 1 Veredicto**: "SÍ, VAS GANANDO" en verde, 3 líneas (ganás $…, mejor combo…, podés
  pagar hasta $…). Contador de avisos; "ver ▾" despliega la lista.
- **Bloque 2 Combos**: 3 tarjetas; la de 3u con "★ mejor"; cada una con precio, gana/venta,
  margen, markup, CAC, gauge de color, etiqueta.
- **Bloque 3 Desglose**: `$105.100 =` + barra apilada de 6 tramos que ocupa el 100 % del ancho +
  leyenda con montos + línea del CAC aparte.
- **Bloque 4 Límites**: 6 filas (precio mínimo, entrega mínima, cierre mínimo, costo/conv máx,
  ROAS mínimo, unidades/día); "unidades/día" atenuada con "—" (no cargaste fijos).
- **Bloque 5 Proyección**: pedidos/día 1,0 · ventas entregadas/día 0,75 · utilidad/día y /mes.
- Editar `entrega efectiva` a 60 → todo recalcula al instante, sin salto de layout.
- Clic en **Evaluar**, poné "Precio 1 unidad" 120000 → las tarjetas muestran input de precio;
  editar el input de la tarjeta 2 actualiza el rail y recalcula.
- Poné `costoConversacion` en 0 → Veredicto pasa a "FALTAN DATOS DE PAUTA", combos muestran "—"
  en gana/CAC, proyección muestra la nota.
- Consola sin errores.

- [ ] **Step 4: Commit**

```bash
git add ui/render.js ui/app.js
git commit -m "$(cat <<'EOF'
feat(ui): render.js — bloques 1–5 (veredicto, combos, desglose, equilibrio, proyección) + debounce

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `ui/graficos.js` — bloque 6 (escenarios), cálculo diferido

**Files:**
- Create: `ui/graficos.js`
- Modify: `ui/app.js` (montar pestañas + `IntersectionObserver` + recálculo perezoso)

**Interfaces:**
- Consumes: `vista.escenarios` (de `escenariosDesdeFormulario`). NO importa de `../src/` ni de
  `./adapter.js`.
- Produces `ui/graficos.js`:
  - `montarEscenarios(contenedor) → { pintar(vistaEscenarios), marcarDesactualizado() }` —
    construye la estructura de `#bloque-escenarios` (h2 + `.tabs` con Sensibilidad/Tornado/Matriz
    + 3 paneles). `pintar` dibuja los 3 SVG a partir de `vistaEscenarios`. `marcarDesactualizado`
    pone un aviso "recalculando…" hasta el próximo `pintar`.
- SVG con `document.createElementNS`. Coordenadas ya vienen en 0–100 → `viewBox="0 0 100 60"`
  (sensibilidad), `viewBox="0 0 100 <n*14>"` (tornado), `viewBox="0 0 100 100"` (matriz 5×5).

- [ ] **Step 1: Write `ui/graficos.js`**

```js
/** Los 3 visuales de escenarios. Recibe coords 0–100; solo dibuja SVG. */
const NS = 'http://www.w3.org/2000/svg';
const el = (n, attrs = {}, txt) => {
  const e = document.createElementNS(NS, n);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (txt != null) e.textContent = txt;
  return e;
};

function svgSensibilidad(v) {
  const s = el('svg', { viewBox: '0 0 100 60', class: 'g-sens' });
  s.append(el('line', { x1: 0, y1: v.ejeY.ceroPct * 0.6, x2: 100, y2: v.ejeY.ceroPct * 0.6, stroke: 'var(--borde)', 'stroke-width': 0.5 }));
  const pts = v.puntos.map((p) => `${p.xPct},${p.yPct * 0.6}`).join(' ');
  s.append(el('polyline', { points: pts, fill: 'none', stroke: 'var(--acento)', 'stroke-width': 1.5 }));
  if (v.cruceXPct != null) {
    s.append(el('circle', { cx: v.cruceXPct, cy: v.ejeY.ceroPct * 0.6, r: 1.8, fill: 'var(--mal)' }));
  }
  return s;
}

function svgTornado(filas) {
  const h = filas.length * 16 + 6;
  const s = el('svg', { viewBox: `0 0 100 ${h}`, class: 'g-tornado' });
  s.append(el('line', { x1: 50, y1: 0, x2: 50, y2: h, stroke: 'var(--borde)', 'stroke-width': 0.5 }));
  filas.forEach((f, i) => {
    const y = i * 16 + 3;
    const cAb = f.dirAbajo === 'neg' ? 'var(--mal)' : 'var(--ok)';
    const cAr = f.dirArriba === 'neg' ? 'var(--mal)' : 'var(--ok)';
    s.append(el('rect', { x: 50 - f.abajoPct / 2, y, width: f.abajoPct / 2, height: 9, fill: cAb }));
    s.append(el('rect', { x: 50, y, width: f.arribaPct / 2, height: 9, fill: cAr }));
    s.append(el('text', { x: 1, y: y + 7, 'font-size': 5, fill: 'var(--tinta-suave)' }, f.label));
  });
  return s;
}

function svgMatriz(m) {
  const s = el('svg', { viewBox: '0 0 100 100', class: 'g-matriz' });
  const paso = 20;
  m.celdas.forEach((fila, i) => fila.forEach((c, j) => {
    s.append(el('rect', {
      x: j * paso, y: i * paso, width: paso, height: paso,
      class: `cel ${c.clase} ${c.actual ? 'actual' : ''}`,
    }));
    s.append(el('text', { x: j * paso + paso / 2, y: i * paso + paso / 2 + 2, 'font-size': 4, 'text-anchor': 'middle', fill: 'var(--tinta)' }, c.valor));
  }));
  return s;
}

export function montarEscenarios(contenedor) {
  contenedor.innerHTML = `
    <h2>Escenarios</h2>
    <div class="card">
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected="true" data-p="sens">Sensibilidad</button>
        <button role="tab" aria-selected="false" data-p="torn">Tornado</button>
        <button role="tab" aria-selected="false" data-p="mat">Matriz</button>
      </div>
      <div class="panel-sens sens-grid"></div>
      <div class="panel-torn tornado" hidden></div>
      <div class="panel-mat matriz" hidden></div>
      <p class="estado-esc rail-sub"></p>
    </div>`;
  const tabs = [...contenedor.querySelectorAll('[role=tab]')];
  const paneles = {
    sens: contenedor.querySelector('.panel-sens'),
    torn: contenedor.querySelector('.panel-torn'),
    mat: contenedor.querySelector('.panel-mat'),
  };
  tabs.forEach((t) => t.addEventListener('click', () => {
    tabs.forEach((x) => x.setAttribute('aria-selected', String(x === t)));
    for (const [k, p] of Object.entries(paneles)) p.hidden = k !== t.dataset.p;
  }));

  function pintar(ve) {
    contenedor.querySelector('.estado-esc').textContent = '';
    paneles.sens.innerHTML = '';
    for (const v of ve.sensibilidad.variables) {
      const cel = document.createElement('div');
      cel.className = 'sens-cel';
      cel.innerHTML = `<h4>${v.label}</h4>`;
      cel.append(svgSensibilidad(v));
      const eje = document.createElement('div');
      eje.className = 'rail-sub';
      eje.textContent = '−50 %      0      +50 %';
      cel.append(eje);
      paneles.sens.append(cel);
    }
    paneles.torn.innerHTML = '';
    paneles.torn.append(svgTornado(ve.tornado));
    paneles.mat.innerHTML = '';
    paneles.mat.append(svgMatriz(ve.matriz));
  }
  function marcarDesactualizado() {
    contenedor.querySelector('.estado-esc').textContent = 'recalculando…';
  }
  return { pintar, marcarDesactualizado };
}
```

- [ ] **Step 2: Wire it in `ui/app.js`**

Replace `ui/app.js` with (adds the escenarios wiring to Task 7's version):
```js
import { montarFormulario } from './formulario.js';
import { analizarDesdeFormulario, escenariosDesdeFormulario } from './adapter.js';
import { pintar, alEditarPrecioCombo } from './render.js';
import { montarEscenarios } from './graficos.js';

const railForm = document.getElementById('rail-form');
const bloqueEsc = document.getElementById('bloque-escenarios');
let formulario;

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

const esc = montarEscenarios(bloqueEsc);
let escVisible = false;
let escSucio = true;

function recalcularPrincipal() {
  const { vista } = analizarDesdeFormulario(formulario.leerForm());
  pintar(vista);
  escSucio = true;
  if (escVisible) recalcularEscenariosDebounced();
}
function recalcularEscenarios() {
  esc.pintar(escenariosDesdeFormulario(formulario.leerForm()));
  escSucio = false;
}
const recalcularPrincipalDebounced = debounce(recalcularPrincipal, 120);
const recalcularEscenariosDebounced = debounce(recalcularEscenarios, 250);

new IntersectionObserver((entradas) => {
  escVisible = entradas[0].isIntersecting;
  if (escVisible && escSucio) recalcularEscenarios();
}, { threshold: 0.15 }).observe(bloqueEsc);

formulario = montarFormulario(railForm, { alCambiar: () => { recalcularPrincipalDebounced(); if (escVisible) esc.marcarDesactualizado(); } });

alEditarPrecioCombo((n, valor) => {
  const id = n === 1 ? 'f-precioBase' : `f-precio${n}`;
  const elx = document.getElementById(id);
  if (elx) { elx.value = valor; recalcularPrincipalDebounced(); }
});

recalcularPrincipal();
```

- [ ] **Step 3: Verify in the browser**

Recargá. Con los valores por defecto:
- Scrolleá hasta **Escenarios** (bloque 6). Al entrar en vista, aparecen los 3 paneles; la
  pestaña **Sensibilidad** activa muestra 5 mini-gráficos (uno por palanca) con una línea y
  eje `−50 % 0 +50 %`.
- Pestaña **Tornado**: 5 barras divergentes horizontales desde el centro, con etiqueta de
  palanca; el lado que baja la utilidad en rojo, el que la sube en verde; ordenadas por
  magnitud.
- Pestaña **Matriz**: cuadrícula 5×5 con colores (rojo→verde), una celda con borde marcado
  (tu celda actual), montos compactos.
- Con Escenarios visible, cambiá `tasaEntrega` → aparece "recalculando…" y a los ~250 ms se
  redibujan.
- Scrolleá arriba (Escenarios fuera de vista), cambiá varios valores, volvé a Escenarios → se
  recalcula una sola vez al reaparecer.
- Consola sin errores.

- [ ] **Step 4: Commit**

```bash
git add ui/graficos.js ui/app.js
git commit -m "$(cat <<'EOF'
feat(ui): graficos.js — escenarios (sensibilidad/tornado/matriz) SVG + cálculo diferido

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Pulido — sincronía de precios, responsive, accesibilidad

**Files:**
- Modify: `ui/render.js`, `ui/formulario.js`, `ui/app.js`, `ui/estilos.css` (ajustes puntuales)

**Interfaces:** sin API nueva. Cierra los detalles del spec §«Interacción» y §«Responsive lite».

- [ ] **Step 1: Sincronizar el input de precio del rail con el de la tarjeta**

En `ui/render.js`, `pintarCombos`: cuando `c.editable`, el `<input class="precio-input">` debe
mostrar el valor **actual del form** (`c.precioRaw`), no re-crear el input en cada `pintar` si el
foco está en él (evita perder el cursor al tipear). Guardá el elemento con foco antes de
`innerHTML` y restauralo:
```js
// al inicio de pintar(vista):
const focoId = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.n;
// ... tras pintarCombos:
if (focoId) { const nuevo = document.querySelector(`.precio-input[data-n="${focoId}"]`); if (nuevo) { nuevo.focus(); nuevo.setSelectionRange(nuevo.value.length, nuevo.value.length); } }
```
Verificá: en modo evaluar, tipear en el input de precio de una tarjeta no pierde el foco entre
recálculos.

- [ ] **Step 2: Responsive lite — el rail como `<details>` bajo 900px**

En `ui/estilos.css` ya está el `@media (max-width:900px)` que hace `position:static`. Agregá: bajo
900px el rail arranca visible pero con un botón "Ocultar entradas ▴" que colapsa `#rail-form`
(clase `.rail--colapsado #rail-form{display:none}`). En `ui/app.js` (o `formulario.js`) agregá el
botón y el toggle de clase solo cuando `matchMedia('(max-width:900px)').matches`.
Verificá: en una ventana angosta (< 900px) los paneles se apilan, el formulario se puede
colapsar, y al ampliar vuelve al layout de 2 columnas con el rail sticky.

- [ ] **Step 3: Accesibilidad y reduced-motion**

- Cada `<input>`/`<select>` ya tiene `<label for>`. Verificá que el toggle Sugerir/Evaluar y las
  pestañas de Escenarios sean operables con teclado (Tab + Enter/Espacio) y tengan foco visible.
- `@media (prefers-reduced-motion: reduce)` ya mata `transition`. Confirmá que no haya ningún
  `requestAnimationFrame`/`setInterval` de animación en el código (no lo hay por diseño).
- El bloque Veredicto: `aria-live="polite"` en el `.grande` para que un lector de pantalla anuncie
  el cambio de "SÍ/NO".

- [ ] **Step 4: Verify the full checklist in the browser**

Run: `npm run dev`, recargá, y recorré:
- [ ] Editar cualquier campo del rail → bloques 1–5 recalculan en ~120 ms sin salto de layout.
- [ ] Toggle Sugerir↔Evaluar cambia los campos y recalcula.
- [ ] Modo evaluar: editar el precio en la tarjeta ↔ editar en el rail están sincronizados; el
      foco no se pierde al tipear.
- [ ] Escenarios: cálculo diferido al primer scroll; "recalculando…" al cambiar entradas con la
      sección visible; una sola recalculada al reaparecer.
- [ ] `costoConversacion = 0` → Veredicto "FALTAN DATOS DE PAUTA", combos "—", proyección con nota.
- [ ] `costoUnitario = 0` → aviso `costo_faltante` (error) visible en "ver ▾".
- [ ] Ventana < 900px → apila; rail colapsable; > 900px → 2 columnas, rail sticky.
- [ ] Navegación con Tab llega a todos los controles con foco visible.
- [ ] Consola limpia.

- [ ] **Step 5: Commit**

```bash
git add ui/render.js ui/formulario.js ui/app.js ui/estilos.css
git commit -m "$(cat <<'EOF'
feat(ui): pulido — sincronía de precio combo↔rail, responsive lite, a11y, reduced-motion

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Guarda de capas + README + suite final

**Files:**
- Create: `test/ui-separada.test.js`
- Modify: `README.md`

**Interfaces:** sin API nueva. Bloquea la separación de capas y documenta la UI.

- [ ] **Step 1: Write `test/ui-separada.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const raiz = new URL('..', import.meta.url).pathname;
const leer = (p) => readFileSync(join(raiz, p), 'utf8');
const jsDe = (dir) => readdirSync(join(raiz, dir)).filter((f) => f.endsWith('.js')).map((f) => `${dir}/${f}`);

test('src/** no menciona ui/, document, window, localStorage', () => {
  for (const f of jsDe('src')) {
    const txt = leer(f);
    for (const prohibido of ['ui/', 'document', 'window', 'localStorage']) {
      assert.ok(!txt.includes(prohibido), `${f} menciona "${prohibido}"`);
    }
  }
});

test('ui/adapter.js y ui/formato.js son puros (sin DOM/red)', () => {
  for (const f of ['ui/adapter.js', 'ui/formato.js']) {
    const txt = leer(f);
    for (const prohibido of ['document', 'window', 'localStorage', 'fetch(']) {
      assert.ok(!txt.includes(prohibido), `${f} menciona "${prohibido}"`);
    }
  }
});

test('ui/render.js y ui/graficos.js NO importan del motor', () => {
  for (const f of ['ui/render.js', 'ui/graficos.js']) {
    const txt = leer(f);
    assert.ok(!/from ['"]\.\.\/src\//.test(txt), `${f} importa de ../src/`);
  }
});

test('ui/app.js solo importa lógica vía ./adapter.js (no ../src/ directo)', () => {
  const txt = leer('ui/app.js');
  assert.ok(!/from ['"]\.\.\/src\//.test(txt), 'ui/app.js importa de ../src/ directo');
});
```

- [ ] **Step 2: Run it**

Run: `node --test test/ui-separada.test.js`
Expected: PASS (4 tests). Si falla porque `ui/adapter.js` "menciona" `window` dentro de un
comentario o string literal legítimo, reescribí ese comentario — la guarda es a propósito
estricta.

- [ ] **Step 3: Update `README.md`**

Agregá una sección después de la tabla de estado:
```markdown
## UI web (Fase 2)

Interfaz de dos paneles sobre el motor. Sin build: `index.html` importa `ui/app.js`, que importa
`ui/adapter.js` (puro, sin DOM — mapea `form`↔`entrada` y `Resultado`↔`vista`), que importa
`src/index.js`. Los renderers (`ui/render.js`, `ui/graficos.js`) solo conocen la `vista`.

Previsualizar local:

    npm run dev        # http://localhost:5173

Despliegue previsto: Cloudflare Pages en `calculadora.jdsmplus.co` (sin build; output dir = raíz).
```
Y actualizá la tabla de estado: Fase 2 pasa a "en curso" → "completa".

- [ ] **Step 4: Full suite**

Run: `npm test`
Expected: PASS — 90 (Fase 1) + 6 (formato) + 8 (form→entrada) + 8 (resultado→vista) + 3
(escenarios) + 4 (ui-separada) = **119**.

- [ ] **Step 5: Commit**

```bash
git add test/ui-separada.test.js README.md
git commit -m "$(cat <<'EOF'
test(ui): guarda de separación de capas + README de la UI

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage**

| Spec | Task |
|---|---|
| 3 capas, dependencia un solo sentido, guardas | Tasks 2–4 (adapter puro), 7–8 (renderers sin `src/`), 10 (guarda) |
| Contrato: `CAMPOS`, `analizarDesdeFormulario`, `escenariosDesdeFormulario` | Tasks 2, 4 |
| `formToEntrada` (parseo moneda/%/toggle/escalera/mezcla) | Task 2 |
| `resultadoToVista` (6 bloques, reglas de derivación) | Tasks 3 (1–5), 4 (escenarios) |
| Forma de `vista` completa | Tasks 3, 4 |
| `formato.js` (pesos/pct/ratio/oGuion) | Task 1 |
| Panel izquierdo (toggle, secciones, avanzado, sticky) | Tasks 5 (shell), 6 (formulario) |
| Panel derecho bloques 1–5 en orden | Task 7 |
| Bloque 6 escenarios (3 visuales SVG, cálculo diferido) | Task 8 |
| Interacción: debounce 120 ms, escenarios `IntersectionObserver` 250 ms, sin layout shift | Tasks 7, 8 |
| Sincronía precio tarjeta↔rail, responsive lite, reduced-motion, a11y | Task 9 |
| Dirección visual: Geist, tokens, paleta, layout | Task 5 (`estilos.css` completo) |
| `index.html` shell + fonts | Task 5 |
| `scripts/servir.mjs` + `npm run dev` | Task 5 |
| Tests puros del adapter + guarda de capas | Tasks 1–4, 10 |
| Despliegue documentado (no ejecutado) | Task 10 (README) |
| No toca `src/` | ninguna task modifica `src/`; guarda en Task 10 |

Sin huecos. Los estados `sin-pauta` / `precio_bajo_costo` / equilibrio inalcanzable están
cubiertos por los tests de Task 3.

**2. Placeholder scan** — sin "TBD"/"TODO"/"handle edge cases". Cada step de código trae el
código. Las tasks de DOM (5–9) usan checklist de verificación en navegador en vez de un test
automatizado porque el spec descartó el runner de navegador; cada checklist es concreta y
verificable.

**3. Type consistency**
- `form` (objeto plano, `id`→string) — producido por `formulario.leerForm()` (Task 6), consumido
  por `formToEntrada` (Task 2) y las funciones públicas (Task 4). Consistente.
- `entrada` — la que arma `formToEntrada`; forma exacta del `entrada` del motor de Fase 1
  (`producto/supuestos/mercado/publicidad/overhead/mezcla/objetivo`). Verificado campo por campo
  contra `docs/diseno-fase1.md`.
- `vista` — producida por `resultadoToVista` (Tasks 3–4), consumida por `render.pintar` (Task 7)
  y `graficos.montarEscenarios().pintar` (Task 8). Las claves usadas en el HTML de Task 7
  (`veredicto.clase`, `combos[].semaforo.anchoPct`, `desglose.partes[].anchoPct`,
  `equilibrio[].holguraPct`, `proyeccion.disponible`…) están todas definidas en Task 3. Las de
  Task 8 (`sensibilidad.variables[].puntos[].xPct/yPct`, `cruceXPct`, `ejeY.ceroPct`,
  `tornado[].abajoPct/dirAbajo`, `matriz.celdas[][].clase/actual`, `matriz.actual.{fila,col}`)
  están definidas en Task 4.
- `montarFormulario(contenedor, { alCambiar }) → { leerForm, setModo, form }` (Task 6) — usado
  por `app.js` en Tasks 6–9 con esa firma.
- `pintar(vista)` / `alEditarPrecioCombo(cb)` (Task 7) — `app.js` los importa así en Tasks 7–9.
- `montarEscenarios(contenedor) → { pintar, marcarDesactualizado }` (Task 8) — `app.js` lo usa
  así en Tasks 8–9.
- `analizar(entrada, { conEscenarios })` — la API del motor, sin cambios; el adapter la llama con
  `false` (principal) y `true` (escenarios).

**Desviación menor del spec:** el spec sugería `render-*.js` posiblemente separados; el plan
mantiene un único `ui/render.js` con una función por bloque (más simple, sigue "una
responsabilidad" = "pintar la vista"). Si `render.js` supera ~250 líneas en la práctica, el
reviewer puede pedir el split.

---

## Execution Handoff

**Plan complete and saved to `docs/plan-fase2.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Las tasks de DOM (5–9) las verifico yo abriendo la página en el navegador entre task y task.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
