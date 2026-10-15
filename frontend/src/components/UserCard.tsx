import { translate as t } from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
import { getAvatarSource } from "../avatar";
import type { PublicUser } from "../types/auth";

type UserCardProps = {
  user: PublicUser;
  isFriend: boolean;
  onAddFriend: (userId: string) => void;
  onRemoveFriend: (userId: string) => void;
};

/** Affiche UserCard dans la langue choisie en conservant son état. */
function UserCard({
  user,
  isFriend,
  onAddFriend,
  onRemoveFriend,
}: UserCardProps) {
  useLanguage();
  const avatarSource = getAvatarSource(user.avatarUrl);

  return (
    <article className="user-card">
      <img
        className="user-card-avatar"
        src={avatarSource}
        alt={t("{0}'s avatar", { "0": user.username })}
      />

      <div className="user-card-information">
        <h2>{user.username}</h2>

        <p>{user.bio || t("No bio provided.")}</p>

        <span
          className={
            user.isOnline ? "user-status online" : "user-status offline"
          }
        >
          <span className="status-indicator" aria-hidden="true" />

          {user.isOnline ? t("Online") : t("Offline")}
        </span>

        <button
          type="button"
          className={
            isFriend ? "friend-button remove-friend-button" : "friend-button"
          }
          onClick={() => {
            if (isFriend) {
              onRemoveFriend(user.id);
            } else {
              onAddFriend(user.id);
            }
          }}
        >
          {isFriend ? t("Remove friend") : t("Add friend")}
        </button>
      </div>
    </article>
  );
}

export default UserCard;
