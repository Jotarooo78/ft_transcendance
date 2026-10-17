/** Données d’un projet : aucune dépendance HTTP ni accès à la base. */
import { DomainError } from '@ft/service-kit'
/** Types proposés par le formulaire ; compilation reste lisible dans les anciennes sorties. */
export type ProjectType = 'single' | 'album' | 'mixtape' | 'ep'
/** Un audio prêt, avec son titre éditable et sa position portée par le tableau. */
export type ProjectTrackInput = {
  /** UUID Media ; sert également d’identité stable au morceau. */
  audioAssetId: string
  /** Titre prérempli depuis le fichier. */
  title: string
}
/** Corps complet d’une sauvegarde ; la version zéro crée un projet. */
export type ProjectInput = {
  /** Nom affiché, avec une valeur par défaut si vide. */
  title: string
  /** Type choisi, sans déduction depuis le nombre de pistes. */
  releaseType: ProjectType
  /** Texte libre facultatif. */
  description: string
  /** Audio dont la variante artwork fournit la pochette commune, ou null. */
  coverAssetId: string | null
  /** Ordre demandé des morceaux. */
  tracks: ProjectTrackInput[]
  /** Version lue avant modification. */
  expectedVersion: number
}
/** Nettoie les textes et refuse les doublons ; les types sont validés par la route. */
export function cleanProject(input: ProjectInput): ProjectInput {
  const title = input.title.trim() || 'Untitled project'
  const description = input.description.trim()
  const tracks = input.tracks.map((t) => ({
    audioAssetId: t.audioAssetId.toLowerCase(),
    title: t.title.trim() || 'Untitled track',
  }))
  if (
    [...title].length > 200 ||
    [...description].length > 5000 ||
    tracks.some((t) => [...t.title].length > 200) ||
    new Set(tracks.map((t) => t.audioAssetId)).size !== tracks.length ||
    (input.releaseType === 'single' && tracks.length > 1) ||
    (input.coverAssetId &&
      !tracks.some((t) => t.audioAssetId === input.coverAssetId?.toLowerCase()))
  )
    throw new DomainError(400, 'invalid_project')
  return {
    ...input,
    title,
    description,
    tracks,
    coverAssetId: input.coverAssetId?.toLowerCase() ?? null,
  }
}
