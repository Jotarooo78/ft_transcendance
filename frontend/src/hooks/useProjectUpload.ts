/** État de l’éditeur et file séquentielle d’envoi ; réutilise les outils Media existants. */
import { useEffect, useRef, useState } from 'react';
import { validateFile } from '../services/validate-file';
import { sendFile } from '../services/send-file';
import { replaceAudioCover } from '../services/update-audio-cover';
import { publishProject, saveProject } from '../services/projects';
import { getAccessToken } from '../services/session';
import type { ReadyFile, UploadProgress } from '../types/files';
import type { MusicProject, ProjectType } from '../types/projects';
/** Une ligne reste identifiable avant et après le transfert. */
export type UploadRow = {
  /** Identité locale de la ligne. */ key: string;
  /** Nom éditable du morceau. */ title: string;
  /** Fichier disponible pour réessayer durant cette visite. */ file?: File;
  /** Identifiant confirmé par Media, persistant dans le brouillon. */ audioAssetId?: string;
  /** Métadonnées obtenues lors de l’envoi, utiles pour afficher la pochette. */ asset?: ReadyFile;
  /** Phase courante de la ligne. */ state: 'waiting' | 'sending' | 'ready' | 'error';
  /** Progression réellement mesurée. */ progress?: UploadProgress;
  /** Refus permettant de réessayer ce fichier. */ error?: string;
};
/** Gère un éditeur ; son parent le remonte lorsqu’on choisit un autre projet. */
export function useProjectUpload(initial: MusicProject | null, onSaved: (p: MusicProject) => void) {
  const id = useRef(initial?.id ?? crypto.randomUUID());
  const confirmed = useRef<MusicProject | null>(initial);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [type, setType] = useState<ProjectType>(initial?.releaseType === 'compilation' ? 'album' : initial?.releaseType ?? 'single');
  const [rows, setRows] = useState<UploadRow[]>(initial?.tracks.map(t => ({ key: t.id, audioAssetId: t.audioAssetId ?? undefined, title: t.title, state: 'ready' })) ?? []);
  const [cover, setCoverFile] = useState<File | null>(null);
  const [defaultCover, setDefaultCover] = useState(false);
  const [saved, setSaved] = useState<MusicProject | null>(initial);
  const [coverId, setCoverId] = useState<string | null>(initial?.coverAssetId ?? null);
  const [busy, setBusy] = useState(false), [sending, setSending] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const running = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const token = getAccessToken();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; running.current?.abort(); }; }, []);
  /** Refuse les réponses devenues étrangères au compte ou à cet éditeur. */
  const current = () => mounted.current && token === getAccessToken();
  /** Remplace uniquement les informations de la ligne concernée. */
  function patch(key: string, changes: Partial<UploadRow>) { if (current()) setRows(previous => previous.map(r => r.key === key ? { ...r, ...changes } : r)); }
  /** Envoie séquentiellement les fichiers pour respecter la capacité Media du compte. */
  async function transfer(items: UploadRow[]) {
    if (running.current) return;
    const controller = new AbortController(); running.current = controller; setSending(true); setError(''); setMessage('');
    try {
      for (const item of items) {
        if (controller.signal.aborted || !item.file) break;
        patch(item.key, { state: 'sending', error: undefined });
        try {
          await validateFile(item.file, controller.signal);
          const asset = await sendFile(item.file, progress => patch(item.key, { progress }), controller.signal, true);
          patch(item.key, { state: 'ready', asset, audioAssetId: asset.id, progress: undefined });
        } catch (failure) { if (!controller.signal.aborted) patch(item.key, { state: 'error', progress: undefined, error: failure instanceof Error ? failure.message : 'Upload failed.' }); }
      }
    } finally { if (running.current === controller) running.current = null; if (current()) setSending(false); }
  }
  /** Ajoute une sélection puis lance son transfert ; les pistes confirmées restent intactes. */
  function add(files: File[]) {
    if (busy || sending || running.current || !files.length) return;
    if (rows.length + files.length > (type === 'single' ? 1 : 100)) { setError(type === 'single' ? 'Choose a project type to add several tracks.' : 'A project can contain up to 100 tracks.'); return; }
    const items: UploadRow[] = files.map(file => ({ key: crypto.randomUUID(), file, title: file.name.replace(/\.[^.]+$/, '').slice(0,200), state: 'waiting' }));
    setRows(previous => [...previous, ...items]);
    if (!title && type === 'single') setTitle(items[0].title);
    void transfer(items);
  }
  /** Réordonne avec deux boutons utilisables au clavier. */
  function move(index: number, offset: number) {
    setRows(previous => { const next = [...previous], target = index + offset; if (target < 0 || target >= next.length) return previous; [next[index],next[target]] = [next[target],next[index]]; return next; });
  }
  /** Sauvegarde les fichiers prêts ; publie seulement lorsque toutes les lignes sont disponibles. */
  async function save(publish = false) {
    if (busy || sending || running.current) return;
    const ready = rows.filter(r => r.audioAssetId && r.state === 'ready');
    if (publish && (!ready.length || ready.length !== rows.length)) { setError('Finish or remove failed uploads before publishing.'); return; }
    const controller = new AbortController(); running.current = controller; setBusy(true); setError(''); setMessage('');
    try {
      let artwork = coverId && ready.some(r => r.audioAssetId === coverId) ? coverId : null;
      if (cover) {
        if (!ready[0]) throw new Error('Add an audio before saving the artwork.');
        await validateFile(cover, controller.signal, 'image');
        await replaceAudioCover(ready[0].audioAssetId!, cover, controller.signal);
        artwork = ready[0].audioAssetId!;
      } else if (!defaultCover && !artwork && !initial && ready[0]?.asset?.cover) artwork = ready[0].audioAssetId!;
      const saved = await saveProject(id.current, { title, description, releaseType: type, coverAssetId: artwork,
        expectedVersion: confirmed.current?.version ?? 0, tracks: ready.map(r => ({ audioAssetId: r.audioAssetId!, title: r.title })) }, controller.signal);
      confirmed.current = saved;
      const result = publish ? await publishProject(saved, controller.signal) : saved;
      confirmed.current = result;
      if (!current()) return;
      setCoverFile(null); setCoverId(artwork); setTitle(result.title); setSaved(result);
      setMessage(result.status === 'published' ? 'Your project is live. Changes saved.' : ready.length < rows.length ? 'Draft saved. Failed uploads will need to be selected again after leaving this page.' : 'Draft saved. You can come back later.');
      onSaved(result);
      return result;
    } catch (failure) { if (current()) setError(failure instanceof Error ? failure.message : 'Unable to save. Retry to recover the result.'); }
    finally { if (running.current === controller) running.current = null; if (current()) setBusy(false); }
  }
  return { title, setTitle, description, setDescription, type, setType, rows, setRows, cover, coverId, saved, defaultCover,
    setCover: (file: File | null) => { setCoverFile(file); setDefaultCover(false); },
    removeCover: () => { setCoverFile(null); setCoverId(null); setDefaultCover(true); },
    busy, sending, error, message, add, move, save, retry: (row: UploadRow) => transfer([row]),
    remove: (key: string) => setRows(previous => previous.filter(r => r.key !== key)),
    rename: (key: string, value: string) => patch(key, { title: value }) };
}
