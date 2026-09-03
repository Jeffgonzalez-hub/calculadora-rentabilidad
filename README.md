# calculadora-rentabilidad

Motor de pricing y rentabilidad para e-commerce **contraentrega (COD) en Colombia**.

Dado un producto y unos supuestos de operación (flete, devoluciones, comisión de recaudo,
tasa de entrega, tasa de cierre, costo por conversación, costos fijos), calcula en una sola
pasada: precio sugerido por combo (1/2/3 unidades), costo real, utilidad en sus tres
denominadores, margen, markup, CAC, ROAS, descuento máximo, los seis puntos de equilibrio y
los escenarios «¿qué pasa si?».

Es la reescritura del motor de una calculadora HTML previa (`calculadora-precios.html`), con
las fórmulas corregidas — ver [`docs/auditoria-calculadora-actual.md`](docs/auditoria-calculadora-actual.md).

## Estado

| Fase | Qué | Estado |
|---|---|---|
| **1** | Motor puro: `analizar(entrada) → Resultado`, funciones puras, `node --test` | en diseño → implementación |
| 2 | UI web (evolución del HTML) + despliegue | completa |
| 3 | Integración con el CRM de ventas: adaptador que arma `entrada` desde el catálogo y las métricas reales | pendiente |

## UI web (Fase 2)

Interfaz de dos paneles sobre el motor. Sin build: `index.html` importa `ui/app.js`, que importa
`ui/adapter.js` (puro, sin DOM — mapea `form`↔`entrada` y `Resultado`↔`vista`), que importa
`src/index.js`. Los renderers (`ui/render.js`, `ui/graficos.js`) solo conocen la `vista`.

Previsualizar local:

    npm run dev        # http://localhost:5173

Despliegue previsto: Cloudflare Pages en `calculadora.jdsmplus.co` (sin build; output dir = raíz).

## Diseño

Especificación completa en [`docs/diseno-fase1.md`](docs/diseno-fase1.md): contrato,
forma de `entrada` y `Resultado`, módulos, todas las fórmulas con sus identidades, puntos de
equilibrio, escenarios, validación y plan de tests.

## Uso (cuando exista el motor)

```js
import { analizar } from 'calculadora-rentabilidad';

const resultado = analizar({
  producto:  { costoUnitario: 37500, precioBase: null, escaleraPrecios: [] },
  supuestos: { fleteIda: 20000, fleteDevolucion: 20000, /* ... */ },
  mercado:   { tasaEntrega: 0.75, tasaCierre: 0.20, costoConversacion: 4000 },
  objetivo:  { modo: 'sugerir', utilidadObjetivo: 40000 },
});
// resultado.combos, resultado.equilibrio, resultado.avisos

// Los escenarios «¿qué pasa si?» NO se calculan por defecto (resultado.escenarios === null):
// son ~90 llamadas internas a analizar(). Se piden explícitamente:
const conEscenarios = analizar(entrada, { conEscenarios: true }); // .escenarios poblado
```

Un frontend que llama `analizar` en cada tecla debe usar el default (sin escenarios) y pedir
`{ conEscenarios: true }` solo cuando pinte el panel de escenarios.

## Principios

- **Cero dependencias.** Solo Node ≥ 22.5. Los tests no cargan `.env`.
- **`analizar` es pura y total:** no lee entorno, disco ni red; un input inválido produce un
  aviso en `resultado.avisos`, nunca una excepción.
- **Portable:** el motor no importa de ningún otro proyecto. La única dirección de dependencia
  futura permitida es *CRM → este motor*, nunca al revés.
- Plata: entero COP. Identificadores y comentarios en español.

## Despliegue previsto

La UI final (Fase 2) es estática y autocontenida. Destino previsto: **Cloudflare Pages** en
`calculadora.jdsmplus.co` (el DNS de `jdsmplus.co` ya está en Cloudflare). Decisión final
cuando exista la UI; el motor sin dependencias se puede servir tanto desde una página estática
como desde una pantalla del panel del CRM.

## Relación con el CRM de ventas

Proyecto separado a propósito: el CRM (`asistente-ventas-crm`) está desplegado y estable, y
esta calculadora tiene su propio ritmo. En la Fase 3, el CRM consumirá **solo el motor** (por
`file:`, git o copia — se decide entonces) y un adaptador leerá el costo del catálogo y las
tasas reales de `orders` / `metrics`.
