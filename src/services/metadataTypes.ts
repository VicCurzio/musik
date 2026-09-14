/**
 * El contrato entre el hilo principal y el worker de metadata.
 *
 * Vive en su propio archivo porque lo necesitan los dos lados y ninguno puede
 * importar al otro: el worker corre en otro ámbito. Tenerlo escrito es lo que
 * evita que un lado mande un campo que el otro no lee, que es el error típico
 * de comunicarse por mensajes.
 */

/** Lo que se saca de las etiquetas de un archivo de audio. */
export interface ParsedMeta {
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: number | null;
  trackNo: number | null;
  discNo: number | null;
  /** Segundos. */
  duration: number;
  artworkBlob: Blob | null;
}

/** Lo mismo, más la URL temporal de la carátula, que solo se puede crear en el hilo principal. */
export interface ParsedMetaWithUrl extends ParsedMeta {
  artworkUrl: string | null;
}

export interface WorkerRequest {
  id: number;
  file: File;
}

export interface WorkerResponse {
  id: number;
  meta: ParsedMeta;
  /** Presente cuando hubo que caer al valor por defecto. */
  warning?: string;
}

/** Una carátula tal como la entrega music-metadata. */
interface Picture {
  data: Uint8Array;
  format: string;
}

/**
 * Convierte la carátula que devuelve music-metadata en un Blob.
 *
 * Lo hacen los dos lados (el worker y el hilo principal), así que vive acá una
 * sola vez. El `<ArrayBuffer>` no es decoración: un Uint8Array puede estar
 * respaldado por memoria compartida entre hilos, y un Blob no la acepta. Acá el
 * buffer siempre es propio.
 */
export function artworkToBlob(picture: Picture | undefined): Blob | null {
  if (!picture) return null;
  return new Blob([picture.data as Uint8Array<ArrayBuffer>], { type: picture.format });
}
