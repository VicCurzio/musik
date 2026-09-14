import type { FFmpeg } from '@ffmpeg/ffmpeg';

/**
 * WMA to WAV transcoder using ffmpeg.wasm (lazy-loaded).
 * Only loads the heavy ffmpeg library when a WMA file is actually encountered.
 */

/** Progreso de 0 a 100. */
export type ProgressCallback = (percent: number) => void;

let ffmpegInstance: FFmpeg | null = null;
let loadingPromise: Promise<FFmpeg> | null = null;

/** Check if a file is a WMA audio file. */
export function isWmaFile(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith('.wma') ||
    file.type === 'audio/x-ms-wma'
  );
}

/** Lazy-load ffmpeg.wasm. Only loads once and reuses the instance. */
async function loadFFmpeg(onProgress?: ProgressCallback): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { toBlobURL } = await import('@ffmpeg/util');

    const ffmpeg = new FFmpeg();

    if (onProgress) {
      ffmpeg.on('progress', ({ progress }: { progress: number }) => {
        onProgress(Math.round(progress * 100));
      });
    }

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpeg.load({
      coreURL: await toBlobURL(
        `${baseURL}/ffmpeg-core.js`,
        'text/javascript'
      ),
      wasmURL: await toBlobURL(
        `${baseURL}/ffmpeg-core.wasm`,
        'application/wasm'
      ),
    });

    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return loadingPromise;
}

/** Transcode a WMA file to WAV format. */
export async function transcodeWma(file: File, onProgress?: ProgressCallback): Promise<Blob> {
  const ffmpeg = await loadFFmpeg(onProgress);

  const inputData = new Uint8Array(await file.arrayBuffer());
  await ffmpeg.writeFile('input.wma', inputData);

  await ffmpeg.exec([
    '-i',
    'input.wma',
    '-acodec',
    'pcm_s16le',
    '-ar',
    '44100',
    'output.wav',
  ]);

  // readFile devuelve texto o binario segun como se lo llame; acá siempre es
  // binario, y el tipo lo dice para que nadie lo pase como string sin querer.
  //
  // El `<ArrayBuffer>` no es decoración: un Uint8Array puede estar respaldado
  // por un SharedArrayBuffer (ffmpeg.wasm usa hilos cuando puede) y un Blob no
  // acepta memoria compartida. Acá el buffer siempre es propio.
  const outputData = (await ffmpeg.readFile('output.wav')) as Uint8Array<ArrayBuffer>;
  const wavBlob = new Blob([outputData], { type: 'audio/wav' });

  // Clean up virtual filesystem
  await ffmpeg.deleteFile('input.wma');
  await ffmpeg.deleteFile('output.wav');

  return wavBlob;
}
