/** Adresses stables des contenus musicaux ; les identités sont encodées dans le fragment d’URL. */
/** Ouvre un objet sans recharger l’application ni interrompre le lecteur. */
export function openMusic(
  kind: "projects" | "artists" | "playlists",
  id: string,
) {
  window.location.hash = `/${kind}/${encodeURIComponent(id)}`;
}
/** Lit seulement les routes reconnues avec une identité UUID. */
export function readMusicRoute() {
  const match = /^#\/(projects|artists|playlists)\/([a-f0-9-]{36})$/i.exec(
    window.location.hash,
  );
  return match
    ? {
        kind: match[1] as "projects" | "artists" | "playlists",
        id: match[2].toLowerCase(),
      }
    : null;
}
