/** Lectures et commandes des projets ; chaque réponse est validée avant affichage. */
import { isTrack } from './catalog';
import { jsonCommand, requestJson } from './request-json';
import type { MusicProject, ProjectInput, MusicPage } from '../types/projects';
/** Vérifie les champs nécessaires à l’éditeur et au lecteur. */
export function isProject(value: unknown): value is MusicProject {
  if (!value || typeof value !== 'object') return false;
  const p = value as MusicProject;
  return typeof p.id === 'string' && typeof p.title === 'string' && typeof p.description === 'string'
    && ['single','album','mixtape','ep','compilation'].includes(p.releaseType)
    && ['draft','published'].includes(p.status) && Number.isSafeInteger(p.version) && p.version > 0
    && (p.ownerUserId === null || typeof p.ownerUserId === 'string')
    && (p.coverAssetId === null || typeof p.coverAssetId === 'string')
    && (p.coverUrl === null || /^\/api\/media\/assets\/[a-f0-9-]{36}\/artwork$/i.test(p.coverUrl))
    && (p.releaseDate === null || typeof p.releaseDate === 'string')
    && (p.artist === null || (typeof p.artist?.userId === 'string' && typeof p.artist.displayName === 'string' && typeof p.artist.username === 'string'))
    && Array.isArray(p.tracks) && p.tracks.every(isTrack);
}
/** Exige un projet conforme avant d’accepter une confirmation. */
function project(value: unknown): MusicProject { if (!isProject(value)) throw new Error('Invalid project response.'); return value; }
/** Charge une page de projets ; le serveur impose le propriétaire en mode personnel. */
export async function getProjects(personal: boolean, page = 1, q = '', signal?: AbortSignal, owner?: string): Promise<MusicPage<MusicProject>> {
  const params = new URLSearchParams({ page: String(page), pageSize: '24', q });
  if (owner) params.set('owner', owner);
  const value = await requestJson(`/api/catalog/${personal ? 'me/' : ''}projects?${params}`, { signal }, personal) as MusicPage<MusicProject>;
  if (!value || !Array.isArray(value.items) || !value.items.every(isProject) || !Number.isSafeInteger(value.total) || value.total < 0 || value.page !== page || value.pageSize !== 24) throw new Error('Invalid project list.');
  return value;
}
/** Relit un projet public ou appartenant au compte connecté. */
export async function getProject(id: string, personal = false, signal?: AbortSignal) {
  return project(await requestJson(`/api/catalog/${personal ? 'me/' : ''}projects/${encodeURIComponent(id)}`, { signal }, personal));
}
/** Sauvegarde avec un UUID stable pour retrouver un résultat après réponse perdue. */
export async function saveProject(id: string, input: ProjectInput, signal?: AbortSignal) {
  return project(await requestJson(`/api/catalog/me/projects/${id}`, jsonCommand('PUT', input, signal)));
}
/** Demande la première publication ; le serveur conserve la même date lors d’un rejeu. */
export async function publishProject(p: MusicProject, signal?: AbortSignal) {
  return project(await requestJson(`/api/catalog/me/projects/${p.id}/publish`, jsonCommand('POST', { expectedVersion: p.version }, signal)));
}
/** Abandonne uniquement un brouillon, avec reprise du nettoyage après panne. */
export async function discardProject(p: MusicProject, signal?: AbortSignal) {
  await requestJson(`/api/catalog/me/projects/${p.id}`, jsonCommand('DELETE', { expectedVersion: p.version }, signal));
}
