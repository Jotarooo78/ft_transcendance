import { useState } from "react";

import type { AuthenticatedUser } from "../types/auth";
import EditProfileForm from "../components/EditProfileForm";

type ProfilePageProps = {
  user: AuthenticatedUser;
  onUpdateProfile: (username: string, bio: string) => void;
};

function ProfilePage({ user, onUpdateProfile }: ProfilePageProps) {
  const creationDate = new Intl.DateTimeFormat("en", {
    dateStyle: "long",
  }).format(new Date(user.createdAt));

  const avatarSource = user.avatarUrl ?? "/images/default-avatar.svg";

  const [isEditing, setIsEditing] = useState(false);

  function handleSave(username: string, bio: string) {
    onUpdateProfile(username, bio);
    setIsEditing(false);
  }

  return (
    <main>
      <header>
        <img
          className="profile-avatar"
          src={avatarSource}
          alt={`${user.username}'s avatar`}
        />

        <p className="page-label">My account</p>

        <h1>Welcome, {user.username}!</h1>

        <p>
          This account can listen to music, create playlists, and publish
          tracks.
        </p>
      </header>

      <section
        className="profile-card"
        aria-labelledby="profile-information-title"
      >
        <div className="profile-heading">
          <h2 id="profile-information-title">Profile information</h2>

          {!isEditing && (
            <button
              type="button"
              onClick={() => {
                setIsEditing(true);
              }}
            >
              Edit profile
            </button>
          )}
        </div>

        {isEditing ? (
          <EditProfileForm
            user={user}
            onSave={handleSave}
            onCancel={() => {
              setIsEditing(false);
            }}
          />
        ) : (
          <dl className="profile-information">
            <div>
              <dt>Username</dt>
              <dd>{user.username}</dd>
            </div>

            <div>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>

            <div>
              <dt>Bio</dt>
              <dd>{user.bio || "No bio provided."}</dd>
            </div>

            <div>
              <dt>Member since</dt>
              <dd>{creationDate}</dd>
            </div>
          </dl>
        )}
      </section>
    </main>
  );
}

export default ProfilePage;
