/**
 * Ayudantes para hablar con el DOM sin repetir la misma comprobación en cada
 * línea.
 *
 * TypeScript obliga a contemplar que `querySelector` devuelva null, y tiene
 * razón: un selector que no encuentra nada es un error silencioso hasta que
 * alguien toca el botón. Pero hay dos situaciones distintas y conviene que se
 * distingan al leer:
 *
 * - El elemento **tiene** que estar, porque lo acabamos de escribir nosotros en
 *   el `innerHTML` de al lado. Si no está, el markup y el código se
 *   desincronizaron: `qs` corta con un error que dice qué selector falló, en
 *   vez del "cannot read properties of null" que aparecía antes.
 * - El elemento **puede** no estar (la pantalla todavía no se montó, el usuario
 *   navegó a otra). Ahí va `qsOrNull` y quien llama decide.
 */

/** Busca un elemento que tiene que existir. Si no está, es un error del markup. */
export function qs<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) {
    throw new Error(`No se encontró "${selector}" — el markup y el código no coinciden.`);
  }
  return el;
}

/** Busca un elemento que puede no estar. */
export function qsOrNull<T extends Element = HTMLElement>(
  root: ParentNode,
  selector: string
): T | null {
  return root.querySelector<T>(selector);
}

/** Todos los que coincidan, como array. */
export function qsa<T extends Element = HTMLElement>(root: ParentNode, selector: string): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

/**
 * El ancestro más cercano que coincide, a partir de donde ocurrió un evento.
 *
 * `event.target` es un `EventTarget`, que no tiene `closest`: puede ser el
 * documento o la ventana. Esto lo comprueba una vez, acá.
 */
export function closestFrom<T extends Element = HTMLElement>(
  event: Event,
  selector: string
): T | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  return target.closest<T>(selector);
}
