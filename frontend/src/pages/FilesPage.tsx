/** Page d’ajout public : le même formulaire reçoit le fichier et publie le morceau. */
import FileUploadForm from "../components/FileUploadForm";
import type { AuthenticatedUser } from "../types/auth";
import type { Track } from "../types/music";

/** Affiche le parcours d’ajout avec l’identité du compte et la destination Catalogue. */
export default function FilesPage({ user, onPublished }: {
  /** Compte connecté, non éditable depuis le formulaire de publication. */
  user: AuthenticatedUser;
  /** Ouvre le morceau confirmé dans le catalogue. */
  onPublished: (track: Track) => void;
}) {
  return <main className="publish-page"><header><p className="publish-eyebrow">CREATE & SHARE</p><h1>Upload your track</h1><p>A sound, a story, a place in the community.</p></header><FileUploadForm user={user} onPublished={onPublished} /></main>;
}
