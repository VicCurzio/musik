/**
 * WMA to WAV transcoder using ffmpeg.wasm (lazy-loaded).
 * Only loads the heavy ffmpeg library when a WMA file is actually encountered.
 */

let ffmpegInstance = null;
let loadingPromise = null;

/**
 * Check if a file is a WMA audio file.
 * @param {File} file
 * @returns {boolean}
 */
export function isWmaFile(file) {
  return (
    file.name.toLowerCase().endsWith('.wma') ||
    file.type === 'audio/x-ms-wma'
  );
}

/**
 * Lazy-load ffmpeg.wasm. Only loads once and reuses the instance.
 * @param {function} [onProgress] - Optional progress callback (0-100)
 * @returns {Promise<import('@ffmpeg/ffmpeg').FFmpeg>}
 */
async function loadFFmpeg(onProgress) {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { toBlobURL } = await import('@ffmpeg/util');

    const ffmpeg = new FFmpeg();

    if (onProgress) {
      ffmpeg.on('progress', ({ progress }) => {
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

/**
 * Transcode a WMA file to WAV format.
 * @param {File} file - The WMA file to transcode
 * @param {function} [onProgress] - Optional progress callback (0-100)
 * @returns {Promise<Blob>} WAV blob
 */
export async function transcodeWma(file, onProgress) {
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

  const outputData = await ffmpeg.readFile('output.wav');
  const wavBlob = new Blob([outputData.buffer], { type: 'audio/wav' });

  // Clean up virtual filesystem
  await ffmpeg.deleteFile('input.wma');
  await ffmpeg.deleteFile('output.wav');

  return wavBlob;
}
