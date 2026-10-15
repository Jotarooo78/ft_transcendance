/** Adresses stables des contenus musicaux ; les identités sont encodées dans le fragment d’URL. */
/** Ouvre un objet sans recharger l’application ni interrompre le lecteur. */
export function openMusic(
  kind: "projects" | "artists" | "playlists" | "library",
  id: string,
) {
  window.location.hash = `/${kind}/${encodeURIComponent(id)}`;
}
/** Lit seulement les routes reconnues avec une identité UUID. */
export function readMusicRoute() {
  const library =
    /^#\/library\/(track|project|artist|owned|playlist|uploads|history)(?:%2F|\/)?([a-f0-9-]{36})?$/i.exec(
      window.location.hash,
    );
  if (library)
    return {
      kind: "library" as const,
      id: library[1] + (library[2] ? `/${library[2].toLowerCase()}` : ""),
    };
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
