import { authenticatedFetch } from "./api";
import { getAccessToken } from "./session";

export async function deleteFile(id: string, signal: AbortSignal) {
  const token = getAccessToken();
  const response = await authenticatedFetch(`/api/media/assets/${encodeURIComponent(id)}`, { method: "DELETE", signal });
  if (signal.aborted || token !== getAccessToken()) throw new Error("Compte changé. Rechargez vos fichiers.");
  if (response.status !== 204) throw new Error(response.status === 409 ? "Ce fichier est encore utilisé dans le catalogue. Il a été conservé." :
    response.status === 404 ? "Ce fichier n’est plus disponible. Actualisez la liste." : "Suppression impossible. Le fichier reste affiché ; réessayez.");
}
