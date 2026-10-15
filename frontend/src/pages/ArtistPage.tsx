/** Profil musical d’un compte et ses projets publiés. */
import { useCallback } from 'react';
import { useResource } from '../hooks/useResource';
import { getProjects } from '../services/projects';
import { requestJson } from '../services/request-json';
import type { MusicArtist } from '../types/projects';
import ProjectCard from '../components/ProjectCard';
/** Les profils viennent de Users ; leurs projets viennent de Catalogue. */
export default function ArtistPage({ id }: { /** Compte artiste. */ id: string }) {
  const resource=useResource(useCallback(async signal=>{
    const [artist,projects]=await Promise.all([requestJson(`/api/users/profiles/${id}`,{signal},false),getProjects(false,1,'',signal,id)]);
    const value=artist as MusicArtist & { bio?:string };
    if(value.userId!==id || typeof value.displayName!=='string') throw new Error('Invalid artist response.');
    return {artist:value,projects};
  },[id]));
  const data=resource.data;
  return <main className="music-page">{!data ? <p role={resource.error?'alert':'status'}>{resource.error ?? 'Loading artist…'}</p> : <><header className="project-hero artist-hero">{data.artist.avatarUrl&&<img src={data.artist.avatarUrl} alt=""/>}<div><p className="page-label">ARTIST</p><h1>{data.artist.displayName}</h1><p>@{data.artist.username}</p><p>{data.artist.bio}</p></div></header><h2>Projects</h2><div className="music-grid">{data.projects.items.map(project=><ProjectCard key={project.id} project={project}/>)}</div>{!data.projects.items.length&&<p>No published projects yet.</p>}</>}</main>;
}
