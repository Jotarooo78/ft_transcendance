/** Requêtes JSON communes : erreurs explicites et protection contre les réponses d’un ancien compte. */
import { authenticatedFetch } from './api';
import { getAccessToken } from './session';
/** Refus HTTP conservant son statut pour distinguer conflit et indisponibilité. */
export class RequestError extends Error {
  /** Code HTTP renvoyé par le serveur. */ readonly status: number;
  /** Associe le statut au message affichable. */
  constructor(status: number, message: string) { super(message); this.status = status; }
}
/** Exécute une requête puis laisse le client métier vérifier la structure du résultat. */
export async function requestJson(path: string, options: RequestInit = {}, personal = true): Promise<unknown> {
  const token = getAccessToken();
  const response = await (personal ? authenticatedFetch(path, options) : fetch(path, options));
  if (options.signal?.aborted || (personal && token !== getAccessToken())) throw new Error('Your session changed. Please sign in again.');
  if (!response.ok) {
    const message = response.status === 409 ? 'This item changed. Reload it before trying again.'
      : response.status === 404 ? 'This item is no longer available.'
      : response.status === 400 ? 'Check the information before trying again.' : 'Unable to confirm this action. Please retry.';
    throw new RequestError(response.status, message);
  }
  if (response.status === 204) return null;
  const result: unknown = await response.json();
  if (options.signal?.aborted || (personal && token !== getAccessToken())) throw new Error('Your session changed.');
  return result;
}
/** Corps JSON et en-têtes communs aux commandes, sans exposer le token dans l’URL. */
export function jsonCommand(method: string, body: object, signal?: AbortSignal): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal };
}
