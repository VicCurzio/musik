# Musik PWA

[![Deploy](https://github.com/VicCurzio/musik/actions/workflows/deploy.yml/badge.svg)](https://github.com/VicCurzio/musik/actions/workflows/deploy.yml)

Reproductor de música progresivo (PWA) rápido, privado y sin anuncios. Lee tus archivos locales (MP3, WAV, FLAC, WMA) directamente en el navegador, sin subirlos a ningún servidor.

**Demo:** https://viccurzio.github.io/musik/ — con `?demo=1` abre con una biblioteca de ejemplo ya cargada:
https://viccurzio.github.io/musik/?demo=1

## Características

- **100% privado:** los archivos nunca salen del dispositivo. Todo el procesamiento es local.
- **Biblioteca persistente:** se guarda en IndexedDB, no hace falta reimportar cada vez que abrís la app.
- **Organización:** carpetas, álbumes, artistas, géneros, favoritos, playlists propias y listas automáticas.
- **Cola editable:** ver qué sigue, reordenar y sacar canciones sin perder lo que suena.
- **Ecualizador:** 5 bandas con interruptor on/off (conviene desactivarlo en iPhone si hay cortes al bloquear la pantalla).
- **Normalización de volumen:** ganancia medida por pista, para que no salte el nivel entre canciones.
- **Letras sincronizadas:** si hay un `.lrc` junto a la canción, se parsea y se sigue en pantalla.
- **Temporizador de apagado** y modo de controles grandes.
- **Formatos:** MP3, WAV, FLAC, OGG, M4A, AAC y WMA (convertido en el navegador con ffmpeg.wasm).
- **PWA:** instalable en Android y escritorio, funciona sin conexión.
- **Segundo plano:** Media Session API, con controles en la pantalla de bloqueo.
- **Integración con el sistema:** "Abrir con Musik" desde el explorador de archivos y compartir canciones a la app.
- **Temas:** oscuro, claro o automático, con cinco colores de acento.

### Biblioteca de ejemplo

Sin archivos propios la app no se puede probar, así que el estado vacío ofrece nueve canciones de ejemplo repartidas en tres álbumes, tres artistas y tres carpetas, más una playlist y dos favoritos.

No se descarga nada: el audio se **sintetiza en el navegador** (osciladores, envolventes ADSR, reverb por copias retrasadas y una percusión sencilla) y las carátulas se dibujan como SVG y se rasterizan a PNG. Son 100% originales, no hay ninguna duda de licencia y el bundle no carga ni un byte de audio. Ver `src/services/demoSynth.ts` y `src/services/demoTracks.ts`.

## Tecnologías utilizadas

- **Vite:** empaquetador.
- **Vite PWA Plugin:** generación del service worker y del manifest.
- **Web Audio API:** ecualizador, normalización y fundidos.
- **IndexedDB** (a través de `idb`): biblioteca, playlists, favoritos y ajustes.
- **music-metadata:** carátulas y tags ID3, en un worker para no bloquear la UI.
- **ffmpeg.wasm:** (carga diferida) convierte los WMA que el navegador no sabe reproducir.

## TypeScript

El proyecto está entero en TypeScript, en modo `strict` (más
`noUncheckedIndexedAccess`). La migración se hizo de a un módulo, no de golpe:
`tsconfig.json` mantiene `allowJs` por si vuelve a aparecer un `.js`, pero hoy no
queda ninguno.

Dos cosas que dejó la conversión y conviene respetar:

- **Los imports no llevan extensión.** Vite no resuelve un `./cosa.js` hacia un
  `./cosa.ts`: la importación quedaría apuntando a un archivo que no existe.
- **El DOM se toca a través de `src/utils/dom.ts`.** `qs` para lo que tiene que
  estar (si falta, corta con el selector en el mensaje), `qsOrNull` para lo que
  puede no estar, `qsa` para listas y `closestFrom` para eventos. Es lo que evita
  el "cannot read properties of null" y los `as HTMLElement` desparramados.

## Requisitos

| | |
|---|---|
| Node | 22 o superior (es la versión con la que compila Actions) |
| Base de datos | no usa: la biblioteca vive en IndexedDB, en el navegador |
| Servicios externos | ninguno, no hay variables de entorno |

## Desarrollo local

1. Cloná el repositorio.
2. Instalá las dependencias:
   ```bash
   npm install
   ```
3. Levantá el servidor de desarrollo:
   ```bash
   npm run dev -- --host
   ```
   Nota: la instalación PWA está deshabilitada en modo desarrollo por defecto.

Iconos y social card: `npm run icons` (corre solo dentro de `npm run build`).

## Verificación

```bash
npm test         # vitest: motor de audio, utilidades y features
npm run typecheck  # tsc
npm run test:watch
```

Los tests corren en GitHub Actions en cada push y en cada pull request, y el
despliegue depende de que pasen: si un test se rompe, el sitio publicado no se
toca. Vale la pena que siga siendo así — lo que cubren (el motor de audio, el
parseo de metadata) es justo lo que no se nota roto hasta que alguien reproduce
una canción.

## Despliegue (producción)

Para instalar la app en un teléfono hay que servirla bajo HTTPS.

1. **Vercel** (más fácil): conectá el repositorio y se configura solo (usa `npm run build` y `dist` como directorio de salida).

2. **GitHub Pages** (URL: https://viccurzio.github.io/musik/):

   Si en Actions aparece *"your account is locked due to a billing issue"*, no es un error del código: GitHub bloquea los workflows hasta que se arregle la facturación en [github.com/settings/billing](https://github.com/settings/billing). El workflow `Deploy to GitHub Pages` no va a correr hasta entonces.

   Deploy sin Actions, desde la máquina:
   ```bash
   npm install
   npm run deploy
   ```
   Eso compila y sube `dist` a la rama `gh-pages`. Después, en el repo: **Settings → Pages →** rama **`gh-pages`**, carpeta **`/ (root)`**.

   El workflow verde "pages build and deployment" es otro, de GitHub. Si Pages apunta a `main` publica el código sin compilar y da 404: tiene que ser la rama `gh-pages` con el build.

## Entrega y versiones

Mensajes de commit con [Conventional Commits](https://www.conventionalcommits.org/es/)
(`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`) y versiones semánticas. El
`CHANGELOG.md` es lo que la app muestra en el aviso de novedades, así que se
escribe para quien la usa, no para quien la programa.

```bash
npm run release -- minor --tag   # sube package.json, fecha el CHANGELOG y crea el tag
```

La etiqueta de git es lo que hace verificable "esta es la versión que tenés":
se puede volver a ese punto exacto. Hoy el repo está en `1.3.0` sin ninguna
etiqueta creada — la primera se puede poner con `git tag -a v1.3.0 -m "v1.3.0"`
sobre el commit que corresponda.

## Licencia

Hecho por Victor Roberto Curzio.
