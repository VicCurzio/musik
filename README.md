# Musik PWA

Un reproductor de música progresivo (PWA) rápido, privado y sin anuncios. Construido para leer tus archivos de música locales (MP3, WMA, FLAC, WAV) directamente en el navegador sin subirlos a ningún servidor.

## Características

- 🔒 **100% Privado**: Tus archivos nunca salen de tu dispositivo. Todo el procesamiento se realiza localmente.
- 💾 **Biblioteca persistente (Android)**: Opción para guardar tu música en IndexedDB del teléfono — no hace falta reimportar cada vez que abres la app.
- 📁 **Carpetas**: Importa una carpeta completa y navega por Rock, Cumbia, etc. como en tu almacenamiento.
- 📋 **Mis listas**: Crea playlists personalizadas y añade canciones desde el menú ⋮.
- 🎚️ **Ecualizador**: 5 bandas con interruptor on/off (recomendado desactivar en iPhone si hay cortes al bloquear).
- 🎵 **Soporte Amplio**: MP3, WAV, FLAC y WMA (transcodificación local con ffmpeg.wasm).
- 📱 **PWA**: Instalable en Android y escritorio.
- ⏯️ **Segundo plano**: Media Session API — controles en pantalla de bloqueo.
- 🎨 **Diseño moderno**: Interfaz oscura, glassmorphism, responsiva.

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

2. **GitHub Pages** (URL: **https://viccurzio.github.io/musik/**):

   **Si en Actions ves:** *"your account is locked due to a billing issue"*  
   → No es un error del código. GitHub **bloquea tus workflows** hasta que arregles la facturación en [github.com/settings/billing](https://github.com/settings/billing). El workflow `Deploy to GitHub Pages` no va a correr hasta entonces.

   **Deploy sin Actions (desde tu PC):**
   ```bash
   npm install
   npm run deploy
   ```
   Eso compila y sube `dist` a la rama `gh-pages`. Luego en el repo: **Settings → Pages →** rama **`gh-pages`**, carpeta **`/ (root)`**.

   El workflow verde **"pages build and deployment"** es otro (de GitHub). Si Pages apunta a `main`, publica el código fuente sin compilar → 404. Tiene que ser rama **`gh-pages`** con el build.

## Licencia
Hecho con ♥ por Victor Roberto Curzio.
