/** Coordonne une seule file et un seul moteur audio pour toutes les pages. */
import { useRef, useState, type ReactNode } from "react";
import {
  MusicPlayerContext,
  type MusicPlayer,
  type PlayOptions,
} from "../contexts/music-player";
import AudioPlayer from "./AudioPlayer";
import PlayerBar from "./PlayerBar";
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
}: {
  /** Pages utilisant le lecteur. */ children: ReactNode;
}) {
  const [queue, setQueue] = useState(emptyQueue),
    queueRef = useRef(queue);
  const [cycle, setCycle] = useState(0),
    [autoPlay, setAutoPlay] = useState(false);
  const [playing, setPlaying] = useState(false),
    [loading, setLoading] = useState(false);
  const [position, setPosition] = useState(0),
    [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8),
    [muted, setMuted] = useState(false);
  const [queueOpen, showQueue] = useState(false),
    [notice, setNotice] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null),
    failed = useRef(new Set<string>());
  const current = queue.entries.find((entry) => entry.key === queue.current);
  /** Met à jour la référence immédiatement pour sérialiser les commandes rapprochées. */
  function commit(next: MusicQueue) {
    queueRef.current = next;
    setQueue(next);
  }
  /** Lance un nouveau cycle, y compris lorsque le même morceau est répété. */
  function start(next: MusicQueue, autoplay = true) {
    audioRef.current?.pause();
    commit(next);
    setPosition(0);
    setDuration(0);
    setPlaying(false);
    setLoading(!!next.current);
    setAutoPlay(autoplay);
    setCycle((value) => value + 1);
  }
  /** Reprend l’audio courant et rend visible un refus du navigateur. */
  function resume() {
    const audio = audioRef.current;
    if (!audio) return;
    void audio.play().catch(() => {
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
      active.occurrence === occurrence
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
    start(
      selectQueue(
        entries,
        index,
        queueRef.current,
        options.source ?? "Selected tracks",
        options.shuffle,
      ),
    );
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
    if ((audioRef.current?.currentTime ?? position) > 3) {
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
      setPosition(audio.currentTime);
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
    position,
    duration,
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
    <MusicPlayerContext.Provider value={value}>
      {children}
      {current && (
        <PlayerBar>
          <AudioPlayer
            key={cycle}
            track={current.track}
            audioRef={audioRef}
            autoPlay={autoPlay}
            initialPosition={0}
            volume={volume}
            muted={muted}
            onState={(active, waiting) => {
              setPlaying(active);
              setLoading(waiting);
            }}
            onProgress={(seconds, length) => {
              setPosition(seconds);
              setDuration(length);
            }}
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
  );
}
