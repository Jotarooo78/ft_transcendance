import { translate as t, translateError } from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
import { getAvatarSource } from "../avatar";
import { useEffect, useState, type ChangeEvent, type SubmitEvent } from "react";
import type { AuthenticatedUser } from "../types/auth";
import {
  isCanonicalUsername,
  normalizeUsername,
  usernameErrorMessage,
} from "../username";
import type { AvatarUploadProgress } from "../services/users";

type EditProfileFormProps = {
  user: AuthenticatedUser;
  onSave: (
    displayName: string,
    username: string,
    bio: string,
    avatarSource: File | null,
    removeAvatar: boolean,
    onAvatarProgress: (progress: AvatarUploadProgress) => void,
  ) => Promise<void>;
  onCancel: () => void;
};

/** Affiche EditProfileForm dans la langue choisie en conservant son état. */
function EditProfileForm({ user, onSave, onCancel }: EditProfileFormProps) {
  useLanguage();
  const [displayName, setDisplayName] = useState(user.displayName);

  const [username, setUsername] = useState(user.username);

  const [bio, setBio] = useState(user.bio ?? "");

  const [errorMessage, setErrorMessage] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [avatarUploadProgress, setAvatarUploadProgress] =
    useState<AvatarUploadProgress | null>(null);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const [avatarMarkedForDeletion, setAvatarMarkedForDeletion] = useState(false);

  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(
    getAvatarSource(user.avatarUrl),
  );

  // Libère l’URL Blob de prévisualisation lorsque la sélection change ou que le formulaire disparaît.
  useEffect(
    () => () => {
      if (avatarPreviewUrl.startsWith("blob:"))
        URL.revokeObjectURL(avatarPreviewUrl);
    },
    [avatarPreviewUrl],
  );

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    setErrorMessage("");

    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      setErrorMessage("Avatar must be a PNG, JPEG or WebP image.");

      event.target.value = "";
      return;
    }

    const maximumSize = 2 * 1024 * 1024;

    if (file.size > maximumSize) {
      setErrorMessage("Avatar must not exceed 2 MB.");

      event.target.value = "";
      return;
    }

    const previewUrl = URL.createObjectURL(file);

    setAvatarFile(file);
    setAvatarMarkedForDeletion(false);
    setAvatarPreviewUrl(previewUrl);
  }

  function handleDeleteAvatar() {
    if (avatarFile !== null) {
      setAvatarFile(null);
      setAvatarPreviewUrl(getAvatarSource(user.avatarUrl));
      return;
    }

    const confirmed = window.confirm(t("Remove your current avatar?"));

    if (!confirmed) {
      return;
    }

    setErrorMessage("");
    setAvatarMarkedForDeletion(true);
    setAvatarPreviewUrl(getAvatarSource(null));
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");

    const trimmedDisplayName = displayName.trim();
    // Normalise avant de vérifier le contrat commun, sans réécrire les autres champs du formulaire.
    const normalizedUsername = normalizeUsername(username);
    const trimmedBio = bio.trim();

    if (trimmedDisplayName.length < 1 || trimmedDisplayName.length > 60) {
      setErrorMessage("Display name must contain 1 to 60 characters.");
      return;
    }

    if (!isCanonicalUsername(normalizedUsername)) {
      setErrorMessage(usernameErrorMessage);
      return;
    }

    if (trimmedBio.length > 160) {
      setErrorMessage("Bio must contain no more than 160 characters.");
      return;
    }

    setIsSubmitting(true);
    setAvatarUploadProgress(null);

    try {
      await onSave(
        trimmedDisplayName,
        normalizedUsername,
        trimmedBio,
        avatarFile,
        avatarMarkedForDeletion,
        setAvatarUploadProgress,
      );
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("An unexpected error occurred.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="edit-profile-form" onSubmit={handleSubmit}>
      <div className="avatar-editor">
        <div className="avatar-preview-wrapper">
          <img
            className="profile-avatar"
            src={avatarPreviewUrl}
            alt={t("Avatar preview")}
          />

          {(avatarFile !== null ||
            (user.avatarUrl !== null && !avatarMarkedForDeletion)) && (
            <button
              type="button"
              className="remove-avatar-button"
              aria-label={t("Remove avatar")}
              title={t("Remove avatar")}
              disabled={isSubmitting}
              onClick={() => {
                handleDeleteAvatar();
              }}
            >
              <span aria-hidden="true">&times;</span>
            </button>
          )}
        </div>

        <label htmlFor="profile-avatar">
          {" "}
          {t("Choose an avatar")}{" "}
          <input
            id="profile-avatar"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleAvatarChange}
          />
        </label>

        <p className="field-help">
          {t("PNG, JPEG or WebP. Maximum size: 2 MB.")}
        </p>
      </div>

      <label htmlFor="profile-display-name">
        {" "}
        {t("Display name")}{" "}
        <input
          id="profile-display-name"
          type="text"
          required
          minLength={1}
          maxLength={60}
          autoComplete="name"
          value={displayName}
          onChange={(event) => {
            setDisplayName(event.target.value);
          }}
        />
      </label>

      <label htmlFor="profile-username">
        {" "}
        {t("Username")}{" "}
        <input
          id="profile-username"
          type="text"
          required
          minLength={3}
          maxLength={24}
          autoComplete="username"
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
          }}
        />
      </label>

      <label htmlFor="profile-bio">
        {" "}
        {t("Bio")}{" "}
        <textarea
          id="profile-bio"
          rows={4}
          maxLength={160}
          value={bio}
          onChange={(event) => {
            setBio(event.target.value);
          }}
          placeholder={t("Tell the community about yourself.")}
        />
      </label>

      <p className="character-count">{bio.length}/160</p>

      {errorMessage && (
        <p className="message error-message" role="alert">
          {translateError(errorMessage)}
        </p>
      )}

      {avatarUploadProgress !== null && (
        <div className="avatar-upload-progress" aria-live="polite">
          <progress
            max={100}
            value={avatarUploadProgress.percent ?? undefined}
          />

          <span>
            {avatarUploadProgress.phase === "processing"
              ? t("Processing avatar...")
              : avatarUploadProgress.percent === null
                ? t("Uploading avatar...")
                : t("Uploading avatar: {0}%", {
                    "0": avatarUploadProgress.percent,
                  })}
          </span>
        </div>
      )}

      <div className="edit-profile-actions">
        <button
          type="button"
          className="cancel-edit-button"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          {" "}
          {t("Cancel")}{" "}
        </button>

        <button
          type="submit"
          disabled={
            isSubmitting || displayName.trim() === "" || username.trim() === ""
          }
        >
          {isSubmitting ? t("Saving...") : t("Save changes")}
        </button>
      </div>
    </form>
  );
}

export default EditProfileForm;
