import { translate as t, translateError } from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
import {
  createPlaybackProgress,
  PlaybackProgressContext,
} from "../contexts/playback-progress";
/** Coordonne une seule file et un seul moteur audio pour toutes les pages. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  MusicPlayerContext,
  type MusicPlayer,
  type PlayOptions,
} from "../contexts/music-player";
import AudioPlayer from "./AudioPlayer";
import PlayerBar from "./PlayerBar";
import { readPlayer, writePlayer } from "../storage/player-storage";
import { readTrackDetails } from "../services/track-details";
import type { Track } from "../types/music";
import {
  emptyQueue,
  selectQueue,
  nextQueue,
  previousQueue,
  toggleShuffle,
  insertQueue,
  removeQueue,
  type MusicQueue,
} from "../services/music-queue";

/** Le parent remonte ce composant à chaque changement de compte. */
export default function MusicPlayerProvider({
  children,
  accountId,
}: {
  /** Compte servant uniquement de clé locale ; absent en consultation invitée. */ accountId?: string;
  /** Pages utilisant le lecteur. */ children: ReactNode;
}) {
  useLanguage();
  const [saved] = useState(() => readPlayer(accountId));
  const [initialPosition, setInitialPosition] = useState(0);
  const ready = useRef(!saved?.entries.length),
    revision = useRef(0);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [queue, setQueue] = useState(() => ({
      ...emptyQueue(),
      shuffle: saved?.shuffle ?? false,
      repeat: saved?.repeat ?? "off",
    })),
    queueRef = useRef(queue);
  const [cycle, setCycle] = useState(0),
    [autoPlay, setAutoPlay] = useState(false);
  const [playing, setPlaying] = useState(false),
    [loading, setLoading] = useState(false);
  const [progress] = useState(createPlaybackProgress);
  const [volume, setVolume] = useState(saved?.volume ?? 0.8),
    [muted, setMuted] = useState(saved?.muted ?? false);
  const [queueOpen, showQueue] = useState(false),
    [notice, setNotice] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null),
    failed = useRef(new Set<string>());
  const current = queue.entries.find((entry) => entry.key === queue.current);
  const preferences = useRef({ volume, muted });
  useEffect(() => {
    preferences.current = { volume, muted };
  });
  useEffect(() => {
    if (!saved?.entries.length) return;
    const controller = new AbortController(),
      expected = revision.current;
    void readTrackDetails(
      saved.entries.map((entry) => entry.trackId),
      controller.signal,
      true,
    )
      .then((tracks) => {
        if (controller.signal.aborted || revision.current !== expected) return;
        const entries = saved.entries.flatMap((entry) =>
          tracks[entry.trackId]?.audioUrl
            ? [
                {
                  key: entry.key,
                  occurrence: entry.occurrence,
                  track: tracks[entry.trackId]!,
                },
              ]
            : [],
        );
        const keys = new Set(entries.map((entry) => entry.key));
        const retained = saved.current !== null && keys.has(saved.current);
        const order = saved.order.filter((key) => keys.has(key));
        const current = retained
          ? saved.current
          : (saved.order
              .slice(saved.order.indexOf(saved.current ?? "") + 1)
              .find((key) => keys.has(key)) ??
            order[0] ??
            null);
        const next: MusicQueue = {
          entries,
          order,
          current,
          history: saved.history.filter((key) => keys.has(key)),
          forward: saved.forward.filter((key) => keys.has(key)),
          source: saved.source,
          sourceLocalized: saved.sourceLocalized,
          shuffle: saved.shuffle,
          repeat: saved.repeat,
        };
        queueRef.current = next;
        setQueue(next);
        ready.current = true;
        setInitialPosition(retained ? saved.position : 0);
        progress.update(retained ? saved.position : 0, 0);
        setAutoPlay(false);
        setCycle((value) => value + 1);
        setNotice(
          entries.length < saved.entries.length
            ? "Unavailable tracks were removed from your restored queue."
            : "Queue restored. Press play when you’re ready.",
        );
      })
      .catch(() => {
        if (!controller.signal.aborted && revision.current === expected)
          setNotice(
            "Your saved queue could not be loaded. Retry restoration or choose a track.",
          );
      });
    return () => controller.abort();
  }, [saved, restoreAttempt, progress]);
  useEffect(() => {
    /** Enregistre les références et la dernière position réelle, jamais une adresse audio. */
    function save() {
      if (!ready.current) return;
      const prefs = preferences.current;
      writePlayer(
        accountId,
        queueRef.current,
        audioRef.current && audioRef.current.readyState >= 1
          ? audioRef.current.currentTime
          : progress.read().position,
        prefs.volume,
        prefs.muted,
      );
    }
    const interval = window.setInterval(save, 2000);
    window.addEventListener("pagehide", save);
    return () => {
      save();
      window.clearInterval(interval);
      window.removeEventListener("pagehide", save);
    };
  }, [accountId, progress]);
  useEffect(() => {
    if (ready.current)
      writePlayer(
        accountId,
        queue,
        audioRef.current && audioRef.current.readyState >= 1
          ? audioRef.current.currentTime
          : initialPosition,
        volume,
        muted,
      );
  }, [accountId, queue, volume, muted, playing, initialPosition]);
  /** Met à jour la référence immédiatement pour sérialiser les commandes rapprochées. */
  function commit(next: MusicQueue) {
    queueRef.current = next;
    setQueue(next);
  }
  /** Lance un nouveau cycle, y compris lorsque le même morceau est répété. */
  function start(next: MusicQueue, autoplay = true) {
    revision.current++;
    ready.current = true;
    setInitialPosition(0);
    audioRef.current?.pause();
    commit(next);
    progress.update(0, 0);
    setPlaying(false);
    setLoading(!!next.current);
    setAutoPlay(autoplay);
    setCycle((value) => value + 1);
  }
  /** Reprend l’audio courant et rend visible un refus du navigateur. */
  function resume() {
    const audio = audioRef.current;
    if (!audio) return;
    void audio.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (audioRef.current === audio) {
        setLoading(false);
        setNotice("Playback could not start. Press play to retry.");
      }
    });
  }
  /** Construit une file entière ; un clic sur l’occurrence courante reprend sans réinitialiser. */
  function play(
    track: Track,
    tracks: Track[] = [track],
    options: PlayOptions = {},
  ) {
    const selected =
      options.index ?? tracks.findIndex((item) => item.id === track.id);
    const occurrence = options.ids?.[selected] ?? track.id;
    const active = queueRef.current.entries.find(
      (entry) => entry.key === queueRef.current.current,
    );
    if (
      !options.restart &&
      active?.track.id === track.id &&
      (!options.ids || active.occurrence === occurrence)
    ) {
      resume();
      return;
    }
    const entries = tracks.flatMap((item, index) =>
      item.audioUrl
        ? [
            {
              key: crypto.randomUUID(),
              occurrence: options.ids?.[index] ?? item.id,
              track: item,
            },
          ]
        : [],
    );
    const index = entries.findIndex((entry) => entry.occurrence === occurrence);
    if (index < 0) {
      setNotice("This track is unavailable.");
      return;
    }
    failed.current.clear();
    setNotice("");
    start({
      ...selectQueue(
        entries,
        index,
        queueRef.current,
        options.source ?? "Selected tracks",
        options.shuffle,
      ),
      sourceLocalized: options.sourceLocalized ?? options.source === undefined,
    });
  }
  /** Passe au suivant ou termine en conservant la dernière sélection visible. */
  function advance(natural = false) {
    const next = nextQueue(queueRef.current, natural);
    if (next) start(next);
    else {
      audioRef.current?.pause();
      setPlaying(false);
      setLoading(false);
    }
  }
  /** Revient au début ou dans le parcours réellement écouté. */
  function previous() {
    if ((audioRef.current?.currentTime ?? progress.read().position) > 3) {
      seek(0);
      return;
    }
    const next = previousQueue(queueRef.current);
    if (next === queueRef.current) seek(0);
    else start(next);
  }
  /** Borne le déplacement à la durée connue du fichier. */
  function seek(seconds: number) {
    const audio = audioRef.current;
    if (audio && Number.isFinite(audio.duration)) {
      audio.currentTime = Math.max(0, Math.min(seconds, audio.duration));
      progress.update(audio.currentTime);
    }
  }
  /** Distingue panne réseau et fichier illisible ; ne parcourt jamais indéfiniment une file cassée. */
  function unavailable(code: number) {
    setPlaying(false);
    setLoading(false);
    if (code === 2 || !navigator.onLine) {
      setNotice("Network unavailable. Retry playback when connected.");
      return;
    }
    const q = queueRef.current;
    if (q.current) failed.current.add(q.current);
    let candidate = nextQueue(q);
    for (
      let count = 0;
      candidate &&
      failed.current.has(candidate.current!) &&
      count < q.entries.length;
      count++
    )
      candidate = nextQueue(candidate);
    if (!candidate || failed.current.has(candidate.current!)) {
      setNotice(
        "No playable tracks remain. Retry playback or choose another track.",
      );
      return;
    }
    setNotice("An unavailable track was skipped.");
    start(candidate);
  }
  const value: MusicPlayer = {
    play,
    currentId: current?.track.id ?? null,
    currentOccurrence: current?.occurrence ?? null,
    current,
    queue,
    playing,
    loading,
    volume,
    muted,
    notice,
    queueOpen,
    toggle: () => {
      if (audioRef.current?.paused) resume();
      else audioRef.current?.pause();
    },
    next: () => {
      failed.current.clear();
      setNotice("");
      advance();
    },
    previous,
    seek,
    setVolume: (value) => {
      setVolume(Math.max(0, Math.min(1, value)));
      setMuted(false);
    },
    toggleMute: () => setMuted((value) => !value),
    shuffle: () => commit(toggleShuffle(queueRef.current)),
    repeat: () => {
      const q = queueRef.current;
      commit({
        ...q,
        repeat: q.repeat === "off" ? "all" : q.repeat === "all" ? "one" : "off",
      });
    },
    add: (track, next) => {
      if (!track.audioUrl) return;
      const q = insertQueue(
        queueRef.current,
        { key: crypto.randomUUID(), occurrence: crypto.randomUUID(), track },
        next,
      );
      if (!queueRef.current.current) start(q, false);
      else commit(q);
      setNotice(next ? "Added to play next." : "Added to queue.");
    },
    remove: (key) => commit(removeQueue(queueRef.current, key)),
    jump: (key) => {
      const q = queueRef.current;
      if (key === q.current) {
        resume();
        return;
      }
      if (q.entries.some((entry) => entry.key === key)) {
        failed.current.clear();
        start({
          ...q,
          current: key,
          history: q.current
            ? [...q.history, q.current].slice(-500)
            : q.history,
          forward: [],
        });
      }
    },
    showQueue,
    retry: () => {
      failed.current.clear();
      setNotice("");
      start(queueRef.current);
    },
    close: () => {
      start(
        {
          ...emptyQueue(),
          shuffle: queueRef.current.shuffle,
          repeat: queueRef.current.repeat,
        },
        false,
      );
      showQueue(false);
      setNotice("");
    },
  };
  return (
    <PlaybackProgressContext.Provider value={progress}>
      <MusicPlayerContext.Provider value={value}>
        {children}
        {!current && notice && (
          <div className="player-empty-notice" role="status">
            <span>{translateError(notice)}</span>
            {!ready.current && (
              <button onClick={() => setRestoreAttempt((value) => value + 1)}>
                {" "}
                {t("Retry restoration")}{" "}
              </button>
            )}
            <button onClick={value.close}>{t("Dismiss")}</button>
          </div>
        )}
        {current && (
          <PlayerBar>
            <AudioPlayer
              key={cycle}
              track={current.track}
              audioRef={audioRef}
              autoPlay={autoPlay}
              initialPosition={initialPosition}
              volume={volume}
              muted={muted}
              onState={(active, waiting) => {
                setPlaying(active);
                setLoading(waiting);
              }}
              onProgress={progress.update}
              onEnded={() => advance(true)}
              onError={unavailable}
              onBlocked={() => {
                setLoading(false);
                setNotice("Press play to resume audio.");
              }}
            />
          </PlayerBar>
        )}
      </MusicPlayerContext.Provider>
    </PlaybackProgressContext.Provider>
  );
}
