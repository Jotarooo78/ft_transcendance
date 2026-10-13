/** Client JWT de suppression privée ; seule la réponse 204 confirme la disparition du fichier. */
import { authenticatedFetch } from "./api";
import { getAccessToken } from "./session";

/**
 * Demande la suppression par UUID avec le signal d’annulation. Vérifie que le compte reste courant et
 * conserve un message explicite si le fichier est utilisé ou si le service refuse.
 */
export async function deleteFile(id: string, signal: AbortSignal) {
  const token = getAccessToken();
  const response = await authenticatedFetch(`/api/media/assets/${encodeURIComponent(id)}`, { method: "DELETE", signal });
  if (signal.aborted || token !== getAccessToken()) throw new Error("Compte changé. Rechargez vos fichiers.");
  if (response.status !== 204) throw new Error(response.status === 409 ? "Ce fichier est encore utilisé dans le catalogue. Il a été conservé." :
    response.status === 404 ? "Ce fichier n’est plus disponible. Actualisez la liste." : "Suppression impossible. Le fichier reste affiché ; réessayez.");
}
