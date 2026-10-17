import { translate as t, translateCount } from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
import { getAvatarSource } from "../avatar";
import { useState } from "react";
import type { AuthenticatedUser, PublicUser } from "../types/auth";
import EditProfileForm from "../components/EditProfileForm";
import type { AvatarUploadProgress } from "../services/users";

type ProfilePageProps = {
  user: AuthenticatedUser;
  friends: PublicUser[];

  onUpdateProfile: (
    displayName: string,
    username: string,
    bio: string,
    avatarFile: File | null,
    removeAvatar: boolean,
    onAvatarProgress: (progress: AvatarUploadProgress) => void,
  ) => Promise<void>;

  onRemoveFriend: (userId: string) => void;
  /** Ouvre la messagerie sur la conversation avec cet ami. */
  onMessage: (userId: string) => Promise<void>;
};

/** Affiche ProfilePage dans la langue choisie en conservant son état. */
function ProfilePage({
  user,
  friends,
  onUpdateProfile,
  onRemoveFriend,
  onMessage,
}: ProfilePageProps) {
  useLanguage();
  const avatarSource = getAvatarSource(user.avatarUrl);
  const profileBio = user.bio?.trim();

  const [isEditing, setIsEditing] = useState(false);

  async function handleSave(
    displayName: string,
    username: string,
    bio: string,
    avatarFile: File | null,
    removeAvatar: boolean,
    onAvatarProgress: (progress: AvatarUploadProgress) => void,
  ) {
    await onUpdateProfile(
      displayName,
      username,
      bio,
      avatarFile,
      removeAvatar,
      onAvatarProgress,
    );
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
            aria-label={t("Edit profile")}
            title={t("Edit profile")}
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
            alt={t("{0}'s avatar", { "0": user.displayName })}
          />

          <div className="profile-identity">
            <h1 id="profile-name">{user.displayName}</h1>
            <p>@{user.username}</p>
          </div>
        </div>

        {!isEditing && (
          <>
            {profileBio && <p className="profile-bio">{profileBio}</p>}

            <div className="profile-stats" aria-label={t("Profile statistics")}>
              <span>
                <strong>{translateCount(friends.length, "friend")}</strong>
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
          <h2 id="friends-title">{t("Friends")}</h2>

          <span>{translateCount(friends.length, "friend")}</span>
        </div>

        {friends.length === 0 ? (
          <p className="empty-friends-message">
            {t("You have no friends yet.")}
          </p>
        ) : (
          <div className="friend-list">
            {friends.map((friend) => {
              const friendAvatarSource = getAvatarSource(friend.avatarUrl);

              return (
                <article className="friend-card" key={friend.id}>
                  <img
                    className="friend-avatar"
                    src={friendAvatarSource}
                    alt={t("{0}'s avatar", { "0": friend.username })}
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

                      {friend.isOnline ? t("Online") : t("Offline")}
                    </span>
                  </div>

                  <div className="friend-actions">
                    <button
                      type="button"
                      className="message-friend-button"
                      onClick={() => {
                        onMessage(friend.id);
                      }}
                      aria-label={t("Message {0}", { "0": friend.username })}
                    >
                      {t("Message")}
                    </button>
                    <button
                      type="button"
                      className="remove-friend-button"
                      onClick={() => {
                        onRemoveFriend(friend.id);
                      }}
                      aria-label={t("Remove {0} from friends", {
                        "0": friend.username,
                      })}
                    >
                      {" "}
                      {t("Remove")}{" "}
                    </button>
                  </div>
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
