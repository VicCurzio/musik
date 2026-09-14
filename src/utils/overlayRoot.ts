/**
 * Dónde se montan overlays, action sheets y toasts.
 *
 * En escritorio la app se dibuja dentro de un marco de teléfono, y ese marco
 * (`#app`) es el bloque contenedor de todo lo que está en `position: fixed`
 * porque tiene `transform`. Si los overlays colgaran de `<body>` se anclarían a
 * los bordes de la ventana: una hoja de acciones subiendo desde el borde
 * inferior del monitor, lejos del teléfono.
 *
 * En móvil `#app` ocupa el viewport entero y no tiene transform, así que el
 * resultado es exactamente el de antes.
 */
export function overlayRoot() {
  return document.getElementById('app') || document.body;
}
