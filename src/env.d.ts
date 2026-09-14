/// <reference types="vite/client" />

/**
 * Lo que existe en tiempo de ejecución pero no viene de un import.
 *
 * Al tener un `export`, este archivo es un módulo: todo lo que tenga que ser
 * global va adentro de `declare global`. Declararlo afuera lo dejaría visible
 * solo acá, que es justo lo contrario de lo que se busca.
 */
declare global {
  /**
   * La versión se inyecta en el build desde package.json (ver vite.config.js).
   * Declararla es lo que permite usarla desde TypeScript sin castear.
   */
  const __APP_VERSION__: string;

  interface Window {
    /**
     * Navegación entre pantallas, colgada de `window` para que los componentes
     * no tengan que importar el router (y el router no dependa de los
     * componentes). La asigna `main.ts`.
     */
    __musikNavigate: (
      view: string,
      params?: Array<string | undefined>,
      options?: { replace?: boolean }
    ) => void;
  }
}

export {};
