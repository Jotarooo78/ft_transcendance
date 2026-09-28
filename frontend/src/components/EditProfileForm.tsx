import { useState, type ChangeEvent, type SubmitEvent } from "react";

import type { AuthenticatedUser } from "../types/auth";
import {
  isCanonicalUsername,
  normalizeUsername,
  usernameErrorMessage,
} from "../username";

type EditProfileFormProps = {
  user: AuthenticatedUser;
  onSave: (username: string, bio: string, avatarSource: File | null) => void;
  onCancel: () => void;
};

function EditProfileForm({ user, onSave, onCancel }: EditProfileFormProps) {
  /*
   * Le formulaire commence avec les informations actuelles
   * de l'utilisateur.
   */
  const [username, setUsername] = useState(user.username);
  const [bio, setBio] = useState(user.bio);

  const [errorMessage, setErrorMessage] = useState("");

  const defaultAvatarUrl = "/images/default-avatar.svg";

  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(
    user.avatarUrl ?? defaultAvatarUrl,
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

    if (avatarPreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }

    const previewUrl = URL.createObjectURL(file);

    setAvatarFile(file);
    setAvatarPreviewUrl(previewUrl);
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");

    const normalizedUsername = normalizeUsername(username);
    const trimmedBio = bio.trim();

    if (!isCanonicalUsername(normalizedUsername)) {
      setErrorMessage(usernameErrorMessage);
      return;
    }

    if (trimmedBio.length > 160) {
      setErrorMessage("Bio must contain no more than 160 characters.");
      return;
    }

    onSave(normalizedUsername, trimmedBio, avatarFile);
  }

  return (
    <form className="edit-profile-form" onSubmit={handleSubmit}>
      <div className="avatar-editor">
        <img
          className="profile-avatar"
          src={avatarPreviewUrl}
          alt="Avatar preview"
        />

        <label htmlFor="profile-avatar">
          Choose an avatar
          <input
            id="profile-avatar"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleAvatarChange}
          />
        </label>

        <p className="field-help">PNG, JPEG or WebP. Maximum size: 2 MB.</p>
      </div>
      <label htmlFor="profile-username">
        Username
        <input
          id="profile-username"
          type="text"
          required
          minLength={3}
          maxLength={30}
          autoComplete="username"
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
          }}
        />
      </label>

      <label htmlFor="profile-bio">
        Bio
        <textarea
          id="profile-bio"
          rows={4}
          maxLength={160}
          value={bio}
          onChange={(event) => {
            setBio(event.target.value);
          }}
          placeholder="Tell the community about yourself."
        />
      </label>

      <p className="character-count">{bio.length}/160</p>

      {errorMessage && (
        <p className="message error-message" role="alert">
          {errorMessage}
        </p>
      )}

      <div className="edit-profile-actions">
        <button type="button" className="cancel-edit-button" onClick={onCancel}>
          Cancel
        </button>

        <button type="submit" disabled={username.trim() === ""}>
          Save changes
        </button>
      </div>
    </form>
  );
}

export default EditProfileForm;
