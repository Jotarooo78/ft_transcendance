import { useState, type SubmitEvent } from "react";

import type { AuthenticatedUser } from "../types/auth";

type EditProfileFormProps = {
  user: AuthenticatedUser;
  onSave: (username: string, bio: string) => void;
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

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");

    const trimmedUsername = username.trim();
    const trimmedBio = bio.trim();

    if (trimmedUsername.length < 3) {
      setErrorMessage("Username must contain at least 3 characters.");
      return;
    }

    if (trimmedUsername.length > 30) {
      setErrorMessage("Username must contain no more than 30 characters.");
      return;
    }

    if (trimmedBio.length > 160) {
      setErrorMessage("Bio must contain no more than 160 characters.");
      return;
    }

    onSave(trimmedUsername, trimmedBio);
  }

  return (
    <form className="edit-profile-form" onSubmit={handleSubmit}>
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
