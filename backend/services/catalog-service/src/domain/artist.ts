/** Lecture de l’identité publique auprès de Users, source unique des noms et avatars. */
/** Profil minimal affiché comme artiste et consultable depuis un morceau. */
export type ArtistProfile = {
  /** Compte auquel reste attaché le morceau, même après renommage. */
  userId: string
  /** Nom public actuel. */
  displayName: string
  /** Nom unique actuel du compte. */
  username: string
  /** Image publique facultative du profil. */
  avatarUrl: string | null
  /** Présentation facultative. */
  bio?: string | null
}
/** Contrôle les réponses Users avant de les utiliser pour une attribution. */
export function isArtistProfile(value: unknown): value is ArtistProfile {
  const p = value as ArtistProfile | null
  return (
    !!p &&
    typeof p.userId === 'string' &&
    /^[a-f0-9-]{36}$/i.test(p.userId) &&
    typeof p.displayName === 'string' &&
    typeof p.username === 'string' &&
    (p.avatarUrl === null || typeof p.avatarUrl === 'string')
  )
}
