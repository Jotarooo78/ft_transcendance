/** Espace de création et de reprise des projets personnels, persistants dans Catalogue. */
import { useCallback, useState } from 'react';
import ProjectUploadForm from '../components/ProjectUploadForm';
import { useResource } from '../hooks/useResource';
import { discardProject, getProjects } from '../services/projects';
import type { AuthenticatedUser } from '../types/auth';
import type { Track } from '../types/music';
import type { MusicProject } from '../types/projects';
/** Le compte sert de clé au parent pour éliminer les données de l’utilisateur précédent. */
export default function FilesPage({ user, onPublished }: {
  /** Compte connecté. */ user: AuthenticatedUser;
  /** Navigation provisoire vers le premier morceau publié. */ onPublished: (track: Track) => void;
}) {
  const [page,setPage] = useState(1), [editorKey,setEditorKey] = useState('new');
  const [selected,setSelected] = useState<MusicProject | null>(null), [error,setError] = useState('');
  const [removing,setRemoving] = useState(false);
  const load = useCallback((signal: AbortSignal) => getProjects(true,page,'',signal),[page]);
  const projects = useResource(load);
  /** Abandon confirmé ; conserve le brouillon sélectionné si le nettoyage échoue. */
  async function remove(project: MusicProject) {
    if (removing || !window.confirm(`Discard draft "${project.title}" and its files?`)) return;
    setRemoving(true); setError('');
    try { await discardProject(project); setSelected(null); setEditorKey(crypto.randomUUID()); projects.reload(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to discard. Please retry.'); }
    finally { setRemoving(false); }
  }
  return <main className="publish-page"><header><p className="publish-eyebrow">CREATE & SHARE</p><h1>Upload your music</h1><p>A track, an EP, a mixtape, an album. Your sound, {user.displayName}.</p></header>
    <section className="project-drafts"><div className="music-section-heading"><h2>My uploads</h2><button onClick={() => { setSelected(null); setEditorKey(crypto.randomUUID()); }}>New upload</button></div>
      {projects.loading ? <p role="status">Loading your projects…</p> : projects.error ? <p role="alert">{projects.error}<button onClick={projects.reload}>Retry</button></p> : <div className="draft-list">{projects.data?.items.map(project => <div key={project.id}><button onClick={() => { setSelected(project); setEditorKey(project.id+':'+project.version); }}><strong>{project.title}</strong><span>{project.releaseType} · {project.status}</span></button>{project.status==='draft' && <button disabled={removing} onClick={() => void remove(project)} aria-label={`Discard ${project.title}`}>Discard</button>}</div>)}</div>}
      {projects.data && projects.data.total>24 && <div className="music-pagination"><button disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page}</span><button disabled={page*24>=projects.data.total} onClick={()=>setPage(p=>p+1)}>Next</button></div>}
      {error && <p role="alert">{error}</p>}
    </section>
    <ProjectUploadForm key={editorKey} initial={selected} onSaved={() => projects.reload()} onPublished={project => { if (project.tracks[0]) onPublished(project.tracks[0]); }} />
  </main>;
}
