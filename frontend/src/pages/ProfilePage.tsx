import { useState } from "react";

import type { AuthenticatedUser, PublicUser } from "../types/auth";
import EditProfileForm from "../components/EditProfileForm";

type ProfilePageProps = {
  user: AuthenticatedUser;
  friends: PublicUser[];

  onUpdateProfile: (
    username: string,
    bio: string,
    avatarFile: File | null,
  ) => void;

  onRemoveFriend: (userId: string) => void;
};

function ProfilePage({
  user,
  friends,
  onUpdateProfile,
  onRemoveFriend,
}: ProfilePageProps) {
  const creationDate = new Intl.DateTimeFormat("en", {
    dateStyle: "long",
  }).format(new Date(user.createdAt));

  const avatarSource = user.avatarUrl ?? "/images/default-avatar.svg";

  const [isEditing, setIsEditing] = useState(false);

  function handleSave(username: string, bio: string, avatarFile: File | null) {
    onUpdateProfile(username, bio, avatarFile);

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

      <section className="friends-section" aria-labelledby="friends-title">
        <div className="friends-heading">
          <h2 id="friends-title">Friends</h2>

          <span>{friends.length} friend(s)</span>
        </div>

        {friends.length === 0 ? (
          <p className="empty-friends-message">You have no friends yet.</p>
        ) : (
          <div className="friend-list">
            {friends.map((friend) => {
              const friendavatarSource =
                friend.avatarUrl ?? "/images/default-avatar.svg";

              return (
                <article className="friend-card" key={friend.id}>
                  <img
                    className="friend-avatar"
                    src={friendavatarSource}
                    alt={`${friend.username}'s avatar`}
                  />

                  <div className="friend-information">
                    <h3>{friend.username}</h3>

                    <span
                      className={
                        friend.isOnline
                          ? "user-status online"
                          : "user-status offline"
                      }
                    >
                      <span className="status-indicator" aria-hidden="true" />

                      {friend.isOnline ? "Online" : "Offline"}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="remove-friend-button"
                    onClick={() => {
                      onRemoveFriend(friend.id);
                    }}
                    aria-label={`Remove ${friend.username} from friends`}
                  >
                    Remove
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

export default ProfilePage;
