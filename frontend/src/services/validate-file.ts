/** Prévalidation bornée dans le navigateur ; l’autorité finale reste le décodage complet du serveur. */
import { audioByteLimit, imageByteLimit } from "../types/files";

/**
 * Lit largeur et hauteur PNG/JPEG/WebP depuis le préfixe du fichier sans allouer les pixels ; renvoie
 * null si les dimensions ne peuvent être identifiées.
 */
function imageDimensions(
  bytes: Uint8Array,
  format: string,
): [number, number] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (format === "png" && bytes.length >= 24)
    return [view.getUint32(16), view.getUint32(20)];
  if (format === "jpeg") {
    for (let offset = 2; offset + 9 < bytes.length; ) {
      if (bytes[offset++] !== 255) return null;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === undefined || offset + 2 > bytes.length) return null;
      const size = view.getUint16(offset);
      if (size < 2 || offset + size > bytes.length) return null;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker)
      )
        return [view.getUint16(offset + 5), view.getUint16(offset + 3)];
      offset += size;
    }
  }
  if (format === "webp" && bytes.length >= 30) {
    const kind = new TextDecoder().decode(bytes.subarray(12, 16));
    if (kind === "VP8X")
      return [
        1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
        1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
      ];
    if (kind === "VP8L" && bytes[20] === 47) {
      const bits = view.getUint32(21, true);
      return [1 + (bits & 16383), 1 + ((bits >>> 14) & 16383)];
    }
    if (
      kind === "VP8 " &&
      bytes[23] === 157 &&
      bytes[24] === 1 &&
      bytes[25] === 42
    )
      return [
        view.getUint16(26, true) & 16383,
        view.getUint16(28, true) & 16383,
      ];
  }
  return null;
}

/**
 * Essaie de charger une image ou les métadonnées audio via une URL Blob temporaire, puis libère l’URL.
 * Une image indécodable est refusée ; un codec audio non pris en charge localement reste éligible au
 * serveur.
 */
async function decodeLocally(file: File, image: boolean, signal: AbortSignal) {
  const url = URL.createObjectURL(file);
  const media = image ? new Image() : new Audio();
  try {
    await new Promise<void>((resolve, reject) => {
      /** Termine la prévalidation locale avec une erreur d’annulation. */
      const abort = () => finish(new Error("File check cancelled."));
      /**
       * Retire délai et écouteurs du média puis confirme ou rejette la prévalidation une seule fois par
       * événement reçu.
       */
      const finish = (error?: Error) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        media.onload = null;
        media.onloadedmetadata = null;
        media.onerror = null;
        if (error) reject(error);
        else resolve();
      };
      const timer = window.setTimeout(
        () =>
          finish(
            image
              ? new Error("The image could not be decoded in time.")
              : undefined,
          ),
        5000,
      );
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) return abort();
      media.onerror = () =>
        finish(image ? new Error("The image content is invalid.") : undefined);
      if (image) media.onload = () => finish();
      else {
        (media as HTMLAudioElement).preload = "metadata";
        media.onloadedmetadata = () => finish();
      }
      media.src = url;
    });
    if (image) {
      const { naturalWidth: width, naturalHeight: height } =
        media as HTMLImageElement;
      if (
        !width ||
        !height ||
        width > 8192 ||
        height > 8192 ||
        width * height > 25_000_000
      )
        throw new Error("The image exceeds the allowed dimensions.");
    }
  } finally {
    media.removeAttribute("src");
    if (!image) (media as HTMLAudioElement).load();
    URL.revokeObjectURL(url);
  }
}

/**
 * Vérifie fichier non vide, taille, signature et MIME sur au plus 1 MiB de préfixe. Contrôle les
 * dimensions avant décodage image, refuse les faux audios textuels et les WAV tronqués, puis laisse le
 * serveur décider des codecs audio.
 * @param file Fichier sélectionné, conservé intact.
 * @param signal Annulation par changement de sélection, de session ou fermeture.
 * @throws Error avec message utilisable dans le formulaire pour une prévalidation refusée.
 */
export async function validateFile(file: File, signal: AbortSignal) {
  if (!file.size) throw new Error("The file is empty.");
  if (file.size > audioByteLimit)
    throw new Error("The audio file must not exceed 500 MB.");
  const bytes = new Uint8Array(await file.slice(0, 1_048_576).arrayBuffer());
  if (signal.aborted) throw new Error("File check cancelled.");
  const text = new TextDecoder("latin1").decode(bytes.subarray(0, 64));
  const format =
    bytes[0] === 137 && text.slice(1, 4) === "PNG"
      ? "png"
      : bytes[0] === 255 && bytes[1] === 216
        ? "jpeg"
        : text.startsWith("RIFF") && text.slice(8, 12) === "WEBP"
          ? "webp"
          : null;
  if (format) {
    if (file.size > imageByteLimit)
      throw new Error("The image must not exceed 25 MB.");
    if (
      file.type &&
      file.type !== "application/octet-stream" &&
      file.type !== `image/${format}`
    )
      throw new Error(
        "The declared file type does not match the image content.",
      );
    const dimensions = imageDimensions(bytes, format);
    if (!dimensions)
      throw new Error("The dimensions of this image could not be verified.");
    const [width, height] = dimensions;
    if (
      !width ||
      !height ||
      width > 8192 ||
      height > 8192 ||
      width * height > 25_000_000
    )
      throw new Error(
        "The image exceeds 8,192 pixels per side or 25 million pixels.",
      );
    await decodeLocally(file, true, signal);
    return;
  }
  if (
    file.type.startsWith("image/") ||
    (file.type &&
      !file.type.startsWith("audio/") &&
      file.type !== "application/octet-stream")
  )
    throw new Error("Choose an audio file or a PNG, JPEG, or WebP image.");
  if (
    /^\s*(<|#EXTM3U|ffconcat)/i.test(text) ||
    (bytes.length > 0 &&
      bytes.every(
        (byte) =>
          byte === 9 ||
          byte === 10 ||
          byte === 13 ||
          (byte >= 32 && byte <= 126),
      ))
  )
    throw new Error("The content is not a usable audio file.");
  if (
    text.startsWith("RIFF") &&
    text.slice(8, 12) === "WAVE" &&
    bytes.length >= 12
  ) {
    if (new DataView(bytes.buffer).getUint32(4, true) + 8 > file.size)
      throw new Error("The audio file is truncated.");
  }
  // Unsupported local codecs remain eligible for authoritative server decoding.
  await decodeLocally(file, false, signal);
}
