# Auditoría de la calculadora HTML actual

Diagnóstico del archivo `calculadora-precios.html` (476 líneas, HTML+CSS+JS en uno) que este
proyecto reemplaza. Sirve de «por qué» para las fórmulas del motor — el detalle de la corrección
está en [`diseno-fase1.md`](diseno-fase1.md).

## Qué hace hoy

Un IIFE recalcula todo en cada `input`. Inputs por defecto: `costo` 37.500, `flete` 20.000,
`devcosto` 20.000, `entrega` 75 %, `cierre` 20 %, `utilidad` 40.000, `costoConv` 4.000,
`presupuesto` 20.000. Dos modos: **precio automático** (fijás la utilidad deseada → sale el
precio) y **precio manual** (fijás el precio → sale la utilidad).

### Fórmulas actuales

Notación: `C` costo unitario, `F` flete, `D` costo por devolución, `t` entrega, `k` cierre,
`cc` costo por conversación, `n` unidades.

```
colchón(D,t)  = ((1 - t) / t) * D
Utotal(n)     = U * (1 + (n - 1) * 0.8)                      // d = 0.20 hardcodeado
Precio(n)     = redondear(C*n + F + colchón + Utotal(n))     // redondear: round(v/1000)*1000 - 100

bruto          = precio - C*n - F - 0                        // comisión = 0 hardcodeada
netoPorPedido  = t * bruto - (1 - t) * D
netoPorVenta   = netoPorPedido / t
pautaPorVenta  = cc / (k * t)                                // = CAC, pero no se nombra
utilidadFinal  = netoPorVenta - pautaPorVenta

tope           = netoPorPedido(combo 1) * k                  // "máximo por conversación"
```

Verificación de consistencia: sustituyendo `Precio(n)` en `netoPorVenta` da exactamente
`Utotal(n)`. **El colchón que se suma en el precio se cancela con el lastre de devoluciones que
se resta en la rentabilidad — no hay doble conteo.** El álgebra es consistente; el problema es
que faltan costos y hay supuestos clavados.

## Problemas

| # | Severidad | Hallazgo |
|---|---|---|
| P1 | crítico | `costo por devolución` (`D`) es un solo número plano: no incluye flete de ida (que se paga aunque el pedido rebote), ni fee de devolución, ni pérdida de producto, y no escala con `n`. Tal como lo llenaría el usuario, subestima la economía real ~2× en el margen. |
| P2 | crítico | `comisión de recaudo = 0` hardcodeada (línea 306). Muchas cuentas COD cobran % + fijo sobre lo recaudado. |
| P3 | crítico | No hay costos fijos / overhead. Solo calcula contribución por unidad, no punto de equilibrio del negocio. |
| P4 | alto | «Mejor margen» = `argmax(utilidadFinal)`; en modo automático siempre gana el combo de 3 por construcción (`Utotal` crece con `n`). No es una recomendación real. |
| P5 | alto | La devolución de un combo de 3 se cuenta igual que la de 1 (no escala el producto en riesgo). |
| P6 | alto | Tres «utilidades» (`netoPorPedido`, `netoPorVenta`, `utilidadFinal`) sin glosario ni denominador visible. |
| P7 | alto | El break-even usa solo el combo de 1 (`datos[0]`); ignora la mezcla de ventas. |
| P8 | medio | Modo manual no llama `renderDesglose` (desglose obsoleto/vacío) y sobrescribe el precio al alternar pestañas. |
| P9 | medio | `redondear` = `round(v/1000)*1000 - 100`: no es conservador (puede subir el precio hasta +400 o bajarlo -100), valores chicos colapsan a 0, y siempre regala ~100 de margen. |
| P10 | medio | Sin guardas para inputs patológicos: `D = 0` hace ver la COD sin riesgo; `entrega`/`cierre` = 1 % disparan el precio a millones en silencio; `p1 = 0` da `NaN%`. |
| P11 | medio | El semáforo llama «%» a un margen sobre ingreso sin decirlo; «chats por venta» es en realidad por pedido. |
| P12 | medio | Costos no contemplados: empaque, fee de dropshipping, costo de atender la conversación, impuestos, chargebacks, costo financiero, flete que escala por peso. |
| P13 | bajo | Código muerto (`mult`, el parámetro `precio` de `renderDesglose`); colores como literales; tokens `:root` mal nombrados. |
| P14 | bajo | Marca «InnovatecJDSM» desactualizada (hoy JDSMPlus). |

## Supuestos ocultos a volver configuración

| Valor | Qué es |
|---|---|
| `d = 0.20` (línea 297) | Cesión de utilidad por unidad extra del combo |
| `comisión = 0` (línea 306) | Comisión de recaudo COD |
| `round(v/1000)*1000 - 100` (línea 280) | Granularidad y terminación del redondeo |
| Umbrales `30/20/10/0` (semáforo) | Clasificación de margen |
| `[10,15,20,25,30]` (línea 437) | Filas de la tabla de sensibilidad de cierre |
| `* 30` (línea 428) | Días por mes |
| `datos[0]` (línea 405) | Break-even solo con el combo de 1 |
| Flete no se resta en pedidos fallidos | Supuesto: `D` ya incluye todo el costo del fallo |
| Producto no se pierde en devolución | Supuesto: vuelve 100 % revendible |
| (ausente) | Costo de atender la conversación; costos fijos |

## Lógica de contraentrega — coherente en el álgebra, pobre en los insumos

Las dos cadenas están bien planteadas:

```
devoluciones por venta = (1 - t) / t
costo esperado / venta = ((1 - t) / t) * D
CAC                    = cc / (k * t)            // pauta por pedido, dividida entre la tasa de entrega
```

El defecto es que `D` es una caja negra. Debe descomponerse:

```
costoPedidoFallido(n) = fleteIda + fleteDevolucion + feeDevolucion + pctProductoPerdido * C * n
```

## Fórmulas: actual → corregida

| # | Actual | Corregida |
|---|---|---|
| C.1 | `costo_fallido = D` | `costoPedidoFallido(n) = fleteIda + fleteDevolucion + feeDevolucion + pctProductoPerdido * C * n` |
| C.2 | `colchón = ((1-t)/t) * D` | `colchón(n) = ((1-t)/t) * costoPedidoFallido(n)` |
| C.3 | `bruto = precio - C*n - F - 0` | `bruto = precio - cogs(n) - fleteIda - comisionRecaudo(precio) - empaque` |
| C.4 | `netoPorPedido = t*bruto - (1-t)*D` | `utilidadPorPedido = t*bruto - (1-t)*costoPedidoFallido(n)`; `/t` para la venta entregada |
| C.5 | `pautaPorVenta = cc/(k*t)` (sin nombre) | `CAC = (cc + costoAtencionConversacion) / (k*t)` |
| C.6 | `utilidadFinal = netoPorVenta - pautaPorVenta` | `utilidadFinal = utilidadPorVentaEntregada - CAC`; y `utilidadNegocio/día` con fijos restados |
| C.7 | `redondear(C*n + F + colchón + U*(1+0.8(n-1)))` | despejar la comisión: `precio = (base + Utotal(n)) / (1 - comisionRecaudoPct)`, redondeo hacia arriba |
| C.8 | `tope = netoPorPedido(1) * k` (solo combo 1) | seis puntos de equilibrio en forma cerrada, ponderados por la mezcla |
| C.9 | `ventasDia = convDia*k` etiquetado «Ventas al día» | `pedidosDia` vs `ventasEntregadasDia` nombrados; proyección con fijos |

Identidad que el motor testea: `precio - costoTotalPorVenta(n, precio) == utilidadFinal(n, precio)`.
