/** Ligne de morceau commune au catalogue, aux projets, à la bibliothèque et à l’historique. */
import type { ReactNode } from 'react';
import type { Track } from '../types/music';
import TrackArtwork from './TrackArtwork';
import { openMusic } from '../services/music-navigation';
import ArtistLink from './ArtistLink';
import { useMusicPlayer } from '../contexts/music-player';
/** Le supplément contient la date d’écoute ou les actions propres à l’écran. */
export default function MusicTrackRow({ track, queue, number, extra }: {
  /** Morceau confirmé. */ track: Track;
  /** Ordre de lecture facultatif. */ queue?: Track[];
  /** Rang affiché dans un projet. */ number?: number;
  /** Informations et actions du contexte. */ extra?: ReactNode;
}) {
  const player = useMusicPlayer();
  const seconds = Math.floor(track.durationSeconds ?? 0);
  return <div className={`music-track-row${player.currentId===track.id?' is-playing':''}`}>
    <button className="track-play" aria-label={`Play ${track.title}`} disabled={!track.audioUrl} onClick={()=>player.play(track,queue)}>{player.currentId===track.id ? '♫' : number ?? '▶'}</button>
    <TrackArtwork track={track}/><div className="track-label"><strong>{track.title}</strong><span><ArtistLink track={track}/></span></div>
    <span className="track-album">{track.projectId?<button className="artist-link" onClick={()=>openMusic('projects',track.projectId!)}>{track.albumTitle}</button>:track.albumTitle}</span><span className="track-duration">{track.durationSeconds===null?'—':`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`}</span>
    {extra && <div className="track-row-actions">{extra}</div>}
  </div>;
}
