import { translate as t } from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
/** Actions de file communes ; le menu natif reste utilisable au clavier. */
import { useEffect, useRef } from "react";
import { useMusicPlayer } from "../contexts/music-player";
import type { Track } from "../types/music";
import PlayerIcon from "./PlayerIcon";
import { usePlaylistActions } from "../contexts/playlist-actions";
/** Ferme le menu après une action, un clic extérieur ou Échap, sans lancer la ligne. */
export default function TrackQueueActions({
  track,
}: {
  /** Morceau à ajouter comme nouvelle occurrence. */ track: Track;
}) {
  useLanguage();
  const player = useMusicPlayer(),
    menu = useRef<HTMLDetailsElement>(null);
  const addToPlaylist = usePlaylistActions();
  useEffect(() => {
    /** Ferme seulement ce menu lorsqu’un autre élément reçoit le clic. */
    function outside(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !menu.current?.contains(event.target) &&
        menu.current
      )
        menu.current.open = false;
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  /** L’ajout ne modifie pas la sélection source ; la fermeture rend le focus au résumé. */
  function add(next: boolean) {
    player.add(track, next);
    if (menu.current) {
      menu.current.open = false;
      menu.current.querySelector("summary")?.focus();
    }
  }
  return (
    <details
      className="track-queue-actions"
      ref={menu}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          if (menu.current) {
            menu.current.open = false;
            menu.current.querySelector("summary")?.focus();
          }
        }
      }}
    >
      <summary
        aria-label={t("Queue actions for {0}", { "0": track.title })}
        title={t("Queue actions")}
      >
        <PlayerIcon name="more" />
      </summary>
      <div className="track-queue-popover">
        {addToPlaylist && (
          <button
            onClick={() => {
              addToPlaylist([track]);
              if (menu.current) {
                menu.current.open = false;
                menu.current.querySelector("summary")?.focus();
              }
            }}
          >
            {" "}
            {t("Add to playlist")}{" "}
          </button>
        )}
        <button disabled={!track.audioUrl} onClick={() => add(true)}>
          {" "}
          {t("Play next")}{" "}
        </button>
        <button disabled={!track.audioUrl} onClick={() => add(false)}>
          {" "}
          {t("Add to queue")}{" "}
        </button>
      </div>
    </details>
  );
}
