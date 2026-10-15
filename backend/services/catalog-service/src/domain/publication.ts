/** Validation des données éditables de publication. */
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Informations éditables ; l’identité et la durée proviennent exclusivement des services responsables. */
export type TrackPublication = {
  /** Audio déjà reçu par Media, également utilisé comme identifiant stable de la publication. */
  audioAssetId: string
  /** Titre nettoyé, de 1 à 200 caractères. */
  title: string
  /** Texte facultatif, de 0 à 5 000 caractères. */
  description: string
}
/** Refuse les champs d’identité injectés et les valeurs hors limites avant toute réservation. */
export function parsePublication(body: unknown): TrackPublication | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const b = body as Record<string, unknown>
  if (
    Object.keys(b).some((key) => !['audioAssetId', 'title', 'description'].includes(key)) ||
    typeof b.audioAssetId !== 'string' ||
    !uuidPattern.test(b.audioAssetId) ||
    typeof b.title !== 'string' ||
    !b.title.trim() ||
    [...b.title.trim()].length > 200 ||
    typeof b.description !== 'string' ||
    [...b.description].length > 5000
  )
    return null
  return {
    audioAssetId: b.audioAssetId.toLowerCase(),
    title: b.title.trim(),
    description: b.description.trim(),
  }
}
