# Calculadora de rentabilidad — Diseño V2

**Fecha:** 2026-09-04
**Estado:** spec para revisión. No implementar hasta aprobación.
**Repo:** `calculadora-rentabilidad` (proyecto independiente; sin dependencia del CRM).

## Qué cambia respecto a V1 (Fase 1 + Fase 2)

V1 es una **calculadora de precios**: metés todos los números y te da un resultado.
V2 es un **motor de decisión de precio con nivel de confianza de los datos**: metés el
costo del proveedor y el margen que querés, y te dice a qué precio vender, **cuán
confiable es esa recomendación**, y qué datos deberías conseguir para afinarla.

El cambio no es matemático (el motor Fase 1 se conserva casi intacto): es de **modelo
de datos** (cada parámetro lleva estado: REAL / SUPUESTO / FALTANTE / CONFIG) y de
**producto** (el precio recomendado es el protagonista; los supuestos son visibles;
nada faltante se convierte en `$0` en silencio).

Diseñada para dos etapas:
- **Etapa 1 (hoy):** JDSMPlus arranca. El usuario conoce el costo y poco más. La
  calculadora estima con supuestos configurables, claramente marcados.
- **Etapa 2 (meses):** llegan pedidos, conversaciones, entregas, devoluciones y gasto
  de pauta. Los SUPUESTO/FALTANTE se reemplazan por REAL **sin tocar el motor**.

---

# PARTE A — Modelo económico y arquitectura

## A.1 · Modelo probabilístico COD

Cada **pedido generado** (un cliente que confirma "lo quiero") tiene dos desenlaces:

```
                  ┌── prob t ──▶  ENTREGADO   ingreso P · costos: cogs(n) + Fᵢ + qP + Q + E
pedido generado ──┤
                  └── prob 1−t ─▶ FALLIDO     ingreso 0 · costos: Fᵢ + F_d + f_d + ρ·C·n
```

`t` = tasa de entrega efectiva (de los pedidos que salen, cuántos se entregan y pagan).

## A.2 · Parámetros

`C` = costo unitario del proveedor · `n` = unidades del combo · `P` = precio total del combo.

| Símbolo | Nombre | Unidad | Rol | Default JDSMPlus | Estado inicial |
|---|---|---|---|---|---|
| `C` | costo del proveedor | $ / unidad | **entrada del usuario** | — | 🟢 REAL (lo escribe) |
| `m` | margen neto objetivo | fracción de `P` | **decisión del usuario** | 0.25 | ⚙️ CONFIG |
| `Fᵢ` | flete de ida | $ / pedido | logística | 20 000 | 🟡 SUPUESTO |
| `t` | tasa de entrega | fracción | mercado | 0.75 | 🟡 SUPUESTO |
| `k` | tasa de cierre chat→pedido | fracción | mercado | 0.20 | 🟡 SUPUESTO |
| `cc` | costo por conversación (pauta) | $ / conversación | adquisición | 4 000 | 🟡 SUPUESTO |
| `diasOp` | días de operación al mes | días | overhead | 30 | 🟡 SUPUESTO |
| `F_d` | flete de devolución | $ / pedido fallido | logística | — | 🔴 FALTANTE |
| `f_d` | fee fijo por devolución | $ / pedido fallido | logística | — | 🔴 FALTANTE |
| `ρ` | pérdida de producto en devolución | fracción de `C·n` | logística | — | 🔴 FALTANTE |
| `q` | comisión de recaudo (%) | fracción de `P` | pasarela COD | — | 🔴 FALTANTE |
| `Q` | comisión de recaudo (fija) | $ / pedido entregado | pasarela COD | — | 🔴 FALTANTE |
| `E` | empaque por pedido | $ / pedido | logística | — | 🔴 FALTANTE |
| `ca` | costo de atención por conversación | $ / conversación | adquisición | — | 🔴 FALTANTE |
| `costosFijos` | costos fijos al mes | $ / mes | overhead | — | 🔴 FALTANTE (omitible) |
| `escaleraPrecios` | precios de combo ya fijados | `[{n, precio}]` | opcional | — | ⚙️ CONFIG si se da |
| `redondeo` | granularidad / terminación / dirección | — | presentación | 1000 / 900 / arriba | ⚙️ CONFIG |

Derivados (los calcula el motor, no se ingresan):

| Símbolo | Nombre | Fórmula |
|---|---|---|
| `cogs(n)` | costo de producto | `C · n` |
| `CPF(n)` | costo esperado de un pedido no entregado | `Fᵢ + F_d + f_d + ρ·C·n` |
| `colchón(n)` | cuota de devoluciones por venta entregada | `((1−t)/t) · CPF(n)` |
| `cac` | costo de adquisición **por venta entregada y pagada** | `(cc + ca) / (k · t)` |
| `K₀(n)` | recuperación de costos por venta entregada (sin precio, sin adquisición) | `cogs(n) + Fᵢ + Q + E + colchón(n)` |

## A.3 · Estados de dato

| Estado | Símbolo | Definición | El motor lo recibe como |
|---|---|---|---|
| **REAL** | 🟢 | dato observado y verificado de la operación de JDSMPlus | número |
| **SUPUESTO** | 🟡 | valor configurable, usado temporalmente **porque todavía no existe el dato real**. Es una asunción consciente, no un hueco. | número |
| **FALTANTE** | 🔴 | dato necesario que **no puede asumirse sin alterar materialmente la recomendación** | `null` |
| **CONFIG** | ⚙️ | decisión estratégica del usuario (margen objetivo, redondeo, escalera de combos). No es un dato del negocio. | número |

**Reglas duras:**
- Un FALTANTE **nunca** se convierte en `0` en silencio.
- La recomendación siempre reporta *sobre qué* se calculó: cuántos SUPUESTO, cuántos FALTANTE, y si el margen es **neto** u **operativo**.
- Cambiar el estado de un parámetro de SUPUESTO/FALTANTE a REAL **no requiere tocar el motor** — solo cambia `valor` y `procedencia` en la entrada.

## A.4 · Contrato de entrada

El motor sigue recibiendo **números planos / `null`** (no objetos `{valor, estado}`). El
estado viaja por un mapa paralelo `procedencia`.

```js
entrada = {
  producto:  { costoUnitario, escaleraPrecios },          // costoUnitario: number | null
  supuestos: {
    fleteIda, fleteDevolucion, feeDevolucion,             // number | null
    pctProductoPerdidoEnDevolucion,
    comisionRecaudoPct, comisionRecaudoFijo,
    empaquePorPedido, costoAtencionConversacion,
    redondeo: { granularidad, terminacion, direccion },
  },
  mercado:   { tasaEntrega, tasaCierre, costoConversacion },
  overhead:  { costosFijosMes, diasOperacionMes },
  objetivo:  { modo, regla: { tipo, valor } },            // tipo: 'margen_neto' | 'utilidad_fija' | 'markup'
  procedencia: {
    costoUnitario: 'REAL' | 'SUPUESTO' | 'FALTANTE',
    fleteIda: 'SUPUESTO',
    fleteDevolucion: 'FALTANTE',
    // ... una clave por parámetro económico
    'objetivo.regla.valor': 'CONFIG',
  },
}
```

- `modo`: `'sugerir'` (recomendar precio; default) | `'evaluar'` (dado un precio, medirlo).
- `regla.tipo` default `'margen_neto'`; `regla.valor` default `0.25`.
- Un parámetro ausente en `procedencia` se asume `'FALTANTE'` si su valor es `null`, `'SUPUESTO'` si es número.

### A.4.1 · Criticidad de cada parámetro FALTANTE

| Clase | Parámetros | Qué hace el motor si están FALTANTE |
|---|---|---|
| **Crítico** | `C` | estado `sin_costo`, sin número |
| **Crítico** | `Fᵢ` | estado `no_calculable` nombrando `fleteIda`, sin número |
| **Interruptor de CAC** | `cc` (y el input directo `cac` si se añade) | `cac := null` → ruta **operativa** (`*_bruto`), no neta |
| **Degradante** | `F_d`, `f_d`, `ρ`, `q`, `Q`, `E`, `ca` | se calculan como `0` **con aviso obligatorio y visible** ("N parámetros FALTANTES asumidos en $0; el precio recomendado es un piso, el real será mayor") + esos parámetros se marcan 🔴 en la tabla "Datos usados". El estado pasa a `estimacion_*`. **No es silencioso.** |
| **Diagnóstico** | `costosFijos`, `diasOp` | solo la métrica "unidades/día para cubrir fijos" queda no disponible; no afecta el precio recomendado |
| **Estructural** | `k`, `t` | el motor los acota a `[0.01, 1]` (ya lo hace V1). `k·t = 0` es imposible tras el clamp. |

> **Opción de rigor (config):** `criticidadDevoluciones: 'estricta'` hace que `F_d`/`f_d`/`ρ`/`q`/`E` FALTANTE también produzcan `no_calculable` en vez de degradar. Default: `'permisiva'` (degrada con aviso), para que la calculadora sea usable en la Etapa 1.

## A.5 · Contrato de salida

```js
resultado = {
  entradaNormalizada,                 // como V1
  procedencia,                        // eco de entrada.procedencia + derivados
  recomendacion: {
    estado,                           // uno de los 8 (A.7)
    precio,                           // number | null — el precio recomendado redondeado (combo 1)
    precioCrudo,                      // number | null — sin redondear (para la prueba de identidad)
    tipoMargen,                       // 'neto' | 'operativo'
    margenObjetivo,                   // m (fracción)
    margenLogrado,                    // margen al `precio` redondeado; ≥ objetivo por el redondeo
    utilidadPorVentaEntregada,        // $ que queda por venta entregada al `precio`
    confianza: {
      supuestos: ['fleteIda', 'tasaEntrega', 'costoConversacion'],   // 🟡 usados
      faltantesAsumidosCero: [],                                     // 🔴 tratados como 0
      cacDisponible: false,
    },
    avisos: [ { codigo, nivel: 'info'|'aviso'|'error', mensaje } ],
  },
  combos: [ /* n=1,2,3 — misma forma que V1, + margen objetivo por combo (A.6) */ ],
  equilibrio: { /* los 6 de V1 + precioMinimoOperativo (A.8) */ },
  proyeccion,                         // como V1 (null si falta cac o presupuesto)
  escenarios,                         // opt-in, como V1
  avisos,                             // avisos globales (mezcla renormalizada, etc.)
}
```

`procedencia` de un derivado = **el peor estado** entre sus insumos
(`REAL < SUPUESTO < FALTANTE`; `CONFIG` no degrada). Ej.: `cac` es 🟡 si `cc` es 🟡 y
`ca` es 🔴-asumido-0 → `cac` reporta 🔴; `precioRecomendado` hereda el peor de todos.

## A.6 · Fórmulas del motor (conservadas de V1)

```
cogs(n)                = C · n
comisionRecaudo(P)     = q·P + Q
CPF(n)                 = Fᵢ + F_d + f_d + ρ·C·n
colchón(n)             = ((1−t)/t) · CPF(n)
K₀(n)                  = cogs(n) + Fᵢ + Q + E + colchón(n)
cac                    = (cc + ca) / (k · t)          [null si cc es FALTANTE]

brutoPorPedido(n,P)        = P − cogs(n) − Fᵢ − comisionRecaudo(P) − E
utilidadPorPedido(n,P)     = t·brutoPorPedido(n,P) − (1−t)·CPF(n)
utilidadPorVentaEntregada(n,P) = utilidadPorPedido(n,P) / t
                             = P·(1−q) − K₀(n)
utilidadFinal(n,P)         = utilidadPorVentaEntregada(n,P) − cac      [null si cac null]
margenNeto(n,P)            = utilidadFinal(n,P) / P                    [null si cac null]
margenOperativo(n,P)       = utilidadPorVentaEntregada(n,P) / P
```

## A.7 · Algoritmo del precio recomendado — regla `margen_neto`

**Objetivo:** hallar `P` tal que `margenNeto(1, P) = m` (o `margenOperativo` si no hay CAC).

### Derivación (forma cerrada)

`utilidadFinal(1,P) = P·(1−q) − K₀(1) − cac`. Igualando a `m·P`:

```
P·(1−q) − K₀(1) − cac = m·P
P·(1 − q − m) = K₀(1) + cac
```

```
┌─────────────────────────────────────────────────────┐
│  P_crudo = (K₀(1) + cac) / (1 − q − m)               │   ← con CAC → margen NETO
│  P_crudo = K₀(1)        / (1 − q − m)                │   ← sin CAC → margen OPERATIVO
│  P_recomendado = redondear(P_crudo, redondeo)        │
└─────────────────────────────────────────────────────┘
```

### Flujo de decisión de estado

```
1. C FALTANTE .......................................... → sin_costo
2. objetivo.regla ausente/valor null ................... → sin_objetivo
3. Fᵢ FALTANTE (o config estricta y algún K₀ FALTANTE) . → no_calculable
4. 1 − q − m ≤ 0 ....................................... → no_alcanzable
       (m ≥ 1 − q. "Un margen del {m}% no es posible con
        una comisión de recaudo del {q}%.")
5. cac disponible?
   NO  → P_crudo = K₀(1)/(1−q−m) ;  tipoMargen = 'operativo'
         hay algún SUPUESTO o FALTANTE-asumido-0? → estimacion_bruto
         todo REAL?                               → ok_bruto
   SÍ  → P_crudo = (K₀(1)+cac)/(1−q−m) ; tipoMargen = 'neto'
         hay algún SUPUESTO o FALTANTE-asumido-0? → estimacion_neto
         todo REAL?                               → ok_neto
6. P_recomendado = redondear(P_crudo)
```

`no_alcanzable` se define **únicamente** por `1 − q − m ≤ 0` (o por un *precio mínimo
comercial* configurado, si se añade más adelante). **No** se define comparando
`P_crudo` con el precio de equilibrio — el break-even es un diagnóstico separado (A.8).

## A.8 · Break-even (diagnóstico separado)

Los 6 puntos de V1 (`equilibrio.js`) se conservan: `precioMinimo`,
`tasaEntregaMinima`, `tasaCierreMinima`, `costoConversacionMaximo`, `roasMinimo`,
`unidadesDiaParaFijos`.

Se **añade** `precioMinimoOperativo(n) = K₀(n) / (1 − q)` — el precio al que `utilidad
operativa = 0` (recuperás costos, antes de adquisición). Siempre calculable si `C` y
`Fᵢ` están. `precioMinimo` (con CAC) sigue devolviendo `null` cuando `cac` es null.

El break-even se muestra como *"tu piso"*, nunca como condición del estado de la
recomendación. Un `precioRecomendado` con `m > 0` siempre queda por encima del
`precioMinimoOperativo` por construcción.

## A.9 · Combos — Opción 1: mismo % de margen neto para todo `n`

```
P_crudo(n) = (K₀(n) + cac) / (1 − q − m)          [K₀(n)/(1−q−m) si no hay CAC]
P(n)       = redondear(P_crudo(n))
```

- `m` se aplica **una sola vez por combo**, idéntico para n=1,2,3. Identidad exacta para todo `n`.
- El descuento por volumen **emerge solo** de amortizar los costos fijos por pedido
  (`Fᵢ + Q + E + colchón + cac`) entre más unidades. Con el ejemplo de A.11:
  precio/unidad = 120 000 · 77 143 · 62 857 (descuentos 0% · 36% · 48%).
- Si `escaleraPrecios` trae un precio para `n`, ese **manda** (igual que V1); el
  `P_crudo(n)` se sigue calculando para comparar.
- La cesión de utilidad por unidad extra (`d`, el mecanismo histórico) **se traslada a
  la regla `utilidad_fija`** (A.10), donde "ceder pesos de utilidad" es la unidad natural.

## A.10 · Reglas avanzadas (no default)

| `regla.tipo` | `regla.valor` | `P_crudo(n)` | Cuándo |
|---|---|---|---|
| `utilidad_fija` | `U` (pesos, utilidad por venta entregada **antes** de CAC) | `(K₀(n) + Uₜₒₜₐₗ(n)) / (1 − q)` con `Uₜₒₜₐₗ(n) = U·(1 + (n−1)(1−d))`, `d` default 0.20 | el usuario piensa en "$X limpios por venta", no en % |
| `markup` | `f` (factor) | `redondear(C·n·f)` | referencia rápida; **ignora flete/devoluciones/CAC** → nunca es la regla de una recomendación firme; se marca siempre `estimacion_*` |

## A.11 · Prueba de identidad (test automatizado del motor)

**Fixture** (irá a `test/` como identidad obligatoria):

`C=24000, Fᵢ=20000, F_d=20000, f_d=0, ρ=0, q=0.05, Q=0, E=0, t=0.75, k=0.20, cc=4000, ca=0, m=0.25`

```
CPF(1)  = 20000 + 20000            = 40000
colchón = (0.25/0.75)·40000        = 13333.333…
K₀(1)   = 24000+20000+0+0+13333.33 = 57333.333…
cac     = 4000/(0.20·0.75)         = 26666.666…
P_crudo = (57333.33 + 26666.67)/(1−0.05−0.25) = 84000 / 0.70 = 120000.000
```

**Vuelta:** `margenNeto(1, 120000) = (120000·0.95 − 57333.33 − 26666.67)/120000 = 30000/120000 = 0.2500` → **25.00% exacto**. `assert |margenNeto(1, P_crudo) − m| < 1e-9`.

**Con redondeo:** `redondear(120000, {1000,900,arriba}) = 120100`;
`margenNeto(1, 120100) = 30095/120100 = 0.25058` → **25.06%**. `assert margenNeto(1, P_recomendado) ≥ m` y `≤ m + granularidad/P_crudo`.

**Sin CAC** (`cc` FALTANTE): `P_crudo = 57333.33/0.70 = 81904.76`;
`margenOperativo(1, 81904.76) = 20476.19/81904.76 = 0.2500` → **25.00% operativo exacto**;
`margenNeto = null`; estado `estimacion_bruto`. `assert resultado.recomendacion.tipoMargen === 'operativo'` y `resultado.margenNeto == null`.

**Combos** (Opción 1): para n=2,3 con los mismos parámetros,
`assert |margenNeto(n, P_crudo(n)) − m| < 1e-9`.

**Sensibilidad de `t`** (identidad de monotonía): `P_crudo(t=0.65) > P_crudo(t=0.75) > P_crudo(t=0.85)` y `∂P_crudo/∂t < 0` numéricamente (diferencias finitas).

## A.12 · Casos borde

| Caso | Resultado |
|---|---|
| Solo `C` (todo lo demás en default) | `estimacion_bruto` si `cc` está en el perfil como 🟡 → en realidad `estimacion_neto` con `cc=4000` 🟡, y `F_d/f_d/ρ/q/Q/E/ca` 🔴 asumidos 0 → **aviso "7 datos FALTANTES en $0; el precio es un piso"** |
| `m = 0` | `precio = precioMinimoOperativo` (o con CAC, `precioMinimo`). Estado válido; aviso "sin utilidad". |
| `m ≥ 1 − q` | `no_alcanzable` + "el mínimo para no perder es `precioMinimoOperativo`" |
| `t → 0.01` (clamp) | precio enorme; aviso `entrega_en_piso` (V1 ya lo emite) |
| `escaleraPrecios` con `n` que la regla no cubre | se usa la escalera; aviso "precio de combo fijado manualmente" |
| `regla.tipo = 'markup'` | siempre `estimacion_*` (ignora estructura de costos) |
| `costosFijos` FALTANTE | precio recomendado normal; solo "unidades/día para fijos" = `null` con aviso |
| todos los parámetros REAL + CAC | `ok_neto` — único estado sin advertencias de confianza |

## A.13 · Arquitectura de capas

```
  ui/formulario.js · ui/render.js · ui/graficos.js        ← DOM, presentación
        │  form ↔ entrada        │  resultado ↔ vista
  ui/adapter.js                                            ← SOLO mapeo. CERO fórmulas de negocio.
  ui/perfil.js  (NUEVO)                                    ← perfil económico JDSMPlus + localStorage. CERO fórmulas.
        │
  src/pricing/  (motor puro)                               ← toda la matemática. Sin BD, DOM, HTTP, ni "perfil".
    normalizar.js  → gana objetivo.regla + procedencia (eco) + null en vez de 0
    combos.js      → resolver margen_neto (forma cerrada) por combo
    equilibrio.js  → + precioMinimoOperativo
    validacion.js  → avisos estructurados por FALTANTE (crítico/degradante/interruptor CAC)
    index.js       → recomendacion.estado (los 8) + confianza
        ▲
  Fase 4 (FUTURO, no ahora): un adaptador que alimente valores REAL desde la operación
  de JDSMPlus (pedidos → t, k, ticket; conversaciones → cc; devoluciones → F_d, ρ;
  contabilidad → costosFijos). El contrato de entrada (A.4) ya lo permite: solo cambia
  `valor` y `procedencia`. El motor NO cambia.
```

**Regla de frontera:** `ui/adapter.js` nunca contiene una fórmula económica. Si un
cálculo hace falta, va en `src/pricing/`. `ui/perfil.js` solo guarda/lee valores y
estados.

---

# PARTE B — Diseño UX/UI

## B.1 · Principios

1. **Orientada a la decisión, no a los números.** La pantalla responde: *¿cuánto me
   cuesta? → ¿qué margen quiero? → ¿a cuánto vendo?* Todo lo demás es secundario.
2. **El precio recomendado es el elemento más importante de la pantalla.** Tamaño,
   contraste y posición lo dejan claro sin leer nada más.
3. **Honestidad del dato, visible.** REAL / SUPUESTO / FALTANTE no son texto chico
   escondido: el usuario entiende de un vistazo *cuán confiable* es la recomendación.
4. **Progressive disclosure.** Vista básica = 3 campos. El perfil económico, los
   escenarios y el desglose están a un clic, no en la cara.
5. **Empieza simple, escala con datos.** Hoy habrá muchos 🟡/🔴. En unos meses,
   🟢. La UI muestra esa evolución del nivel de confianza sin rediseñarse.

## B.2 · Arquitectura de pantalla

```
┌──────────────────────────────────────────────────────────────────────┐
│  Barra superior:  JDSMPlus · Rentabilidad          [ Perfil económico ]│
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌── ENTRADA (compacta, siempre visible) ──────────────────────────┐ │
│  │  Costo del proveedor  [ $ 24.000 ] 🟢     Margen que quiero [25%]⚙│ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌── RESULTADO PRINCIPAL (hero card) ─────────────────────────────┐  │
│  │                    PRECIO RECOMENDADO                          │  │
│  │                       $ 120.100                               │  │
│  │              margen neto objetivo: 25%                        │  │
│  │              utilidad estimada: $ 30.095 / venta entregada    │  │
│  │  ──────────────────────────────────────────────────────────   │  │
│  │  CONFIANZA:  🟡 3 supuestos    🔴 5 datos faltantes           │  │
│  │  [ Mejorar precisión → ]                                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌── SECUNDARIO (cards colapsables / acordeón) ──────────────────┐  │
│  │  ▸ Precio mínimo rentable        $ 81.900 (operativo)         │  │
│  │  ▸ Combos                        1u $120.100 · 2u $154.300 …  │  │
│  │  ▸ Utilidad y margen             …                            │  │
│  │  ▸ CAC máximo tolerable          …                            │  │
│  │  ▸ Punto de equilibrio          …                            │  │
│  │  ▸ Escenarios (¿y si…?)          entrega ↓, CAC ↑, …          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

Tres zonas: **Entrada** (2 campos, siempre visible, arriba) · **Resultado principal**
(hero, el 60–70% del peso visual) · **Secundario** (todo lo demás, colapsado por
defecto).

## B.3 · Jerarquía visual del resultado principal

```
        PRECIO RECOMENDADO          ← etiqueta pequeña, mayúsculas, tracking amplio
           $ 120.100                ← número enorme (display, ~56–72px desktop)
   margen neto objetivo: 25%        ← subtítulo
   utilidad estimada: $ 30.095      ← subtítulo
   ────────────────────────
   CONFIANZA · 🟡 3 supuestos · 🔴 5 faltantes    ← chip-fila de estado, color fuerte
   [ Mejorar precisión → ]          ← CTA hacia el perfil
```

Orden de lectura descendente: **precio → margen objetivo → utilidad → confianza →
acción**. Nada compite con el precio.

## B.4 · Vista básica

Solo tres elementos de entrada/salida:

1. **Costo del proveedor** — input de moneda, con su badge de estado (🟢 REAL al escribirlo).
2. **Margen que quiero** — input de % (o slider), badge ⚙️ CONFIG. Presets: 15 / 20 / 25 / 30.
3. **Precio recomendado** — el hero card.

Todo lo demás (flete, tasas, devoluciones, comisión, empaque, CAC, costos fijos) vive
en **Perfil económico**, no en la vista básica. Un usuario que abre la calculadora por
primera vez escribe *un número* y ve un precio con su nivel de confianza.

## B.5 · Perfil económico (vista avanzada)

Panel/pantalla aparte (`[ Perfil económico ]` en la barra superior, o el CTA "Mejorar
precisión"). Agrupado por bloque, cada parámetro es una fila:

```
  LOGÍSTICA
  ┌───────────────────────────────────────────────────────────────┐
  │ Flete de ida            [ $ 20.000 ]   🟡 SUPUESTO   [ⓘ]       │
  │ Flete de devolución     [          ]   🔴 FALTANTE   [ⓘ]       │
  │ Fee por devolución      [          ]   🔴 FALTANTE   [ⓘ]       │
  │ % producto perdido      [          ]   🔴 FALTANTE   [ⓘ]       │
  │ Empaque por pedido      [          ]   🔴 FALTANTE   [ⓘ]       │
  └───────────────────────────────────────────────────────────────┘
  MERCADO
  │ Tasa de entrega         [ 75 % ]       🟡 SUPUESTO   [ⓘ]       │
  │ Tasa de cierre          [ 20 % ]       🟡 SUPUESTO   [ⓘ]       │
  ADQUISICIÓN
  │ Costo por conversación  [ $ 4.000 ]    🟡 SUPUESTO   [ⓘ]       │
  │ Costo de atención       [          ]   🔴 FALTANTE   [ⓘ]       │
  PASARELA COD
  │ Comisión de recaudo %   [          ]   🔴 FALTANTE   [ⓘ]       │
  │ Comisión de recaudo fija[          ]   🔴 FALTANTE   [ⓘ]       │
  OVERHEAD
  │ Costos fijos al mes     [          ]   🔴 FALTANTE   [ⓘ]       │
  │ Días de operación       [ 30 ]         🟡 SUPUESTO   [ⓘ]       │
```

- Cada fila: **etiqueta · input · badge de estado · tooltip [ⓘ]** con la definición
  financiera del concepto.
- Al escribir un valor en un campo FALTANTE, el usuario elige el estado:
  **"Es un dato real"** (🟢) o **"Es un supuesto por ahora"** (🟡). Nunca queda 🔴 con
  valor.
- Botón **"Guardar perfil"** → persiste en `localStorage`. **"Restablecer supuestos
  JDSMPlus"** → vuelve a los defaults de A.2.
- Cabecera del perfil: barra de **nivel de confianza** — `3 REAL · 5 SUPUESTO · 6
  FALTANTE` con una barra apilada verde/ámbar/rojo. Es la métrica de "cuán maduro está
  mi modelo económico".

## B.6 · Representación de estados de dato

| Estado | Color | Chip | Uso |
|---|---|---|---|
| 🟢 REAL | verde principal `#3D5340` | `● REAL` | dato verificado |
| 🟡 SUPUESTO | ámbar cálido (derivado, ~`#C9A24B`) | `● SUPUESTO` | asunción consciente |
| 🔴 FALTANTE | rojo sobrio (~`#B4442F`) | `● FALTANTE` | hueco; bloquea o degrada |
| ⚙️ CONFIG | gris/tinta neutra | `⚙ CONFIG` | decisión del usuario |

- En el **hero card**: una fila-resumen `CONFIANZA · 🟡 N · 🔴 M`, con el color
  dominante en el borde/acento del card (si hay 🔴 → acento rojo tenue; si solo 🟡 →
  acento ámbar; si todo 🟢 → acento verde).
- En la **tabla "Datos usados"** (dentro del acordeón): una columna de estado con el
  chip por parámetro.
- Nunca solo texto pequeño: el color y el chip hacen el trabajo a distancia de lectura.

## B.7 · Estados de la recomendación (los 8)

| estado | Hero card muestra | Acento | CTA |
|---|---|---|---|
| `ok_neto` | precio + "margen neto 25% ✓" + "todos los datos son reales" | verde | — |
| `estimacion_neto` | precio + "margen neto objetivo 25%" + "🟡 estimación basada en N supuestos" | ámbar | Mejorar precisión |
| `ok_bruto` | precio + "margen OPERATIVO 25%" + "🔴 no incluye CAC — el margen neto real será menor" | rojo tenue | Cargar CAC |
| `estimacion_bruto` | precio + "margen OPERATIVO 25% · estimación" + "🔴 sin CAC · 🟡 N supuestos" | rojo tenue | Mejorar precisión |
| `no_alcanzable` | **sin precio grande.** "Un margen del 25% no es posible con una comisión del {q}%." + "el mínimo para no perder es $Y" | rojo | Ajustar margen / comisión |
| `no_calculable` | **sin precio.** "Falta {parámetro} para calcular." | rojo | Completar {parámetro} |
| `sin_objetivo` | **sin precio.** "Elegí el margen que querés." | neutro | — (foco en el input de margen) |
| `sin_costo` | **sin precio.** "Escribí el costo del proveedor." | neutro | — (foco en el input de costo) |

**Ejemplo `estimacion_bruto`** (el caso real de MaxCalm hoy):

```
        PRECIO ESTIMADO
           $ 82.100
   margen OPERATIVO objetivo: 25%
   utilidad estimada: $ 20.500 / venta entregada
   ─────────────────────────────────────────────
   🔴 No incluye CAC real (costo de traer al cliente)
   🟡 Estimación basada en 3 supuestos (flete, entrega, cierre)
   🔴 5 datos faltantes asumidos en $0 — el precio real será mayor
   ─────────────────────────────────────────────
   📊 Cuando tengas datos de ventas, entregas y publicidad,
      actualizá el perfil para una recomendación firme.
        [ Mejorar precisión → ]
```

## B.8 · Navegación

- **Una sola pantalla principal** (entrada + hero + secundario colapsable). Sin routing.
- **Perfil económico**: panel deslizante lateral (desktop) / pantalla completa (móvil).
- **Escenarios**: acordeón dentro del secundario; los gráficos SVG se calculan de forma
  diferida al expandir (como V1).
- El botón "Mejorar precisión" y los CTAs de estado siempre llevan al perfil, con foco
  en el parámetro relevante.

## B.9 · Comportamiento cuando faltan datos

| Situación | Comportamiento |
|---|---|
| `C` vacío | hero card en estado `sin_costo`; el resto de la UI atenuado; foco en el input de costo |
| Margen sin elegir | `sin_objetivo`; presets de margen resaltados |
| `cc` FALTANTE | precio se calcula en modo **operativo**; el hero lo dice explícito; "utilidad neta" y "proyección" muestran empty state "necesita tu CAC" con botón |
| `F_d`/`ρ`/`q`/`E` FALTANTE | precio se calcula (asumiendo 0); **banner rojo** "N datos en $0, el precio es un piso"; esos parámetros 🔴 en la tabla; el número del hero lleva un `~` ("~$82.100") |
| `costosFijos` FALTANTE | todo normal; solo la card "unidades/día para fijos" en empty state |
| `Fᵢ` FALTANTE | `no_calculable`; hero sin número, "Completá el flete de ida" + CTA |

Regla: **si hay número, hay confianza declarada al lado.** Si no se puede dar un
número honesto, se explica qué falta y por qué — nunca un `$0` o un precio ≈ costo
disfrazado de recomendación.

## B.10 · Responsive

**Desktop-first**, pero la jerarquía se **reorganiza** en pantallas chicas, no se comprime:

| Breakpoint | Layout |
|---|---|
| **≥ 1024px** | entrada en fila (2 campos) · hero card ancho · secundario en grilla 2–3 columnas de cards |
| **768–1023px (tablet)** | entrada en fila · hero card ancho · secundario en 1–2 columnas · perfil = panel lateral |
| **< 768px (móvil)** | **orden fijo:** (1) precio recomendado + confianza — *siempre arriba, sin scroll* → (2) los 2 inputs, justo debajo, compactos → (3) secundario como lista de acordeones a pantalla completa → perfil = pantalla completa |

En móvil el precio recomendado y su estado de confianza son lo primero que se ve; los
inputs quedan inmediatamente accesibles debajo (el usuario ajusta costo/margen y ve el
precio moverse sin scrollear).

## B.11 · Accesibilidad

- Contraste AA mínimo en todos los textos, incluidos los chips de estado sobre
  `#FAF5F0` (el ámbar y el rojo se eligen para pasar AA sobre ese fondo).
- Los estados **no dependen solo del color**: cada chip lleva su etiqueta textual
  (`REAL` / `SUPUESTO` / `FALTANTE`) y un ícono (`●` / `▲` / `○` o similar).
- El precio recomendado se anuncia por `aria-live="polite"` al recalcular (nodo
  persistente, no recreado por `innerHTML` — corrige el pendiente de V1).
- Todos los inputs con `<label>` asociado; tooltips accesibles por teclado (`:focus`),
  no solo `:hover`.
- Orden de tabulación: costo → margen → CTA principal → acordeones.
- `prefers-reduced-motion`: sin transiciones en el número del precio ni en los gráficos.
- Objetivos táctiles ≥ 44px en móvil.

## B.12 · Identidad visual JDSMPlus

| Token | Valor | Uso |
|---|---|---|
| Verde principal | `#3D5340` | acentos, encabezados, chip REAL, CTA primario, borde del hero cuando la confianza es alta |
| Verde claro | `#C3CCA6` | fondos de apoyo, estados vacíos suaves, hover, barra de confianza (tramo REAL) |
| Fondo neutro | `#FAF5F0` | fondo de la app |
| Tinta | derivar `#2B2B26` aprox. | texto principal |
| Ámbar (SUPUESTO) | derivar (~`#C9A24B`) | chip y acento SUPUESTO — verificar AA sobre `#FAF5F0` |
| Rojo (FALTANTE) | derivar (~`#B4442F`) | chip y acento FALTANTE — verificar AA |

Estética: **botánica, premium, minimalista, moderna**. Mucho aire, tipografía con
carácter para el número del precio (display), cuerpo neutro y legible. Sin sombras
pesadas, sin gradientes chillones, sin decoración que no comunique. Los gráficos de
escenarios: línea fina, sin relleno pesado, sin ejes ornamentales — solo lo que ayuda
a decidir.

La legibilidad manda sobre el branding: si el verde `#3D5340` no da contraste
suficiente para un texto, se usa la tinta.

## B.13 · Evolución del nivel de confianza (Etapa 1 → Etapa 2)

- La **barra de confianza** (en el perfil y, resumida, en el hero) es la métrica que el
  usuario ve madurar: `3 REAL · 5 SUPUESTO · 6 FALTANTE` → con el tiempo → `12 REAL · 2
  SUPUESTO · 0 FALTANTE`.
- Cada vez que un parámetro pasa a 🟢 REAL, el hero puede recalcular y el estado global
  puede subir (`estimacion_neto` → `ok_neto`).
- Mensaje persistente en Etapa 1: *"Estás usando supuestos iniciales de JDSMPlus.
  Cuando tengas datos de la operación, actualizá el perfil aquí."*
- Cuando (Fase 4) exista el adaptador que trae datos REAL de la operación, el usuario
  verá un *"Actualizar desde la operación"* que rellena los 🟢 automáticamente — sin
  cambiar nada del motor ni de esta UI.

## B.14 · Wireframe

Wireframe visual (3 estados: `estimacion_neto`, `estimacion_bruto`/faltan datos,
Perfil económico) entregado como artifact junto a esta spec.

---

# Fuera de alcance de V2

- Integración con el CRM, catálogo, Dropi, Shopify, pedidos o métricas reales (Fase 4).
- Multiusuario / persistencia en servidor (V2 usa `localStorage`).
- El adaptador que convierte datos operativos en parámetros REAL (Fase 4; el contrato
  A.4 ya lo deja preparado).

# Pruebas (resumen)

- **Identidad** (A.11): `margenNeto(1, P_crudo) = m` exacto; `≥ m` con redondeo;
  variante operativa sin CAC; combos n=2,3; monotonía en `t`.
- **Estados** (A.7): fixtures que disparan cada uno de los 8.
- **Procedencia**: un derivado hereda el peor estado de sus insumos; un FALTANTE nunca
  produce `0` sin aviso.
- **Frontera**: test que verifica que `ui/adapter.js` no importa nada de `src/pricing/`
  salvo el `analizar` público, y que no contiene aritmética de negocio (heredado de V1).
