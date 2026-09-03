# Fase 2 — UI web (app de dos paneles) · Diseño

## Objetivo

Una interfaz web sobre el motor de Fase 1: el usuario mete un producto y sus supuestos de
operación contra entrega en un panel izquierdo fijo, y en el panel derecho ve — en orden de
respuesta primero — si es rentable, cuánto gana, cuál combo conviene, cuánto puede pagar por
adquisición, dónde está su límite, y recién después el desglose matemático, la proyección y los
escenarios «¿qué pasa si?».

Reemplaza a `~/Downloads/calculadora-precios.html`. Un solo producto por sesión, se llena a mano
cada vez (sin persistencia, sin catálogo, sin CRM — eso es Fase 3).

## Contexto

- Repo `calculadora-rentabilidad`. Fase 1 (`src/`, motor puro, `analizar()`) está en `main`,
  **congelada para esta fase** — la UI no la modifica.
- **Sin build.** `index.html` carga `ui/app.js` como `<script type="module">`, que importa el
  motor de `../src/index.js` directo. Cloudflare Pages sirve estáticos tal cual. Cero
  dependencias, cero bundler.
- Node ≥ 22.5 solo para los tests (`node --test`) y un server estático local. La página en sí
  corre en el navegador.
- Página desplegada (no un artifact), así que Google Fonts completo está disponible.

## Alcance

**Incluye (Fase 2):**

- `index.html` + `ui/` (app, adapter, formulario, render, graficos, formato, estilos).
- Panel izquierdo: formulario con campos básicos + sección «Avanzado» plegable + toggle
  Sugerir/Evaluar, `position: sticky` con scroll propio.
- Panel derecho: los 6 bloques en orden fijo — (1) Veredicto + avisos, (2) 3 tarjetas de combo,
  (3) Desglose de costo (barra apilada que suma el precio), (4) 6 puntos de equilibrio,
  (5) Proyección, (6) Escenarios (sensibilidad, tornado, matriz).
- Recálculo de los bloques 1–5 en cada cambio de entrada (debounce). Bloque 6 diferido: se
  calcula al hacerse visible.
- Los 3 visuales de escenarios como SVG inline (sin librería de gráficos).
- Dirección visual fresca: tipografía Geist Sans/Mono, paleta neutra + acento índigo + colores
  semánticos, tema claro.
- Responsive lite: bajo ~900px los paneles se apilan.
- Tests puros del adapter (`node --test`) + una guarda de separación de capas.
- `scripts/servir.mjs` + `npm run dev` para previsualizar local.

**No incluye (fases siguientes / follow-up):**

- Leer catálogo, CRM, métricas, `orders` (Fase 3).
- Persistencia, multi-producto, `localStorage`, exportar JSON.
- Modo oscuro (los tokens quedan estructurados para añadirlo después).
- El alta en Cloudflare Pages y el dominio `calculadora.jdsmplus.co` (se documenta; lo hace el
  dueño con su cuenta).
- Cualquier cambio a `src/` (el motor está congelado).
- i18n, hoja de impresión, layout mobile-first (es una herramienta de escritorio; usable en
  tablet, el layout de teléfono es una pasada futura más allá del "responsive lite").

## Arquitectura — tres capas, dependencia en un solo sentido

```
index.html
  └─ ui/app.js        DOM, eventos, orquesta el render. NO hace aritmética de pricing.
        │ importa →      Lo único que decide: mapear vista → DOM.
  └─ ui/adapter.js     PURO, SIN DOM (no document/window/localStorage). Único módulo que habla
        │ importa →      los dos vocabularios: (form del panel izq.) ↔ entrada del motor,
        │                y Resultado ↔ `vista` (todo pre-formateado y pre-escalado).
  └─ src/index.js      El motor. IDÉNTICO a Fase 1. Cero imports de ui/. Puro.
```

Reglas duras:

- `src/**` no importa ni menciona `ui`, `document`, `window`. (Guarda en la suite.)
- `ui/adapter.js` no toca el DOM ni `localStorage` ni la red. Testeable con `node --test`.
  (Guarda en la suite.)
- `ui/app.js` / `ui/render.js` / `ui/graficos.js` **no hacen cuentas de pricing**: todo número
  (montos, %, anchos de barra, coordenadas de gráfico) viene ya calculado y escalado en la
  `vista`. Lo único que hace el renderer es `elemento.textContent = valor` y `estilo.width =
  pct + '%'` y `clase ← vista.clase`.
- Esta fase: `ui/` no lee catálogo/CRM/`localStorage`/red. El adapter que lee el catálogo es
  Fase 3, archivo nuevo, no entra acá.

## El contrato — superficie entre `ui/app.js` y `ui/adapter.js`

`ui/adapter.js` exporta exactamente esto:

```js
import { analizar, DEFAULTS } from '../src/index.js';

// Metadata de cada campo del panel izquierdo. app.js/formulario.js construye el formulario a
// partir de esto — no hay <input> escritos a mano en el HTML.
export const CAMPOS = [
  { id, grupo: 'basico' | 'avanzado', modo: 'ambos' | 'sugerir' | 'evaluar',
    seccion: 'producto' | 'contraentrega' | 'publicidad' | 'avanzado',
    tipo: 'moneda' | 'porcentaje' | 'entero' | 'opciones',
    label, ayuda, defecto,           // defecto sale de DEFAULTS
    opciones? },                     // solo tipo 'opciones' (dirección de redondeo)
  ...
];

// Camino principal. app.js lo llama en cada cambio (con debounce).
export function analizarDesdeFormulario(form) {
  return {
    vista,                // ver «Forma de vista» — lo único que pinta app.js
    entradaNormalizada,   // passthrough del motor: para señalar valores clampados
    avisos,               // passthrough crudo (la vista ya los trae formateados)
  };
  // internamente: analizar(formToEntrada(form), { conEscenarios: false })
}

// Camino diferido. app.js lo llama cuando la sección Escenarios se hace visible.
export function escenariosDesdeFormulario(form) {
  return vistaEscenarios;   // = la parte `vista.escenarios` (no null)
  // internamente: analizar(formToEntrada(form), { conEscenarios: true }) y remodela SOLO escenarios
}
```

Internos del adapter (no exportados, testeados vía las dos funciones públicas):

- `formToEntrada(form) → entrada` — parsea `"37.500"`/`"37500"`/`37500` → `37500`; campos `%` →
  fracción (`"75"` → `0.75`); toggle → `objetivo.modo`; combos vacíos en modo evaluar →
  `escaleraPrecios: []`; `mezcla1/2/3` → `{ 1, 2, 3 }`. Arma el objeto anidado
  `{ producto, supuestos, mercado, publicidad, overhead, mezcla, objetivo }`. Único que conoce
  ambos juegos de nombres.
- `resultadoToVista(resultado, modo) → vista` — reagrupa en los 6 bloques, formatea (moneda/%/
  ratio, `"—"` para `null`), precalcula las respuestas de primer nivel, y **escala todo lo
  visual a 0–100** (anchos de barra, coordenadas de gráfico) para que el renderer no divida
  nada.
- `formato.js`: `pesos(n)` → `"$105.100"` (es-CO), `pct(fr, dec=0)` → `"13 %"`, `ratio(n)` →
  `"2,8×"`, `oGuion(v, fmt)` → `fmt(v)` o `"—"` si `v == null`. Helpers puros; los usa el
  adapter, nunca el renderer.

`ui/graficos.js` recibe de la `vista` coordenadas ya en 0–100 y solo dibuja `<rect>` / `<path>`
/ `<circle>` / `<line>`. No calcula dominios ni escalas.

## Forma de `form` (modelo del panel izquierdo)

Objeto plano; `formulario.js` lo lee del DOM. Todos strings tal como los tipeó el usuario; el
adapter coerciona.

```
modo                       'sugerir' | 'evaluar'
costoUnitario              moneda
utilidadObjetivo           moneda   (solo modo sugerir)
precioBase                 moneda   (solo modo evaluar)
precio2, precio3           moneda   (solo modo evaluar; vacío = precioBase * n)
fleteIda, fleteDevolucion  moneda
tasaEntrega, tasaCierre    porcentaje
costoConversacion          moneda
presupuestoDia             moneda
-- avanzado --
comisionRecaudoPct         porcentaje
comisionRecaudoFijo        moneda
feeDevolucion              moneda
pctProductoPerdido         porcentaje
empaque                    moneda
costoAtencionConv          moneda
cesionCombo                porcentaje
costosFijosMes             moneda
diasOperacionMes           entero
mezcla1, mezcla2, mezcla3  porcentaje  (suman 100; el motor renormaliza y avisa si no)
redondeoGranularidad       entero
redondeoTerminacion        entero
redondeoDireccion          'arriba' | 'cercano' | 'abajo'
```

## Forma de `vista` (lo que pinta el renderer)

Todo valor con sufijo textual (`precio`, `gana`, `margenNeto`…) es un **string ya formateado**
listo para `textContent`. Todo valor con sufijo `Raw` o `Pct` es un **número** para anchos/
coordenadas. `clase` es un nombre de clase CSS. `null` no aparece: el adapter ya lo convirtió a
`"—"` donde va texto, o marca `disponible: false`.

```js
vista = {
  meta: { modo, comboSeleccionado: 1 },              // combo del bloque 3 (por defecto 1)

  veredicto: {
    estado: 'gana' | 'pierde' | 'sin-pauta',
    titulo: 'SÍ, VAS GANANDO' | 'NO, VAS PERDIENDO' | 'FALTAN DATOS DE PAUTA',
    clase: 'ver-gana' | 'ver-pierde' | 'ver-neutro',
    gananciaLimpia: '$13.333',                        // utilidad.final del mejor combo (o "—")
    gananciaComboN: 3,
    mejorCombo: { n: 3, precio: '$244.100', margenPct: '14 %' },
    topeConversacion: '$6.140',                       // costoConversacionMaximo del mejor combo (o "—")
    costoConversacionActual: '$4.000',
    holguraConversacion: '$2.140',                    // tope − actual (con signo; "—" si sin-pauta)
    lineas: [ 'Ganás $13.333 limpios por venta entregada (combo de 1u).',
              'Mejor combo: 3 unidades · $244.100 · margen neto 14 %.',
              'Podés pagar hasta $6.140 por conversación (hoy pagás $4.000).' ],
  },

  avisos: [ { nivel: 'error'|'aviso', codigo, mensaje, clase: 'av-error'|'av-aviso' } ],
  resumenAvisos: { errores: 0, avisos: 1 },

  combos: [
    { n: 1, titulo: '1 unidad', esMejor: false,
      precio: '$105.100', precioRaw: 105100, esSugerido: true, precioSugerido: '$105.100',
      editable: false,                                // true en modo evaluar
      gana: '$13.333', margenNeto: '13 %', margenBruto: '58 %', markup: '2,8×',
      cac: '$26.667', descuentoMax: '14 %',
      semaforo: { nivel: 'sano', clase: 'sem-sano', anchoPct: 62, etiqueta: 'Margen sano' } },
    ...  // n:2, n:3
  ],

  desglose: {
    comboN: 1, precio: '$105.100', precioRaw: 105100,
    // partes que SUMAN el precio (CAC va aparte): cogs + fleteIda + comisionRecaudo + empaque
    // + colchonDevoluciones + utilidad, donde utilidad = precio − suma(las otras 5).
    partes: [
      { clave: 'cogs',                label: 'Producto',              monto: '$37.500', anchoPct: 35.7, clase: 'part-1' },
      { clave: 'fleteIda',            label: 'Flete',                 monto: '$20.000', anchoPct: 19.0, clase: 'part-2' },
      { clave: 'comisionRecaudo',     label: 'Comisión de recaudo',   monto: '$0',      anchoPct: 0,    clase: 'part-3' },
      { clave: 'empaque',             label: 'Empaque',               monto: '$0',      anchoPct: 0,    clase: 'part-4' },
      { clave: 'colchonDevoluciones', label: 'Colchón devoluciones',  monto: '$6.667',  anchoPct: 6.3,  clase: 'part-5' },
      { clave: 'utilidad',            label: 'Tu utilidad',           monto: '$40.933', anchoPct: 39.0, clase: 'part-6' },
    ],
    cac: '$26.667',
    notaCac: 'No es costo de la unidad: es lo que cuesta traer al cliente que paga (pauta + atención ÷ cierre ÷ entrega).',
  },

  equilibrio: [
    { clave: 'precioMinimo',   label: 'Precio mínimo (1u)',       limite: '$91.767', actualLabel: 'vendés a',  actual: '$105.100',
      holguraPct: 12.6, clase: 'eq-ok'|'eq-ajustado'|'eq-malo', alcanzable: true },
    { clave: 'entregaMinima',  label: 'Entrega mínima',           limite: '59,2 %',  actualLabel: 'tu tasa',   actual: '75 %',    holguraPct: ..., clase, alcanzable },
    { clave: 'cierreMinimo',   label: 'Cierre mínimo',            limite: '13 %',    actualLabel: 'tu tasa',   actual: '20 %',    ... },
    { clave: 'costoConvMax',   label: 'Costo/conversación máx',   limite: '$6.140',  actualLabel: 'hoy pagás', actual: '$4.000',  ... },
    { clave: 'roasMinimo',     label: 'ROAS mínimo',              limite: '2,57',    actualLabel: 'tu ROAS',   actual: '3,94',    ... },
    { clave: 'unidadesDiaFijos', label: 'Unidades/día para fijos', limite: '—',      actualLabel: '',          actual: '',        alcanzable: false },
  ],

  proyeccion: {
    disponible: true,
    pedidosDia: '1,0', ventasEntregadasDia: '0,75',
    utilidadDia: '$10.700', utilidadDiaRaw: 10700, utilidadMes: '$321.000', utilidadMesRaw: 321000,
    nota: 'Ya restados pauta, atención y costos fijos.',
  },

  escenarios: null,   // o, tras escenariosDesdeFormulario:
  // {
  //   sensibilidad: { variables: [
  //     { clave, label,
  //       puntos: [ { xPct: 0, yPct: 82, delta: '−50 %', valor: '−$1.200' }, ... 11 ],
  //       cruceXPct: 68 | null,       // x donde utilidad.final = 0 (interpolado); null si no cruza
  //       ejeY: { ceroPct: 55, max: '$18k', min: '−$6k' } },
  //     ... 5 ] },
  //   tornado: [ { clave, label, abajoPct: 40, arribaPct: 100, abajo: '−$4.000', arriba: '+$10.400',
  //               dirAbajo: 'neg', dirArriba: 'pos' }, ... ordenado desc ],
  //   matriz: { ejeEntrega: ['50%','60%','70%','80%','90%'], ejeCierre: ['10%','15%','20%','25%','30%'],
  //             celdas: [ [ { valor: '−$0,3M', clase: 'mx-n2', actual: false }, ... 5 ], ... 5 ],
  //             actual: { fila: 2, col: 2 } },
  // }
}
```

### Reglas de derivación que el adapter aplica

- `veredicto.estado`: `'sin-pauta'` si `combos[0].utilidad.final == null`; si no, `'gana'` si
  **algún** combo tiene `utilidad.final > 0`, `'pierde'` si ninguno.
- `veredicto.mejorCombo` / `gananciaComboN`: de `resultado.mejorCombo.n`.
- `veredicto.topeConversacion`: `equilibrio.costoConversacionMaximo` evaluado en el mejor combo
  (usar `resultado.equilibrio` que es base combo 1 — nota: el motor calcula los escalares de
  equilibrio sobre combo 1; se muestra así y la etiqueta dice "(1u)" donde aplica).
- `combos[i].editable`: `true` solo en modo evaluar.
- `combos[i].semaforo.anchoPct`: mapeo fijo de `nivel` → ancho (premium 100, sano 75, apretado
  48, muy-apretado 25, pierde 12, sin-dato 0).
- `desglose.partes`: los 5 componentes de `combo.costo` + la parte `utilidad` = `precioRaw −
  Σ(5 componentes)`. `anchoPct = monto / precioRaw * 100`, clamp a `[0, 100]`. Si algún
  componente > precio (caso `precio_bajo_costo`), se pinta la barra en rojo y `anchoPct` se
  reparte proporcional.
- `equilibrio[].clase`: `'eq-malo'` si el valor actual ya cruzó el límite (perdés); `'eq-ajustado'`
  si está dentro del ~15 % relativo del límite; `'eq-ok'` si hay holgura. `alcanzable: false` →
  `limite: '—'` + fila atenuada.
- `escenarios.sensibilidad.variables[].puntos[].yPct`: el adapter calcula el dominio Y por
  gráfico (min/max de `utilidad.final` en los 11 pasos, con un pequeño margen) y normaliza.
  `cruceXPct`: interpola linealmente entre los dos pasos donde cambia el signo; `null` si no hay
  cambio de signo.
- `escenarios.tornado[].abajoPct`/`arribaPct`: `|impacto| / maxMagnitud * 100`.
- `escenarios.matriz.celdas[][].clase`: escala divergente de 5 pasos (`mx-n2 mx-n1 mx-0 mx-p1
  mx-p2`) sobre `utilidadMes`, con `0` en el centro.

## Wireframe — panel izquierdo

```
CALCULADORA DE RENTABILIDAD                          (~340px, sticky, scroll propio)
contraentrega · Colombia

╭ Sugerir │ Evaluar ╮          ← segmented control; setea form.modo

PRODUCTO
  Costo del proveedor (por unidad)        $ [        ]
  · sugerir ·  Utilidad que querés ganar   $ [        ]   por venta entregada
  · evaluar ·  Precio 1 unidad             $ [        ]
               Precio 2 unidades  opcional $ [        ]
               Precio 3 unidades  opcional $ [        ]

CONTRAENTREGA
  Flete de ida (se paga siempre)          $ [        ]
  Flete de devolución (si rebota)         $ [        ]
  Entrega efectiva                          [   ] %

PUBLICIDAD
  Costo por conversación                  $ [        ]
  Cierre chat → venta                       [   ] %
  Presupuesto diario de pauta             $ [        ]

▸ Avanzado                                 (plegado por defecto)
    Comisión de recaudo        [  ]%  + $ [      ] fijo
    Fee fijo por devolución             $ [        ]
    % de producto perdido en devolución   [   ] %
    Empaque por pedido                  $ [        ]
    Costo de atender la conversación    $ [        ]
    Cesión de utilidad por unidad extra   [   ] %
    Costos fijos al mes                 $ [        ]
    Días de operación al mes              [   ]
    Mezcla de ventas   1u [  ]%  2u [  ]%  3u [  ]%
    Redondeo  múltiplo [1000]  terminación [900]  dirección ( arriba │ cercano │ abajo )

nota fija al pie: «Los defaults salen del motor. Un valor fuera de rango se ajusta y aparece un aviso.»
```

- Campos "Precio 1/2/3" solo visibles en modo evaluar; "Utilidad objetivo" solo en sugerir
  (`CAMPOS[].modo`).
- Cada campo: label arriba, input abajo, `ayuda` como `title`/tooltip o texto chico bajo el
  input. Prefijo `$` dentro del input para moneda, sufijo `%` para porcentaje.
- El rail entero: `position: sticky; top: 0; max-height: 100vh; overflow-y: auto`.

## Wireframe — panel derecho (columna centrada, max ~780px)

```
1 · VEREDICTO   [tarjeta con elevación y fondo semántico tenue]
   ¿ES RENTABLE?     ▐ SÍ, VAS GANANDO ▍        (verde / rojo / gris)
   Ganás $13.333 limpios por venta entregada (combo 1u)
   Mejor combo: 3 unidades · $244.100 · margen neto 14 %
   Podés pagar hasta $6.140 por conversación (hoy pagás $4.000 — margen $2.140)
   ── ⚠ 1 aviso · 🔴 0 errores            [ver ▾]   ← despliega la lista

2 · COMBOS   [3 tarjetas iguales]
   ┌ 1 UNIDAD ────┐ ┌ 2 UNIDADES ──┐ ┌ 3 UNIDADES  ★ mejor ┐
   │ $105.100     │ │ $174.100     │ │ $244.100            │
   │ sugerido     │ │ sugerido     │ │ sugerido           │
   │ gana  $13.333│ │ gana  $XX.XXX│ │ gana  $XX.XXX      │
   │ margen  13 % │ │ margen  14 % │ │ margen  14 %       │
   │ markup  2,8× │ │ markup  2,3× │ │ markup  2,2×       │
   │ CAC  $26.667 │ │ CAC  $26.667 │ │ CAC  $26.667       │
   │ ▓▓▓▓▓░ sano  │ │ ▓▓▓▓▓▓ sano  │ │ ▓▓▓▓▓▓ sano        │
   │ desc.máx 14 %│ │ desc.máx 20 %│ │ desc.máx 22 %      │
   └──────────────┘ └──────────────┘ └───────────────────┘
   (modo evaluar: el precio de cada tarjeta es un input; "sugerido" queda debajo para comparar)

3 · DE DÓNDE SALE EL PRECIO        combo: ( 1u ▾ )
   $105.100 =
   ▐████ Producto ▐██ Flete ▐ Com. ▐ Emp. ▐█ Colchón ▐█████ Tu utilidad     ← barra apilada
     $37.500      $20.000   $0    $0    $6.667      $40.933                    que SUMA el precio
   ─ aparte ─  CAC $26.667
   «No es costo de la unidad: es lo que cuesta traer al cliente que paga.»

4 · TUS LÍMITES (punto de equilibrio)   [6 filas]
   Precio mínimo (1u)      $91.767   vendés a   $105.100   ▐████████░░ holgura
   Entrega mínima          59,2 %    tu tasa    75 %       ▐███████░░░
   Cierre mínimo           13 %      tu tasa    20 %       ▐██████░░░░
   Costo/conversación máx  $6.140    hoy pagás  $4.000     ▐███████░░░
   ROAS mínimo             2,57      tu ROAS    3,94       ▐██████░░░░
   Unidades/día p/ fijos   —         (sin costos fijos cargados)

5 · PROYECCIÓN (con este presupuesto)
   Pedidos/día 1,0      Ventas entregadas/día 0,75
   Utilidad/día $10.700          Utilidad/mes $321.000
   «Ya restados pauta, atención y costos fijos.»

6 · ESCENARIOS   ( Sensibilidad │ Tornado │ Matriz )    ← pestañas; cálculo diferido al abrir
   Sensibilidad:  5 mini-gráficos SVG (uno por palanca), eje X −50 %…+50 %,
                  línea de la utilidad final, punto marcado donde cruza cero.
   Tornado:       barras divergentes horizontales; cuánto mueve la utilidad un ±10 %
                  de cada palanca; ordenadas por magnitud descendente; línea 0 al centro.
   Matriz:        heatmap 5×5 (entrega 50–90 % filas × cierre 10–30 % columnas),
                  color por utilidad/mes (escala divergente), tu celda actual con anillo.
```

Mapeo de las preguntas de primer nivel → bloque 1 (rentable/gano/mejor combo/tope adquisición) +
bloque 4 (límites). El desglose matemático (bloques 3, 5, 6) va después, siempre en ese orden.

## Interacción y rendimiento

- Cada `input`/`change` del formulario → `formulario.leerForm()` → debounce **120 ms** →
  `analizarDesdeFormulario(form)` → `render.pintar(vista)` (bloques 1–5). El motor sin escenarios
  es sub-ms.
- Bloque 6 **perezoso**: `IntersectionObserver` sobre la sección; la primera vez que entra en
  viewport (o se toca una de sus pestañas si está fuera de vista) → `escenariosDesdeFormulario(form)`
  → `graficos.pintar(vista.escenarios)`. Si después cambia una entrada:
  - sección visible → recalcula con debounce **250 ms**;
  - sección no visible → marca "desactualizado" y recalcula al volver a mostrarse.
- Toggle Sugerir/Evaluar: `formulario` muestra/oculta los campos de precio vs. utilidad objetivo
  (`CAMPOS[].modo`) y dispara un recálculo.
- **Sin salto de layout**: cada bloque tiene alto/slots estables; los valores `null` se pintan
  `"—"`. Los `<input>` de precio de las tarjetas de combo existen siempre en el DOM y solo se
  habilitan/deshabilitan según el modo.
- Movimiento: con `prefers-reduced-motion: reduce` no hay ninguno. Si no: 120 ms de `ease` en
  cambios numéricos y en el `width` de la barra apilada y las barras de holgura. Nada de reveals
  al hacer scroll. El "SÍ/NO" del veredicto no anima, solo cambia.

## Dirección visual

Tokens en `ui/estilos.css` bajo `:root`. Tema claro en esta fase; los tokens quedan agrupados
para que un `@media (prefers-color-scheme: dark)` sea un añadido chico luego.

- **Tipografía** (Google Fonts):
  - UI y titulares: **Geist Sans** — `font-family: 'Geist', system-ui, sans-serif`.
  - Cifras (dinero, %, ratios, ejes de gráficos): **Geist Mono** — `'Geist Mono', ui-monospace,
    monospace`, con `font-variant-numeric: tabular-nums` en toda tabla/columna de números.
  - Escala: 12 / 13 / 15 / 18 / 24 px; el "SÍ/NO" del veredicto `clamp(30px, 5vw, 40px)`.
  - Labels de sección: 11px, `letter-spacing: .08em`, `text-transform: uppercase`,
    `color: var(--tinta-suave)`.
- **Paleta** (light):
  - `--fondo #FBFCFE` · `--superficie #FFFFFF` · `--borde #E7EAEF` · `--tinta #1A1D21` ·
    `--tinta-suave #5B6470`.
  - `--acento #3B5BDB` (índigo — interacción, foco, activo, enlaces). `--acento-suave #EDF0FD`.
  - Semántico (separado del acento): `--ok #0E9F6E` · `--ok-bg #E7F6F0` ·
    `--warn #D97706` · `--warn-bg #FDF3E7` · `--mal #DC2626` · `--mal-bg #FCECEC`.
  - Colores de las 6 partes del desglose: una rampa neutra→acento de 6 pasos (no semántica).
- **Componentes**:
  - Tarjeta genérica: `--superficie`, borde `1px var(--borde)`, radio 14px, **sin sombra**.
  - Bloque Veredicto: **único** con sombra (`0 1px 3px rgba(20,23,33,.08), 0 8px 24px
    rgba(20,23,33,.06)`) y fondo `--ok-bg` / `--mal-bg` / neutro según estado.
  - Inputs: alto 40px, radio 10px, borde `1px var(--borde)`, foco `2px var(--acento)` +
    `outline-offset: 1px`. Prefijo `$` / sufijo `%` en gris dentro del campo.
  - Barra apilada y gauges del semáforo: alto 10–14px, radio 6px, `transition: width 120ms ease`.
- **Layout**: ritmo de 8px. Rail izq. `340px` fijo; columna de resultados `min(780px, 100%)`
  centrada; gap 32–40px entre paneles. Densidad de herramienta (más apretado que una landing)
  pero con aire entre bloques (24–28px).
- **Responsive lite**: bajo `900px` → un solo flujo vertical; el rail izquierdo pasa a un
  `<details>` "Entradas" plegable arriba, abierto por defecto; el resto igual.

## Los 3 visuales de escenarios (SVG inline en `ui/graficos.js`)

Todos reciben coordenadas ya en 0–100 desde `vista.escenarios`. `graficos.js` solo dibuja.

- **Sensibilidad** — 5 celdas (grid). Cada una: un `<svg viewBox="0 0 100 60">` con una
  `<polyline>` de los 11 `puntos` (`xPct`, `yPct`), la línea de cero (`<line>` en
  `ejeY.ceroPct`), y si `cruceXPct != null` un `<circle>` + etiqueta en ese x. Título = `label`,
  eje X marcado −50 % / 0 / +50 %. Color de la línea: `--acento`; tramo bajo cero en `--mal`.
- **Tornado** — un `<svg>` con una fila por palanca (ordenadas por magnitud desc). Barra desde
  el centro (x=50) hacia la izquierda (`abajoPct`) y la derecha (`arribaPct`); `<line>` vertical
  en x=50. Izquierda/derecha coloreadas por `dirAbajo`/`dirArriba` (`--mal` para el lado que
  baja la utilidad, `--ok` para el que la sube). Etiqueta de palanca a la izquierda, montos en
  las puntas.
- **Matriz** — `<svg>` 5×5 de `<rect>`; fill por `celda.clase` (rampa divergente de 5). Anillo
  (`stroke`) en la celda `actual`. Ejes: entrega en las filas (izquierda), cierre en las
  columnas (arriba). Cada celda muestra `valor` (mono, chico).

## Tests

`test/adapter-form-a-entrada.test.js` (puro):
- `"$37.500"`, `"37500"`, `37500`, `"37.500,00"` → `37500`; `""`/basura → el default del campo.
- Campo `%`: `"75"` → `0.75`; `"7,5"` → `0.075`.
- Toggle → `objetivo.modo`; en evaluar sin `precio2`/`precio3` → `escaleraPrecios: []`; con
  ambos → `[{cantidad:2,precio:…},{cantidad:3,precio:…}]`.
- `mezcla1/2/3` `"50"/"30"/"20"` → `{ 1:50, 2:30, 3:20 }` (el motor renormaliza).
- `redondeoDireccion` fuera de las 3 opciones → `'arriba'`.

`test/adapter-resultado-a-vista.test.js` (puro):
- Dado el `Resultado` de los defaults (mismo escenario que el snapshot de Fase 1): `vista.combos`
  tiene 3, `combos[0].precio === '$105.100'`, `veredicto.estado === 'gana'`,
  `veredicto.mejorCombo.n === 3`.
- `Resultado` con `costoConversacion: 0` → `veredicto.estado === 'sin-pauta'`,
  `combos[0].cac === '—'`, `combos[0].gana === '—'`, `proyeccion.disponible === false`.
- `desglose.partes` suma `precioRaw` (Σ `anchoPct` ≈ 100 ± 0.1).
- `equilibrio` tiene 6 filas; una con `alcanzable: false` trae `limite: '—'`.
- `escenariosDesdeFormulario` → `sensibilidad.variables` tiene 5, cada una 11 `puntos` con
  `xPct` de 0 a 100; `tornado` tiene 5 filas ordenadas por magnitud desc; `matriz.celdas` es
  5×5 y exactamente una `actual: true`.

`test/ui-separada.test.js` (guarda de capas — lee los archivos como texto):
- Cada archivo de `src/**`: no contiene `ui/`, `document`, `window`, `localStorage`.
- `ui/adapter.js` y `ui/formato.js`: no contienen `document`, `window`, `localStorage`, `fetch`
  (son puros; testeables con `node --test`).
- `ui/render.js` y `ui/graficos.js`: **no importan de `../src/`** — los renderers solo conocen
  la `vista`, nunca el motor. (Import del motor solo permitido en `ui/adapter.js`.)
- `ui/app.js`: su único import de lógica es `./adapter.js` (no importa `../src/` directo).

Sin tests de DOM en esta fase (no hay runner de navegador sin deps). La verificación visual es
`npm run dev` + abrir en el navegador.

## Despliegue (follow-up, lo hace el dueño)

- Este PR: `npm run dev` (server estático de `scripts/servir.mjs`, cero deps) → abrir
  `http://localhost:<puerto>` → verificar.
- Producción: Cloudflare Pages. Necesita conexión Git o `wrangler`.
  - Opción A: push del repo a GitHub → Pages → "Connect to Git" → build command: *(ninguno)* ·
    output dir: `/` (raíz) → agregar dominio `calculadora.jdsmplus.co` (la zona ya está en
    Cloudflare, es un registro). Pages sirve la raíz; `src/` y `ui/` quedan accesibles (JS
    estático, sin secretos) — cosméticamente imperfecto, aceptable.
  - Opción B: `npx wrangler pages deploy .` con un API token de Cloudflare.

## Riesgos y decisiones abiertas

- **Geist en Google Fonts**: si Geist Sans/Mono no estuvieran servibles vía `fonts.googleapis.com`
  al implementar, el fallback es **Inter** (UI) + **JetBrains Mono** (cifras) — ambos seguro en
  Google Fonts; se decide en la Tarea de estilos, no cambia nada más.
- **`equilibrio` escalares sobre combo 1**: el motor calcula `tasaEntregaMinima` etc. sobre el
  combo 1. La UI lo muestra con la etiqueta "(1u)" donde aplica; no se intenta recalcular por
  combo en esta fase.
- **`veredicto.topeConversacion` del "mejor" combo vs. combo 1**: el motor da el escalar sobre
  combo 1. Se muestra ese (coherente con el bloque 4). Si se quiere el del mejor combo, es un
  cálculo extra en el adapter llamando… no: quedaría fuera del contrato de 2 funciones. Se usa
  el de combo 1 y la línea del veredicto lo dice.
- **Precio editable en las tarjetas (modo evaluar)**: editar el precio de la tarjeta 1 escribe
  `form.precioBase`; tarjeta 2/3 escriben `form.precio2`/`form.precio3`. Un solo modelo `form`,
  el input de la tarjeta y el del rail izquierdo están sincronizados (ambos apuntan al mismo
  campo de `form`).
- **Pages sirviendo la raíz**: expone `docs/`, `test/`, `src/`. Sin riesgo (estático, sin
  secretos); si molesta, un `dist/` con copia se añade en Fase 2.x.
