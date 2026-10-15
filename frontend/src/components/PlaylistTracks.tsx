import { translate as t, translateError } from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
import RefreshNotice from "./RefreshNotice";
import { useRef, useState } from "react";
import { playlistView, type PlaylistSort } from "../services/playlist-view";
import { useTrackDetails } from "../hooks/useTrackDetails";
import type { MusicPlaylist } from "../types/music";
import MusicTrackRow from "./MusicTrackRow";
import { useMusicPlayer } from "../contexts/music-player";
/** Conserve les occurrences et leur ordre ; le retrait n'est disponible qu'au propriétaire. */
export default function PlaylistTracks({
  playlist,
  onRemove,
  onReorder,
  trackDetails,
}: {
  playlist: MusicPlaylist;
  onRemove?: (
    playlist: MusicPlaylist,
    itemId: string,
  ) => Promise<MusicPlaylist>;
  /** Enregistre une permutation des occurrences sans changer leurs dates ni identités. */
  onReorder?: (ids: string[]) => Promise<void>;
  /** Réutilise les lectures de l'en-tête lorsqu'elles existent déjà. */
  trackDetails?: ReturnType<typeof useTrackDetails>;
}) {
  useLanguage();
  const player = useMusicPlayer();
  const loaded = useTrackDetails(
    trackDetails ? [] : playlist.items.map((item) => item.trackId),
  );
  const details = trackDetails ?? loaded;
  const [removing, setRemoving] = useState(false),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState<PlaylistSort>("manual");
  const [hidden, setHidden] = useState<string | null>(null);
  const [failedRemoval, setFailedRemoval] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null),
    [moving, setMoving] = useState(false);
  const droppedAt = useRef(0);
  const view = playlistView(playlist, details.data ?? {}, sort, query);
  const canReorder =
    !!onReorder && sort === "manual" && !query.trim() && !moving && !removing;
  const available = view.ordered.flatMap(({ item, track }) => {
    return track ? [{ item, track }] : [];
  });
  const queue = available.map(({ track }) => track),
    ids = available.map(({ item }) => item.id);
  /** Retire l'occurrence seulement après confirmation ; une panne reste visible. */
  async function remove(itemId: string) {
    if (removing || !onRemove) return;
    setRemoving(true);
    setHidden(itemId);
    setError("");
    setFailedRemoval(null);
    try {
      await onRemove(playlist, itemId);
    } catch (reason) {
      setFailedRemoval(itemId);
      setError(
        reason instanceof Error ? reason.message : "Unable to remove track.",
      );
    } finally {
      setRemoving(false);
      setHidden(null);
    }
  }
  /** Envoie l'ordre complet ; un refus laisse l'ordre serveur intact et rend l'erreur visible. */
  async function move(source: string, target: string) {
    if (!canReorder || source === target || !onReorder) return;
    const ids = playlist.items.map((item) => item.id);
    const from = ids.indexOf(source),
      to = ids.indexOf(target);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, source);
    setMoving(true);
    setError("");
    try {
      await onReorder(ids);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to reorder playlist.",
      );
    } finally {
      setMoving(false);
      setDragging(null);
    }
  }
  return (
    <>
      <RefreshNotice
        retained={!!details.data}
        error={details.error ?? details.refreshError}
        retry={details.reload}
      />
      {error && <p role="alert">{translateError(error)}</p>}
      {failedRemoval && (
        <button disabled={removing} onClick={() => void remove(failedRemoval)}>
          {" "}
          {t("Retry removal")}{" "}
        </button>
      )}
      <div className="playlist-toolbar">
        <label>
          {" "}
          {t("Search in playlist")}{" "}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Title or artist")}
          />
        </label>
        <label>
          {" "}
          {t("Track order")}{" "}
          <select
            aria-label={t("Track order")}
            value={sort}
            onChange={(e) => setSort(e.target.value as PlaylistSort)}
          >
            <option value="manual">{t("Custom order")}</option>
            <option value="title">{t("Title")}</option>
            <option value="artist">{t("Artist")}</option>
            <option value="added">{t("Date added")}</option>
          </select>
        </label>
      </div>
      {onReorder && (
        <p className="playlist-hint">
          {" "}
          {t(
            "Drag the handle to arrange tracks in custom order, with search cleared. Keyboard: focus a handle and use Alt + ↑ or ↓.",
          )}{" "}
        </p>
      )}
      {!playlist.items.length && (
        <p>{t("This playlist does not contain any tracks yet.")}</p>
      )}
      {!!queue.length && (
        <div className="music-section-heading">
          <button
            onClick={() =>
              player.play(queue[0], queue, {
                ids,
                index: 0,
                source: playlist.name,
                restart: true,
              })
            }
          >
            {" "}
            {t("Play playlist")}{" "}
          </button>
          <button
            onClick={() => {
              const index = Math.floor(Math.random() * queue.length);
              player.play(queue[index], queue, {
                ids,
                index,
                source: playlist.name,
                shuffle: true,
                restart: true,
              });
            }}
          >
            {" "}
            {t("Shuffle play")}{" "}
          </button>
        </div>
      )}
      <ol className="music-occurrences">
        {view.visible
          .filter(({ item }) => item.id !== hidden)
          .map(({ item, track }, index) => {
            const action = onRemove && (
              <button disabled={removing} onClick={() => void remove(item.id)}>
                {" "}
                {t("Remove track")}{" "}
              </button>
            );
            return (
              <li
                key={item.id}
                data-item-id={item.id}
                className={dragging === item.id ? "playlist-dragging" : ""}
                onDragOver={(event) => {
                  if (canReorder && dragging) event.preventDefault();
                }}
                onDrop={(event) => {
                  if (!canReorder || !dragging) return;
                  event.preventDefault();
                  droppedAt.current = Date.now();
                  void move(dragging, item.id);
                }}
                onClickCapture={(event) => {
                  if (Date.now() - droppedAt.current < 250) {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                }}
              >
                {onReorder && (
                  <button
                    className="playlist-drag-handle"
                    aria-label={t("Reorder {0}", {
                      "0": track?.title ?? t("unavailable track"),
                    })}
                    title={t("Drag, or Alt + arrow keys")}
                    disabled={!canReorder}
                    draggable={canReorder}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", item.id);
                      event.dataTransfer.effectAllowed = "move";
                      setDragging(item.id);
                    }}
                    onDragEnd={() => {
                      droppedAt.current = Date.now();
                      setDragging(null);
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.altKey &&
                        ["ArrowUp", "ArrowDown"].includes(event.key)
                      ) {
                        event.preventDefault();
                        const target =
                          playlist.items[
                            index + (event.key === "ArrowUp" ? -1 : 1)
                          ];
                        if (target) void move(item.id, target.id);
                      }
                    }}
                  >
                    ⠿
                  </button>
                )}
                {track ? (
                  <MusicTrackRow
                    track={track}
                    queue={queue}
                    queueIds={ids}
                    queueIndex={ids.indexOf(item.id)}
                    source={playlist.name}
                    number={index + 1}
                    extra={action}
                  />
                ) : (
                  <div className="music-unavailable">
                    {details.loading
                      ? t("Loading track…")
                      : t("Track unavailable")}
                    {action}
                  </div>
                )}
              </li>
            );
          })}
      </ol>
      {!!playlist.items.length && !view.visible.length && (
        <p>{t("No tracks match this search.")}</p>
      )}
      {!details.loading && queue.length < playlist.items.length && (
        <button onClick={details.reload}>{t("Retry track details")}</button>
      )}
    </>
  );
}
