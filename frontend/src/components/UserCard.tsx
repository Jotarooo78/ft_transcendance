import type { PublicUser } from "../types/auth";

type UserCardProps = {
  user: PublicUser;
};

function UserCard({ user }: UserCardProps) {
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
      </div>
    </article>
  );
}

export default UserCard;
