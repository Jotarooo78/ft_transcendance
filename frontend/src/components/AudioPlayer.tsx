import { useEffect, useRef, useState, type RefObject } from "react";
import type { Track } from "../types/music";
import { ListeningClock } from "../services/listening-clock";
import { PlaybackQueue, type TrackingStatus } from "../services/playback-queue";
import {
  closePlayback,
  openPlayback,
  savePlaybackProgress,
} from "../services/playback";
import { getAccessToken } from "../services/session";

/** Contrat du moteur audio ; chaque montage représente une nouvelle écoute. */
type AudioPlayerProps = {
  /** Morceau de l’occurrence courante. */ track: Track;
  /** Accès partagé au seul élément audio de l’application. */ audioRef: RefObject<HTMLAudioElement | null>;
  /** Démarrage demandé à la sélection, faux lors d’une restauration. */ autoPlay: boolean;
  /** Volume entre zéro et un. */ volume: number;
  /** Coupe le son sans perdre le volume. */ muted: boolean;
  /** Position initiale en secondes, appliquée après chargement des métadonnées. */ initialPosition: number;
  /** État réel destiné aux commandes communes. */ onState: (
    playing: boolean,
    loading: boolean,
  ) => void;
  /** Position et durée en secondes. */ onProgress: (
    position: number,
    duration: number,
  ) => void;
  /** Fin naturelle ; clôture le suivi avant de changer d’occurrence. */ onEnded: () => void;
  /** Code MediaError, distinct d’un refus de lecture automatique. */ onError: (
    code: number,
  ) => void;
  /** Le navigateur attend une nouvelle action explicite de l’utilisateur. */ onBlocked: () => void;
};

/**
 * Relie le lecteur audio réel à la mesure d’écoute et à la file de sauvegarde du compte. Les
 * événements pause, attente et déplacement interrompent le crédit ; un échec de suivi ne bloque pas
 * l’audio.
 */
export default function AudioPlayer({
  track,
  audioRef,
  autoPlay,
  volume,
  muted,
  initialPosition,
  onState,
  onProgress,
  onEnded,
  onError,
  onBlocked,
}: AudioPlayerProps) {
  const [tracking, setTracking] = useState<TrackingStatus | null>(null);
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = volume;
      audio.muted = muted;
    }
  }, [audioRef, volume, muted]);
  // Une promesse d’un audio démonté ne doit plus modifier le nouveau lecteur.
  useEffect(() => {
    const audio = audioRef.current;
    let live = true;
    if (audio && autoPlay)
      void audio.play().catch((error: unknown) => {
        if (
          live &&
          error instanceof DOMException &&
          error.name === "NotAllowedError"
        )
          onBlocked();
      });
    return () => {
      live = false;
      audio?.pause();
    };
    // Les commandes suivantes passent par audioRef ; le démarrage concerne uniquement ce montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const active = useRef<{
    /** Horloge mesurant le temps de lecture effective, distincte de la position. */
    clock: ListeningClock;
    /** File sérialisant les confirmations de progression et de clôture. */
    queue: PlaybackQueue;
    /** Indique que ce cycle de suivi du lecteur a déjà atteint sa fin. */
    ended: boolean;
  } | null>(null);
  const createTracker = useRef<(() => void) | null>(null);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const token = getAccessToken();
    let mounted = true;
    /**
     * Crée une nouvelle horloge et une file pour ce morceau, avec garde de session avant les envois et les
     * notifications.
     */
    const create = () => {
      const clock = new ListeningClock();
      const queue = new PlaybackQueue({
        /** Ouvre le suivi du morceau courant dans Playback, au moment de la lecture réelle. */
        open: () => openPlayback(track.id),
        progress: savePlaybackProgress,
        close: closePlayback,
        /** Vérifie que le token reste celui du compte ayant commencé cette écoute. */
        isCurrent: () => !!token && getAccessToken() === token,
        /** Met à jour l’état visible de sauvegarde uniquement pour le compte courant. */
        notify: (value) => {
          if (mounted && active.current?.queue === queue) setTracking(value);
        },
      });
      active.current = { clock, queue, ended: false };
    };
    createTracker.current = create;
    create();
    /** Échantillonne périodiquement la position du vrai lecteur et propose la mesure à la file de suivi. */
    const tick = () => {
      const current = active.current;
      if (!current || current.ended) return;
      const snapshot = current.clock.sample({
        nowMs: performance.now(),
        positionMs: Math.max(0, audio.currentTime * 1000),
        playing:
          !audio.paused &&
          !audio.ended &&
          !audio.seeking &&
          audio.readyState >= 3,
        discontinuity: audio.seeking,
      });
      current.queue.offer(snapshot);
    };
    const interval = window.setInterval(tick, 1000);
    /** Échantillonne la dernière position et détache le suivi lors du nettoyage, puis retire le timer. */
    const finish = () => {
      const current = active.current;
      if (!current) return;
      const snapshot = current.clock.sample({
        nowMs: performance.now(),
        positionMs: Math.max(0, audio.currentTime * 1000),
        playing: false,
        discontinuity: audio.seeking,
      });
      current.ended = true;
      current.queue.detach(snapshot);
    };
    window.addEventListener("pagehide", finish);
    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener("pagehide", finish);
      finish();
      active.current = null;
      createTracker.current = null;
    };
  }, [track.id, audioRef]);
  /**
   * Échantillonne l’événement du lecteur, distingue rupture de position et lecture active, démarre le
   * suivi à la première lecture et le ferme à la fin.
   */
  function observe(
    playing: boolean,
    discontinuity = false,
    start = false,
    end = false,
  ) {
    const audio = audioRef.current;
    if (!audio) return;
    if (start && active.current?.ended) createTracker.current?.();
    const current = active.current;
    if (!current || (current.ended && !start)) return;
    const snapshot = current.clock.sample({
      nowMs: performance.now(),
      positionMs: Math.max(0, audio.currentTime * 1000),
      playing,
      discontinuity,
    });
    if (start) void current.queue.start(snapshot);
    else if (end) {
      current.ended = true;
      void current.queue.finish(snapshot);
    } else current.queue.offer(snapshot);
  }
  return (
    <>
      <audio
        ref={audioRef}
        src={track.audioUrl ?? undefined}
        preload="metadata"
        onLoadStart={() => onState(false, true)}
        onLoadedMetadata={() => {
          const audio = audioRef.current!;
          if (Number.isFinite(audio.duration))
            audio.currentTime = Math.min(
              initialPosition,
              Math.max(0, audio.duration - 0.1),
            );
          onProgress(
            audio.currentTime,
            Number.isFinite(audio.duration) ? audio.duration : 0,
          );
        }}
        onTimeUpdate={() => {
          const audio = audioRef.current!;
          onProgress(
            audio.currentTime,
            Number.isFinite(audio.duration) ? audio.duration : 0,
          );
        }}
        onCanPlay={() => onState(!audioRef.current!.paused, false)}
        onError={() => {
          observe(false, false, false, true);
          onError(audioRef.current?.error?.code ?? 4);
        }}
        onPlaying={() => {
          observe(true, false, true);
          onState(true, false);
        }}
        onPause={() => {
          observe(false);
          onState(false, false);
        }}
        onWaiting={() => {
          observe(false);
          onState(false, true);
        }}
        onSeeking={() => observe(false, true)}
        onSeeked={() =>
          observe(
            !!audioRef.current &&
              !audioRef.current.paused &&
              audioRef.current.readyState >= 3,
            true,
          )
        }
        onEnded={() => {
          observe(false, false, false, true);
          onState(false, false);
          onEnded();
        }}
      />
      {tracking?.state === "error" && (
        <div className="listening-status" role="status">
          <span>{tracking.message}</span>
          {tracking.canRetry && (
            <button type="button" onClick={() => active.current?.queue.retry()}>
              Retry saving
            </button>
          )}
        </div>
      )}
    </>
  );
}
