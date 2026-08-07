# Changelog

Todos los cambios de Musik, contados para quien la usa.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/);
las versiones siguen [SemVer](https://semver.org/lang/es/).

Lo que está en `Sin publicar` se muestra recién cuando se corre `npm run release`.

## [Sin publicar]

## [1.3.0] - 2026-08-07

### Agregado

- Volumen parejo entre canciones: Musik mide cada tema al importarlo y compensa las diferencias, así no hay que estar tocando el volumen.
- Letras sincronizadas: si al lado del MP3 hay un archivo `.lrc`, la letra aparece en el reproductor y sigue la canción.
- Carátulas desde la carpeta: si el archivo no trae imagen, se usa la `cover.jpg` o `folder.jpg` que esté junto a las canciones.
- Pestaña Géneros y listas automáticas: más escuchadas, escuchadas hace poco, nunca escuchadas, agregadas este mes y posibles duplicadas.
- Los álbumes se ordenan por número de pista, como fueron pensados, en vez de alfabéticamente.
- "Abrir con Musik" desde el explorador de archivos del teléfono, y compartir canciones a Musik desde otras apps.
- Botón para compartir la canción que está sonando.
- Se retoma la posición en canciones largas (audiolibros y podcasts), no solo en la última que sonó.
- Accesos directos al mantener apretado el ícono: Favoritos y Seguir escuchando.
- Atajos de teclado en la computadora: espacio para pausar, flechas para cambiar y buscar.
- Modo de controles grandes, para usar sin mirar.
- Esta pantalla de novedades: cada actualización cuenta qué cambió.

## [1.2.0] - 2026-08-06

### Agregado

- Eliminar canciones de a una (antes solo se podía vaciar toda la biblioteca).
- Favoritos, con su propia pestaña.
- Temporizador para dormir: la música se apaga sola.
- Cola de reproducción visible, con "reproducir a continuación" y reordenar.
- La app retoma donde había quedado al volver a abrirla.
- Preajustes de ecualizador: Plano, Graves, Voz, Rock, Pop y Noche.
- Tema claro, oscuro o automático, y cinco colores a elección.
- Velocidad de reproducción de 0.75x a 2x.
- Respaldo de listas y favoritos en un archivo, para no perderlos.
- Editar título, artista y álbum de una canción.
- Listas: renombrar, quitar canciones y cambiarles el orden.
- Ordenar la biblioteca por título, artista, álbum o fecha.
- Búsqueda sin acentos y también por álbum.
- Deslizar la carátula para cambiar de canción.

### Cambiado

- La biblioteca ya no pierde el scroll cada vez que se toca play.
- Importar carpetas grandes ya no traba la app.
- El botón atrás del teléfono sale de una carpeta o lista en vez de cerrar la app.
- Los avisos y confirmaciones usan el diseño de la app en lugar de los del navegador.

### Arreglado

- El ecualizador ahora se aplica al instante al activarlo, sin cambiar de canción.
- El sistema ya no puede borrar la biblioteca guardada cuando falta espacio.
- Los títulos con símbolos raros se muestran bien.
- Dos archivos distintos con el mismo nombre dejan de pisarse.

## [1.1.0] - 2026-08-06

### Agregado

- Canciones de ejemplo para probar el reproductor sin importar música propia.

## [1.0.0] - 2026-08-05

### Agregado

- Reproductor de música local: MP3, WAV, FLAC y WMA.
- Biblioteca guardada en el teléfono, sin volver a importar cada vez.
- Carpetas, listas de reproducción y ecualizador de 5 bandas.
- Controles en la pantalla de bloqueo.
- Instalable como app, sin anuncios y sin conexión.
