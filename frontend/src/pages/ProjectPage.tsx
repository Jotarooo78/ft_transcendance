/** Présentation publique d’un album, EP, mixtape ou titre seul. */
import { useCallback } from 'react';
import { useResource } from '../hooks/useResource';
import { getProject } from '../services/projects';
import { openMusic } from '../services/music-navigation';
import { useMusicPlayer } from '../contexts/music-player';
import ProjectArtwork from '../components/ProjectArtwork';
import MusicTrackRow from '../components/MusicTrackRow';
/** Lit le projet et transmet son ordre au lecteur commun. */
export default function ProjectPage({ id }: { /** Identité de l’adresse courante. */ id: string }) {
  const resource = useResource(useCallback(signal=>getProject(id,false,signal),[id]));
  const player = useMusicPlayer(), project = resource.data;
  if (!project) return <main className="music-page"><p role={resource.error?'alert':'status'}>{resource.error ?? 'Loading project…'}</p>{resource.error&&<button onClick={resource.reload}>Retry</button>}</main>;
  return <main className="music-page project-page"><header className="project-hero"><ProjectArtwork url={project.coverUrl}/><div><p className="page-label">{project.releaseType.toUpperCase()}</p><h1>{project.title}</h1><p>{project.artist && <button className="artist-link" onClick={()=>openMusic('artists',project.artist!.userId)}>{project.artist.displayName}</button>} · {project.releaseDate} · {project.tracks.length} tracks</p><p className="track-description">{project.description}</p></div></header>
    <div className="music-section-heading"><button className="publish-primary" disabled={!project.tracks.length} onClick={()=>{if(project.tracks[0])player.play(project.tracks[0],project.tracks);}}>Play project</button></div>
    <div className="music-track-list">{project.tracks.map((track,index)=><MusicTrackRow key={track.id} track={track} queue={project.tracks} number={index+1}/>)}</div>
  </main>;
}
