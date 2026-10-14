/** Client JWT de suppression privée ; seule la réponse 204 confirme la disparition du fichier. */
import { authenticatedFetch } from "./api";
import { getAccessToken } from "./session";

/**
 * Demande la suppression par UUID avec le signal d’annulation. Vérifie que le compte reste courant et
 * conserve un message explicite si le fichier est utilisé ou si le service refuse.
 */
export async function deleteFile(id: string, signal: AbortSignal) {
  const token = getAccessToken();
  const response = await authenticatedFetch(
    `/api/media/assets/${encodeURIComponent(id)}`,
    { method: "DELETE", signal },
  );
  if (signal.aborted || token !== getAccessToken())
    throw new Error("The signed-in account changed. Refresh your files.");
  if (response.status !== 204)
    throw new Error(
      response.status === 409
        ? "This file is still used in the catalog and was not deleted."
        : response.status === 404
          ? "This file is no longer available. Refresh the list."
          : "Unable to delete the file. It remains visible; please try again.",
    );
}
