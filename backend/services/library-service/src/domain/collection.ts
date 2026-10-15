/** @brief Actions personnelles indépendantes de la publication et des amitiés. */
export type CollectionKind = 'track' | 'project' | 'artist' | 'playlist'
/** @brief Référence personnelle ; les détails sont relus dans le service propriétaire. */
export type CollectionItem = { id: string; createdAt: string }
