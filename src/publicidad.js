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
