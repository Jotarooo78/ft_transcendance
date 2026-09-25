import { useState } from "react";

import type { AuthenticatedUser, PublicUser } from "../types/auth";
import EditProfileForm from "../components/EditProfileForm";

type ProfilePageProps = {
  user: AuthenticatedUser;
  friends: PublicUser[];

  onUpdateProfile: (
    displayName: string,
    username: string,
    bio: string,
    avatarFile: File | null
  ) => void;

  onRemoveFriend: (userId: string) => void;
};

function ProfilePage({
  user,
  friends,
  onUpdateProfile,
  onRemoveFriend,
}: ProfilePageProps) {
  const avatarSource = user.avatarUrl ?? "/images/default-avatar.svg";
  const profileBio = user.bio?.trim();

  const [isEditing, setIsEditing] = useState(false);

  function handleSave(
    displayName: string,
    username: string,
    bio: string,
    avatarFile: File | null
  ) {
    onUpdateProfile(displayName, username, bio, avatarFile);
    setIsEditing(false);
  }

  return (
    <main>
      <section className="profile-card" aria-labelledby="profile-name">
        <div className="profile-cover" aria-hidden="true" />

        {!isEditing && (
          <button
            className="edit-profile-button"
            type="button"
            aria-label="Edit profile"
            title="Edit profile"
            onClick={() => {
              setIsEditing(true);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M4 16.5V20h3.5L18.1 9.4l-3.5-3.5L4 16.5Zm16.7-9.7a1 1 0 0 0 0-1.4l-2.1-2.1a1 1 0 0 0-1.4 0l-1.6 1.6 3.5 3.5 1.6-1.6Z" />
            </svg>
          </button>
        )}

        <div className="profile-summary">
          <img
            className="profile-avatar"
            src={avatarSource}
            alt={`${user.displayName}'s avatar`}
          />

          <div className="profile-identity">
            <h1 id="profile-name">{user.displayName}</h1>
            <p>@{user.username}</p>
          </div>
        </div>

        {!isEditing && (
          <>
            {profileBio && <p className="profile-bio">{profileBio}</p>}

            <div className="profile-stats" aria-label="Profile statistics">
              <span>
                <strong>{friends.length}</strong>
                {friends.length === 1 ? " friend" : " friends"}
              </span>
            </div>
          </>
        )}

        {isEditing ? (
          <EditProfileForm
            user={user}
            onSave={handleSave}
            onCancel={() => {
              setIsEditing(false);
            }}
          />
        ) : null}
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
