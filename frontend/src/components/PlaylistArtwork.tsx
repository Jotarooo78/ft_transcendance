/** Pochette commune aux cartes et au détail : image choisie, mosaïque, puis note centrée. */
import { useEffect, useState } from "react";
import type { MusicPlaylist, Track } from "../types/music";
import { useTrackDetails } from "../hooks/useTrackDetails";
import { readPrivateBlob } from "../services/read-files";
import EmptyArtwork from "./EmptyArtwork";
/** Annule les lectures privées et libère les URL locales à chaque changement de pochette. */
export default function PlaylistArtwork({
  playlist,
  owned = false,
  tracks,
}: {
  playlist: MusicPlaylist;
  owned?: boolean;
  tracks?: Record<string, Track | null>;
}) {
  const loaded = useTrackDetails(
    tracks ? [] : playlist.items.slice(0, 16).map((item) => item.trackId),
  );
  const details = tracks ?? loaded.data;
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(
    null,
  );
  const [failed, setFailed] = useState("");
  const asset = playlist.coverAssetId;
  useEffect(() => {
    if (!owned || !asset) return;
    const controller = new AbortController();
    let url: string | undefined;
    void readPrivateBlob(
      `/api/media/assets/${asset}/private-content`,
      ["image/png", "image/jpeg", "image/webp"],
      25_000_000,
      controller.signal,
    )
      .then((blob) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setPreview({ id: asset, url });
      })
      .catch(() => {});
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [asset, owned]);
  const src = asset
    ? owned
      ? preview?.id === asset
        ? preview.url
        : undefined
      : `/api/media/playlists/${playlist.id}/artwork?v=${playlist.version}`
    : undefined;
  const covers = [
    ...new Set(
      playlist.items.flatMap((item) =>
        details?.[item.trackId]?.coverUrl
          ? [details[item.trackId]!.coverUrl!]
          : [],
      ),
    ),
  ].slice(0, 4);
  return (
    <div className="playlist-artwork">
      {src && failed !== src ? (
        <img src={src} alt="" onError={() => setFailed(src)} />
      ) : covers.length ? (
        <div
          className={`playlist-mosaic ${covers.length < 4 ? "single-cover" : ""}`}
        >
          {(covers.length < 4 ? covers.slice(0, 1) : covers).map((url) => (
            <img key={url} src={url} alt="" />
          ))}
        </div>
      ) : (
        <EmptyArtwork className="empty-artwork" />
      )}
    </div>
  );
}
