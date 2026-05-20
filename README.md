# Musik PWA

Un reproductor de música progresivo (PWA) rápido, privado y sin anuncios. Construido para leer tus archivos de música locales (MP3, WMA, FLAC, WAV) directamente en el navegador sin subirlos a ningún servidor.

## Características

- 🔒 **100% Privado**: Tus archivos nunca salen de tu dispositivo. Todo el procesamiento se realiza localmente en la memoria del navegador.
- 🎵 **Soporte Amplio**: Reproduce de forma nativa MP3 y WAV. Incluye soporte al vuelo para archivos WMA mediante transcodificación local (usando ffmpeg.wasm).
- 📱 **Progressive Web App (PWA)**: Instalable en dispositivos móviles (Android/iOS) y de escritorio.
- ⏯️ **Reproducción en Segundo Plano**: Soporte completo para Media Session API, permitiendo controles desde la pantalla de bloqueo o auriculares.
- 🎨 **Diseño Moderno**: Interfaz oscura con efecto de cristal (glassmorphism), animaciones fluidas y completamente responsiva.

## Tecnologías Utilizadas

- **Vite**: Empaquetador extremadamente rápido.
- **Vite PWA Plugin**: Generación de Service Workers y Manifest automático.
- **Music-Metadata**: Para la extracción de carátulas e información ID3 de las canciones.
- **Ffmpeg.wasm**: (Carga diferida) Para transcodificar archivos WMA incompatibles en el navegador.

## Desarrollo Local

1. Clona el repositorio.
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. Inicia el servidor de desarrollo:
   ```bash
   npm run dev -- --host
   ```
   *Nota: La instalación PWA está deshabilitada en modo desarrollo por defecto.*

## Despliegue (Producción)

Para instalar la aplicación en un teléfono, **debes servirla bajo HTTPS**. 
Si vas a subir este código a GitHub para publicarlo usando [GitHub Pages](https://pages.github.com/) o [Vercel](https://vercel.com/):

1. **Vercel** (Recomendado, más fácil):
   Simplemente conecta tu repositorio de GitHub a Vercel y se configurará automáticamente (usa `npm run build` como comando de construcción y `dist` como directorio de salida).

2. **GitHub Pages**:
   Si tu repositorio se llama `musik`, asegúrate de agregar `base: '/musik/'` en tu archivo `vite.config.js` antes de compilar. Luego ejecuta:
   ```bash
   npm run build
   ```
   Y sube la carpeta `dist` a la rama `gh-pages`.

## Licencia
Hecho con ♥ por Victor Roberto Curzio.
