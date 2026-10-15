/** Maintient la lecture lorsque l’utilisateur passe du catalogue à sa bibliothèque. */
import { useState, type ReactNode } from 'react';
import { MusicPlayerContext } from '../contexts/music-player';
import AudioPlayer from './AudioPlayer';
import type { Track } from '../types/music';
/** Le parent utilise la clé du compte pour arrêter la lecture lors d’une déconnexion. */
export default function MusicPlayerProvider({ children }: { /** Écrans utilisant le lecteur. */ children: ReactNode }) {
  const [queue,setQueue] = useState<Track[]>([]), [index,setIndex] = useState(0);
  const current = queue[index];
  /** Retient les morceaux lisibles ; l’ordre d’un projet est conservé. */
  function play(track: Track, tracks: Track[] = [track]) {
    const playable = tracks.filter(item=>item.audioUrl);
    const position = playable.findIndex(item=>item.id===track.id);
    if (position < 0) return;
    setQueue(playable); setIndex(position);
  }
  return <MusicPlayerContext.Provider value={{ play,currentId:current?.id ?? null }}>{children}
    {current && <AudioPlayer track={current} onClose={()=>{setQueue([]);setIndex(0);}} onEnded={()=>{ if(index+1<queue.length) setIndex(index+1); }} />}
  </MusicPlayerContext.Provider>;
}
