import { translate as t, translateError } from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
/** Consultation du profil public actuel depuis un crédit artiste. */
import { useEffect, useRef, useState } from "react";
import type { Track } from "../types/music";
import type { ProfileResponse } from "../types/auth";

/** Affiche un profil public et ferme le dialogue au clavier sans modifier la session. */
function ArtistProfile({
  id,
  onClose,
}: {
  /** Compte consulté. */ id: string;
  /** Ferme le dialogue. */ onClose: () => void;
}) {
  useLanguage();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    const controller = new AbortController();
    void fetch(`/api/users/profiles/${id}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("This profile is unavailable.");
        const value = (await response.json()) as ProfileResponse;
        if (
          value.userId !== id ||
          typeof value.displayName !== "string" ||
          typeof value.username !== "string"
        )
          throw new Error("Invalid profile response.");
        if (!controller.signal.aborted) setProfile(value);
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Unable to load this profile.",
          );
      });
    return () => controller.abort();
  }, [id]);
  return (
    <dialog
      ref={dialog}
      className="artist-dialog"
      aria-label={t("Artist profile")}
      onCancel={onClose}
    >
      {profile ? (
        <>
          {profile.avatarUrl && <img src={profile.avatarUrl} alt="" />}
          <h2>{profile.displayName}</h2>
          <p>@{profile.username}</p>
          <p className="track-description">{profile.bio}</p>
        </>
      ) : (
        <p role={error ? "alert" : "status"}>
          {translateError(error) || t("Loading artist…")}
        </p>
      )}
      <button type="button" onClick={onClose}>
        {t("Close profile")}
      </button>
    </dialog>
  );
}

/** Lie le nom de l’artiste à son compte stable ; les anciennes fixtures conservent leur crédit texte. */
export default function ArtistLink({
  track,
}: {
  /** Métadonnées confirmées par Catalogue. */ track: Track;
}) {
  useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <>
      {track.artistUserId ? (
        <button
          type="button"
          className="artist-link"
          onClick={() => setOpen(true)}
        >
          {track.artistName}
        </button>
      ) : (
        track.artistName
      )}
      {open && track.artistUserId && (
        <ArtistProfile id={track.artistUserId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
