/** Carte d’un compte artiste, distincte des pochettes carrées de projets. */
import type { MusicArtist } from "../types/projects";
import { openMusic } from "../services/music-navigation";
/** Ouvre le profil musical public du compte. */
export default function ArtistCard({
  artist,
}: {
  /** Identité publique actuelle. */ artist: MusicArtist;
}) {
  return (
    <button
      data-scroll-anchor={artist.userId}
      className="music-card artist-card"
      onClick={() => openMusic("artists", artist.userId)}
    >
      {artist.avatarUrl ? (
        <img src={artist.avatarUrl} alt="" />
      ) : (
        <span className="artist-avatar-fallback">
          {artist.displayName.slice(0, 1)}
        </span>
      )}
      <strong>{artist.displayName}</strong>
      <span>@{artist.username}</span>
    </button>
  );
}
