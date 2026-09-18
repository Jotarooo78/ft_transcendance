import type { PublicUser } from "../types/auth";

type UserCardProps = {
  user: PublicUser;
  isFriend: boolean;
  onAddFriend: (userId: string) => void;
  onRemoveFriend: (userId: string) => void;
};

function UserCard({
  user,
  isFriend,
  onAddFriend,
  onRemoveFriend,
}: UserCardProps) {
  const avatarSource = user.avatarUrl ?? "/images/default-avatar.svg";

  return (
    <article className="user-card">
      <img
        className="user-card-avatar"
        src={avatarSource}
        alt={`${user.username}'s avatar`}
      />

      <div className="user-card-information">
        <h2>{user.username}</h2>

        <p>{user.bio || "No bio provided."}</p>

        <span
          className={
            user.isOnline ? "user-status online" : "user-status offline"
          }
        >
          <span className="status-indicator" aria-hidden="true" />

          {user.isOnline ? "Online" : "Offline"}
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
          {isFriend ? "Remove friend" : "Add friend"}
        </button>
      </div>
    </article>
  );
}

export default UserCard;
