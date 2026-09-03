# Motor de rentabilidad — Fase 1 (motor puro) · Diseño

## Objetivo

El módulo `src/` de este repo: dado un producto y unos supuestos de operación contra entrega,
calcula en una sola pasada precio sugerido por combo (1/2/3), costo real, utilidad (en sus tres
denominadores), margen, markup, CAC, ROAS, descuento máximo, los seis puntos de equilibrio y los
escenarios «¿qué pasa si?». Es la corrección de las fórmulas de la calculadora HTML previa
(`calculadora-precios.html`, ver `docs/auditoria-calculadora-actual.md`).

Fase 1 es **solo el motor**: funciones puras, sin base de datos, sin UI, sin red. Objeto plano
de entrada → objeto `Resultado`.

## Contexto

- Repo standalone. Node ESM (≥22.5). **Cero dependencias.** Tests con
  `node --test --test-concurrency=1`, sin `--env-file`.
- Patrón inspirado en `src/catalog.js` del CRM de ventas (funciones numéricas puras exportadas y
  testeadas), pero este repo **no importa nada de ese proyecto ni de ningún otro**.
- La escalera de precios del CRM (`products.precios_cantidad`) es `[{cantidad, precio}]` con el
  precio **TOTAL del paquete**, `cantidad > 1`, ordenada. El motor usa ese mismo shape como
  entrada (`escaleraPrecios`) para que el adaptador de la Fase 3 sea trivial.
- El CRM **no guarda el costo del producto** (al importar de Dropi se aplica un margen y solo se
  guarda el precio de venta). En Fase 1 el costo es un input plano; capturarlo del catálogo es
  trabajo de Fase 3.
- Plata: entero COP en todo el motor. `Math.round` al final, nunca en intermedios.

## Alcance

**Incluye (Fase 1):**

- `src/` con la estructura de módulos de abajo.
- `analizar(entrada) → Resultado`: única función pública (`src/index.js`).
- Fórmulas corregidas C.1–C.9 de la auditoría (costo del pedido fallido descompuesto y que
  escala con `n`; comisión de recaudo despejada del precio; utilidad en tres denominadores
  nombrados; proyección con costos fijos).
- Sugerencia de precio por combo (modo `sugerir`) y evaluación de un precio dado (modo `evaluar`).
- Los seis puntos de equilibrio, todos en forma cerrada.
- Escenarios: sensibilidad de una variable, tornado (±10 %), matriz entrega × cierre.
- Validación → lista de avisos con código.
- Tests puros: identidades, monotonía, bordes, snapshot de regresión.

**No incluye (fases siguientes, anotado como límite conocido):**

- UI web (evolución del HTML) y su despliegue.
- Adaptador que arma la `entrada` leyendo el catálogo + métricas del CRM (tasa de entrega y
  cierre reales por producto desde `orders`).
- Integración con Meta Ads para el costo por conversación real (sigue siendo input).
- Persistencia / escenarios guardados / multi-producto.
- Reescribir la calculadora HTML suelta.

## Arquitectura

### El contrato

```
import { analizar } from './src/index.js';
const resultado = analizar(entrada);
const conEscenarios = analizar(entrada, { conEscenarios: true });
```

`analizar` es **pura y total**: nunca lanza por datos del usuario (un input inválido produce un
aviso en `resultado.avisos`, no una excepción), no lee entorno, no toca disco ni red. Todo el
cálculo ocurre en la llamada; la UI futura solo pinta `Resultado`.

Por defecto **no calcula los escenarios** (`resultado.escenarios === null`): son ~90 llamadas
internas a `analizar` y la ruta cara solo hace falta en un panel de «¿qué pasa si?». Se piden
con `analizar(entrada, { conEscenarios: true })`. Un frontend que llama `analizar` en cada
tecla debe quedarse con el default.

### Módulos

```
src/
  index.js         analizar(entrada, {conEscenarios}) · normalizarEntrada() · DEFAULTS · elegirMejorCombo(combos) · calcularProyeccion(...)
  normalizar.js    DEFAULTS · normalizarEntrada(entrada) → { ctx, entradaNormalizada, avisos }
  util.js          num · clamp · aviso · pesos
  costos.js        crearCostos(ctx) → { cogs(n), costoPedidoFallido(n), colchonDevoluciones(n), comisionRecaudo(precio), costoTotalPorVenta(n, precio, cac) }
  rentabilidad.js  crearRentabilidad(ctx, costos, publicidad) → { brutoPorPedido, utilidadPorPedido, utilidadPorVentaEntregada, utilidadFinal, margen, markup, cac }
  publicidad.js    crearPublicidad(ctx) → { disponible, cac(), pautaPorPedido(), pautaPorVenta(), roasActual(precio) }
  combos.js        crearCombos(ctx, costos, rent) → { sugerirPrecioCombo(n), precioCrudo(n), evaluarCombo(n), semaforoDe(margenNeto) }
  equilibrio.js    crearEquilibrio(ctx, costos, rent, publicidad) → { precioMinimo(n), descuentoMaximoPct(n, precio), tasaEntregaMinima(n, precio), tasaCierreMinima(n, precio), costoConversacionMaximo(n, precio), roasMinimo(n, precio), unidadesDiaParaFijos(combos, mezcla) }
  escenarios.js    sensibilidadUnaVariable(entrada, variable, analizar) · tornado(entrada, analizar) · matrizEntregaCierre(entrada, analizar)
  redondeo.js      redondear(v, { granularidad, terminacion, direccion })
  validacion.js    revisar(ctx, combos) → aviso[]
test/
  un *.test.js por módulo + identidades.test.js · bordes.test.js
  fixtures/snapshot-defaults-html.json · identidades.snapshot-util.mjs
scripts/
  generar-snapshot.mjs   (regenera el fixture; NO lo corre `node --test`)
```

`index.js` es la única superficie pública. Los demás archivos exportan sus funciones para test
unitario directo. Las factories `crearCostos` / `crearRentabilidad` / `crearPublicidad` /
`crearCombos` / `crearEquilibrio` reciben el **contexto ya normalizado** (`ctx`: supuestos y
mercado con defaults y clamps aplicados) y cierran sobre él, así `utilidadFinal(n, precio)` no
recibe `ctx` en cada llamada y los tests arman un `ctx` una vez con `normalizarEntrada(...).ctx`.

## Entrada

```js
{
  producto: {
    costoUnitario,          // COP, costo real del proveedor por unidad. Requerido.
    precioBase,             // COP, precio de 1 unidad. null => el motor lo sugiere (modo 'sugerir').
    escaleraPrecios,        // [{ cantidad, precio }] con precio TOTAL del paquete, cantidad>1. [] = sin combos definidos.
  },
  supuestos: {
    fleteIda,                        // COP. Se paga SIEMPRE (entregue o no). Default 0.
    fleteDevolucion,                 // COP. Solo si el pedido rebota. Default 0.
    feeDevolucion,                   // COP fijo por devolución (Dropi/transportadora). Default 0.
    pctProductoPerdidoEnDevolucion,  // 0..1. Se aplica a costoUnitario*n en la rama fallida. Default 0.
    comisionRecaudoPct,              // 0..1 sobre el precio cobrado (solo pedido entregado). Default 0.
    comisionRecaudoFijo,             // COP por pedido entregado. Default 0.
    empaquePorPedido,                // COP. Default 0.
    costoAtencionConversacion,       // COP por conversación (asesor/API), aparte del costo de ads. Default 0.
    cesionUtilidadPorUnidadExtra,    // 0..1. El "d" del HTML: cada unidad extra del combo cede esta fracción de la utilidad objetivo. Default 0.20.
    redondeo: {
      granularidad,                  // COP. Default 1000.
      terminacion,                   // COP restados tras redondear al múltiplo. Default 900 (precios "...900").
      direccion,                     // 'arriba' | 'cercano' | 'abajo'. Default 'arriba' (nunca deja el precio bajo el objetivo).
    },
  },
  mercado: {
    tasaEntrega,           // 0..1. Fracción de pedidos generados que se entregan y pagan. Clamp [0.01, 1].
    tasaCierre,            // 0..1. Fracción de conversaciones que se vuelven pedido. Clamp [0.01, 1].
    costoConversacion,     // COP que cobra la plataforma de ads por conversación iniciada.
  },
  publicidad: { presupuestoDia },              // COP. Default 0.
  overhead:   { costosFijosMes, diasOperacionMes },   // COP, días. Default 0 y 30.
  mezcla:     { 1: p1, 2: p2, 3: p3 },         // fracciones que suman 1. Default { 1: 1, 2: 0, 3: 0 }. Si no suman 1 => aviso + renormaliza.
  objetivo: {
    modo,                 // 'sugerir' | 'evaluar'. Default: 'sugerir' si producto.precioBase == null, si no 'evaluar'.
    utilidadObjetivo,     // COP de utilidad por venta entregada (ANTES de CAC), para n=1. Requerido si modo='sugerir'.
  },
}
```

`normalizarEntrada(entrada)` aplica defaults, hace los clamps, renormaliza `mezcla`, resuelve
`objetivo.modo`, y deja el resultado en `resultado.entradaNormalizada`.

## Resultado

```js
{
  entradaNormalizada,          // lo que realmente se usó
  avisos: [ { codigo, nivel: 'error' | 'aviso', mensaje } ],
  combos: [
    {
      n, ingreso,
      precioSugerido,         // el precio que sugiere el motor para ese n — SIEMPRE presente,
                              //   también cuando `ingreso` viene de la escalera (para comparar / Fase 3)
      esSugerido,             // bool — true si `ingreso` lo puso el motor (no había escalera ni precioBase)
      costo:    { cogs, fleteIda, comisionRecaudo, empaque, colchonDevoluciones, total },   // por venta entregada
      utilidad: { porPedidoGenerado, porVentaEntregada, final },
      margen:   { bruto, neto },
      markup:   { sobreProducto, sobreProductoYFlete },
      cac,
      roas:     { actual, equilibrio },
      descuentoMaximoPct,
      semaforo: { nivel, pct },   // premium | sano | apretado | muy-apretado | pierde
    }
  ],
  mejorCombo: { n, criterio: 'utilidad/dia ponderada por mezcla' },
  equilibrio: {
    precioMinimo: [ { n, valor } ],
    tasaEntregaMinima, tasaCierreMinima, costoConversacionMaximo, roasMinimo, unidadesDiaParaFijos,
  },
  proyeccion: { pedidosDia, ventasEntregadasDia, utilidadDia, utilidadMes },   // ya con fijos restados
  escenarios: {   // null salvo que se llame con { conEscenarios: true }
    sensibilidad: { [variable]: [ { delta, utilidadFinal, margenNeto, utilidadMes, cruzaCero } ] },
    tornado: [ { variable, impactoAbajo, impactoArriba } ],
    matrizEntregaCierre: { ejes, celdas },
  },
}
```

## Fórmulas

Notación: `C` = `costoUnitario`, `n` = unidades, `t` = `tasaEntrega`, `k` = `tasaCierre`,
`cc` = `costoConversacion`, `ca` = `costoAtencionConversacion`.

### Costos

```
cogs(n)                = C * n

costoPedidoFallido(n)  = fleteIda + fleteDevolucion + feeDevolucion
                         + pctProductoPerdidoEnDevolucion * C * n

colchonDevoluciones(n) = ((1 - t) / t) * costoPedidoFallido(n)

comisionRecaudo(precio) = comisionRecaudoPct * precio + comisionRecaudoFijo
```

`fleteIda` aparece tanto en el pedido entregado (abajo) como en `costoPedidoFallido` — **no es
doble conteo**: son las dos ramas mutuamente excluyentes de la esperanza (entrega vs. rebota), y
el flete de ida se pagó en ambas.

### Rentabilidad

```
brutoPorPedido(n, precio)            = precio - cogs(n) - fleteIda - comisionRecaudo(precio) - empaquePorPedido

utilidadPorPedido(n, precio)         = t * brutoPorPedido(n, precio) - (1 - t) * costoPedidoFallido(n)      // esperanza por pedido GENERADO

utilidadPorVentaEntregada(n, precio) = utilidadPorPedido(n, precio) / t
                                     = brutoPorPedido(n, precio) - colchonDevoluciones(n)                   // por venta que SI entrego

utilidadFinal(n, precio)             = utilidadPorVentaEntregada(n, precio) - cac                           // lo que queda limpio, sin fijos
```

### Publicidad

```
pautaPorPedido = cc / k
pautaPorVenta  = pautaPorPedido / t
cac            = (cc + ca) / (k * t)          // costo de adquirir un cliente que PAGA

roasActual(precio)        = (t * precio * k) / cc
roasEquilibrio(n, precio) = (t * precio * k) / costoConversacionMaximo(n, precio)
```

Si `cc <= 0` (aviso `sin_pauta`): `cac`, `pautaPorPedido`, `pautaPorVenta`, `roasActual` y todo
lo que dependa de ellos (`utilidadFinal`, `margenNeto`, la proyección) se reportan `null`, no
`Infinity`. `utilidadPorVentaEntregada` y los márgenes brutos sí se calculan.

### COSTO total y márgenes

```
costoTotalPorVenta(n, precio) = cogs(n) + fleteIda + comisionRecaudo(precio) + empaquePorPedido
                                + colchonDevoluciones(n) + cac

identidad:  precio - costoTotalPorVenta(n, precio) == utilidadFinal(n, precio)     // test

margenBruto(n, precio) = (precio - cogs(n) - fleteIda - comisionRecaudo(precio)) / precio   // antes de devoluciones y CAC
margenNeto(n, precio)  = utilidadFinal(n, precio) / precio

markupSobreProducto(n, precio)       = precio / cogs(n)
markupSobreProductoYFlete(n, precio) = precio / (cogs(n) + fleteIda)
```

### Sugerir precio (modo `sugerir`)

```
Utotal(n) = utilidadObjetivo * (1 + (n - 1) * (1 - cesionUtilidadPorUnidadExtra))

// Resolver utilidadPorVentaEntregada(n, precio) = Utotal(n).
// utilidadPorVentaEntregada es lineal en precio con pendiente (1 - comisionRecaudoPct):

precioCrudo(n) = ( cogs(n) + fleteIda + comisionRecaudoFijo + empaquePorPedido
                   + colchonDevoluciones(n) + Utotal(n) ) / (1 - comisionRecaudoPct)

precioSugerido(n) = redondear(precioCrudo(n), redondeo)
```

Compatibilidad hacia atrás: con `comisionRecaudoPct = comisionRecaudoFijo = empaquePorPedido = 0`
y `n = 1`, esto es exactamente `C + fleteIda + colchon + utilidadObjetivo`, la fórmula del HTML.

En modo `sugerir` con `escaleraPrecios` no vacía, el motor **evalúa esa escalera tal cual** (no
la pisa) y además reporta `precioSugerido(n)` para comparar; el `ingreso` del combo es el de la
escalera si hay fila para ese `n`, si no el sugerido. `combo.precioSugerido` se calcula
**siempre** (en todos los combos, cualquier modo) — es el número que Fase 3 usa para el botón
«escribir precio sugerido al catálogo». `combo.esSugerido` es el booleano «¿el `ingreso` lo puso
el motor?». En modo `evaluar` sin `escaleraPrecios`, los combos 2/3 se calculan como
`precioBase * n` (sin descuento) y se marca aviso `combo_sin_precio`.

### Puntos de equilibrio (todos en forma cerrada)

Al despejar denominadores, `utilidadFinal = 0` es lineal en cada palanca por separado:

```
// 1 · Precio minimo por combo (utilidadFinal = 0, con CAC)
precioMinimo(n) = ( cogs(n) + fleteIda + comisionRecaudoFijo + empaquePorPedido
                    + colchonDevoluciones(n) + cac ) / (1 - comisionRecaudoPct)

descuentoMaximoPct(n, precio) = max(0, 1 - precioMinimo(n) / precio)

// 2 · Tasa de entrega minima (precio fijo). Multiplicar utilidadFinal*t y despejar:
//   t*bruto - (1-t)*CPF - (cc+ca)/k = 0   con CPF = costoPedidoFallido(n), bruto = brutoPorPedido(n, precio)
tasaEntregaMinima(n, precio) = ( CPF + (cc + ca)/k ) / ( bruto + CPF )

// 3 · Tasa de cierre minima (k solo aparece en el CAC):
tasaCierreMinima(n, precio) = (cc + ca) / ( t * utilidadPorVentaEntregada(n, precio) )

// 4 · Costo por conversacion maximo:
costoConversacionMaximo(n, precio) = k * t * utilidadPorVentaEntregada(n, precio) - ca

// 5 · ROAS minimo: roasEquilibrio con costoConversacionMaximo (arriba)

// 6 · Unidades/dia para cubrir los fijos:
unidadesDiaParaFijos(combos, mezcla) = (costosFijosMes / diasOperacionMes) / utilidadFinalPonderada
   donde utilidadFinalPonderada = SUMA_n  mezcla[n] * utilidadFinal(n, ingreso_n)
```

Si un resultado sale fuera de rango (`tasaEntregaMinima > 1`, denominador <= 0, etc.) se reporta
`null` para ese campo más un aviso `equilibrio_inalcanzable`. La forma cerrada es la
implementación; si un supuesto futuro rompe la linealidad, se cae a bisección sobre el rango
válido (no hace falta en Fase 1).

### Proyección

```
conversacionesDia   = presupuestoDia / cc
pedidosDia          = conversacionesDia * k
ventasEntregadasDia = pedidosDia * t

utilidadDia = pedidosDia * utilidadPorPedidoPonderada
              - presupuestoDia
              - conversacionesDia * ca
              - costosFijosMes / diasOperacionMes

utilidadMes = utilidadDia * diasOperacionMes
```

`utilidadPorPedidoPonderada = SUMA_n mezcla[n] * utilidadPorPedido(n, ingreso_n)` (sin CAC — el
gasto de ads y de atención se restan aparte).

Identidad a testear: `utilidadMes ~= ventasEntregadasMes * utilidadFinalPonderada - costosFijosMes`
(dentro del redondeo).

### Escenarios

```
sensibilidadUnaVariable(entrada, variable)
  variable en { costoConversacion, tasaEntrega, costoPedidoFallido, precio, tasaCierre }
  -> para delta en [-0.5 ... +0.5] en pasos de 0.1:
       recalcula analizar() con esa variable escalada por (1 + delta)
       devuelve [{ delta, utilidadFinal, margenNeto, utilidadMes, cruzaCero }]
       (cruzaCero marca el primer paso donde utilidadFinal cambia de signo)
  Para 'costoPedidoFallido' se escalan **solo** los términos que dependen de que el pedido rebote
       (`fleteDevolucion`, `feeDevolucion`, `pctProductoPerdidoEnDevolucion`) — NO `fleteIda`,
       que se paga también en el pedido entregado.
  Para 'precio' se perturba el **precio realizado** (±X% real): en modo `evaluar` se escala
       `precioBase` y la escalera; en modo `sugerir` se corre `analizar` una vez, se toma el
       precio sugerido de 1u y se re-corre en modo `evaluar` con ese precio ×factor — así la
       fila `precio` del tornado es comparable con las demás (±10 % real, no ±10 % de la
       utilidad objetivo, que movía el precio solo ~3,8 %).

tornado(entrada)
  -> para cada variable de arriba: impacto en utilidadFinal (combo n=1) de un +-10 %
       [{ variable, impactoAbajo, impactoArriba }]  ordenado por |impacto| desc

matrizEntregaCierre(entrada)
  -> ejes: tasaEntrega en {50,60,70,80,90}%  x  tasaCierre en {10,15,20,25,30}%
       celdas[i][j] = utilidadMes con ese par
       marca la celda del par actual (redondeado al valor de eje mas cercano)
```

Los escenarios reusan `analizar()` internamente sobre copias de la entrada — una sola
definición de las fórmulas.

## Validación (`validacion.revisar`)

Devuelve `[{ codigo, nivel, mensaje }]`. `nivel: 'error'` marca los resultados como no fiables
(se calculan igual); `nivel: 'aviso'` es una advertencia.

| codigo | nivel | cuándo |
|---|---|---|
| `costo_faltante` | error | `costoUnitario` <= 0 |
| `precio_bajo_costo` | error | algún `ingreso` < `cogs(n) + fleteIda` |
| `entrega_en_piso` | aviso | `tasaEntrega` tocó el clamp inferior (0.01) |
| `cierre_en_piso` | aviso | `tasaCierre` tocó el clamp inferior |
| `devolucion_sin_costo` | aviso | `fleteDevolucion + feeDevolucion + pctProductoPerdidoEnDevolucion·costoUnitario` == 0 (COD sin riesgo de devolución modelado; **no** mira `fleteIda`, que casi siempre está y tapaba el aviso) |
| `mezcla_renormalizada` | aviso | `mezcla` no sumaba 1 |
| `combo_sin_precio` | aviso | modo `evaluar`, combo 2/3 sin fila en `escaleraPrecios` |
| `escalera_incoherente` | aviso | un combo mayor cuesta por unidad más que uno menor |
| `equilibrio_inalcanzable` | aviso | **cualquiera** de los 6 puntos salió `null`: `precioMinimo[].valor`, `roasMinimo` o `unidadesDiaParaFijos` nulos; o —solo si hay pauta— `tasaEntregaMinima` / `tasaCierreMinima` / `costoConversacionMaximo` nulos. Sin pauta `precioMinimo` es `null` por diseño, así que este aviso acompaña a `sin_pauta` |
| `sin_pauta` | aviso | `costoConversacion` <= 0 |

## Redondeo (`redondeo.redondear`)

```
redondear(v, { granularidad, terminacion, direccion }):
  si v <= 0: return 0
  'cercano' -> Math.max(0, Math.round(v/granularidad)*granularidad - terminacion)
  'abajo'   -> Math.max(0, Math.floor(v/granularidad)*granularidad - terminacion)
  'arriba'  -> base = Math.ceil(v/granularidad)*granularidad
               si base - terminacion < v: base += granularidad   // no quedar bajo el objetivo
               return base - terminacion
```

Con `direccion: 'arriba'` el precio sugerido **nunca queda por debajo del valor crudo** — si al
restar la terminación (p. ej. 900) el resultado caería por debajo, sube un escalón más. Corrige
el sesgo del HTML, que redondeaba al cercano y siempre restaba 100. Solo se aplica al precio
sugerido final.

## Tests (`test/*.test.js`, puros, sin base de datos)

`identidades.test.js`
- `sugerir` con `utilidadObjetivo = U` => `evaluar` ese `precioSugerido` da
  `utilidadPorVentaEntregada(1, precio) ~= U` (tolerancia = `granularidad`).
- `precio - costoTotalPorVenta(n, precio) == utilidadFinal(n, precio)` para varios n y precio.
- `utilidadMes ~= ventasEntregadasMes * utilidadFinalPonderada - costosFijosMes`.
- `evaluar(precioMinimo(n))` => `utilidadFinal ~= 0`.
- Compatibilidad HTML: con todos los supuestos nuevos en 0 y `d = 0.20`,
  `precioSugerido(1|2|3)` y `utilidadPorVentaEntregada` reproducen los números de la auditoría
  (dentro del redondeo).

`equilibrio.test.js`
- Cada palanca de equilibrio, sustituida de vuelta en `analizar`, da `utilidadFinal ~= 0` (o la
  proyección mensual = 0 para `unidadesDiaParaFijos`).
- Fuera de rango => `null` + aviso, nunca `NaN` ni `Infinity`.

`escenarios.test.js`
- `tornado` ordenado por impacto absoluto; signos correctos (subir costo baja utilidad).
- `sensibilidad`: `utilidadFinal` monótona decreciente al subir `costoConversacion` /
  `costoPedidoFallido`; monótona creciente al subir `tasaEntrega` / `tasaCierre` / `precio`.
- `matrizEntregaCierre`: celda del par actual marcada; esquina (entrega alta, cierre alto) >=
  esquina (entrega baja, cierre baja).

`bordes.test.js`
- `tasaEntrega = 0` => clamp a 0.01 + aviso `entrega_en_piso`, sin `NaN`.
- `escaleraPrecios = []` en modo `sugerir` => combos 2/3 con precio sugerido, sin error.
- `mezcla = { 1: 2, 2: 1, 3: 1 }` => renormaliza a `{ .5, .25, .25 }` + aviso.
- `costoUnitario = 0` => aviso `costo_faltante`; `markup` reporta `null`.
- `costoConversacion = 0` => aviso `sin_pauta`; `cac` / `roas` / `utilidadFinal` en `null`.
- Snapshot del `Resultado` completo para la entrada de los defaults del HTML actual
  (`test/fixtures/snapshot-defaults-html.json`), como bloqueo de regresión.

## Convenciones

- Identificadores y comentarios **en español**.
- COP entero en todo el motor; una función `pesos(n)` solo para mensajes de aviso.
- Cada archivo hace una cosa; si `index.js` pasa de ~200 líneas, algo se movió mal.
- Sin dependencias. Nada de `.env` en los tests.
- El motor no importa de ningún otro proyecto.

## Riesgos y decisiones abiertas

- **Semántica de `utilidadObjetivo`**: es utilidad por venta entregada *antes* de CAC (igual que
  el `utilidad` del HTML). Si más adelante se quiere fijar el objetivo *después* de CAC, cambia
  solo `sugerirPrecioCombo` y su test.
- **`cesionUtilidadPorUnidadExtra`** conserva el modelo del HTML. Es configurable; si el dueño
  prefiere «utilidad/unidad plana con solo flete y colchón amortizados», es otra fórmula de
  `sugerirPrecioCombo`, aislada.
- **Forma cerrada vs. bisección** en equilibrio: forma cerrada porque hoy todo es lineal al
  despejar. Si un supuesto futuro (flete por tramos de peso) rompe la linealidad, se añade
  bisección en `equilibrio.js` sin cambiar la interfaz.
- El **snapshot** de `test/identidades.test.js` se regenera a propósito cuando una fórmula
  cambie — es su función, no un estorbo. Regenerar: `npm run snapshot`
  (`scripts/generar-snapshot.mjs`). Vive fuera de `test/` para que `node --test` no lo ejecute:
  así el snapshot test compara contra el fixture commiteado y es un guard real, no
  auto-satisfecho.

### Desviaciones del spec ya en el código (sanas; se anotan porque Fase 2/3 leen esto como contrato)

- `elegirMejorCombo` vive en `index.js`, no en `combos.js`. En la rama sin pauta (fallback a
  `porVentaEntregada`) el `criterio` que devuelve lo dice: `'mayor utilidad por venta entregada
  (sin descontar pauta)'`.
- La validación es `revisar(ctx, combos)` — recibe el `ctx` normalizado y los combos ya armados,
  no `revisar(entradaNormalizada)`.
- `evaluarCombo(n)` (un solo argumento); el precio a evaluar sale del `ctx`/escalera, no se pasa.
- `costoTotalPorVenta(n, precio, cac)` es de 3 argumentos (el `cac` entra explícito), no de 2.
- **Política de `null` en equilibrio** (simétrica): `tasaEntregaMinima` y `tasaCierreMinima` ya
  **no** cortan por «no hay pauta». Con `cc = 0` el término `(cc+ca)/k` se anula; `tasaEntregaMinima`
  queda `CPF/(bruto+CPF)` (válido) y `tasaCierreMinima` se auto-nulea vía su range-check si además
  `ca = 0`. `precioMinimo` sí sigue `null` sin pauta (usa el CAC).
- **Proyección con `presupuestoDia = 0` pero `costoConversacion > 0`**: no devuelve todo `null`;
  como no hay ventas, `utilidadDia = -(costosFijosMes / diasOperacionMes)` (y el mes proporcional),
  `pedidosDia`/`ventasEntregadasDia` en 0. El todo-`null` queda solo para `costoConversacion <= 0`
  (ahí no se puede ni calcular CAC).

## Fases siguientes (fuera de este spec, para contexto)

- **Fase 2** — UI web: evolución del `calculadora-precios.html` sobre este motor, un solo HTML
  autocontenido. Despliegue previsto: Cloudflare Pages en `calculadora.jdsmplus.co`.
- **Fase 3** — integración con el CRM: el CRM consume **solo el motor** (mecanismo `file:` / git
  / copia, se decide entonces); un adaptador arma la `entrada` desde `catalog.getProduct` +
  métricas reales (tasa de entrega y cierre por producto desde `orders` / `order_items`); una
  pantalla «Rentabilidad» en el panel con botón para escribir el precio sugerido de vuelta a
  `products.precios_cantidad` con confirmación humana. Requiere primero una migración aditiva
  (`costo` en `products`) y capturar el costo del proveedor en `dropi.js` / `shopify.js`.
