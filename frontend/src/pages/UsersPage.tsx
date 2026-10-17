import { translate as t } from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
import UserCard from "../components/UserCard";
import type { PublicUser } from "../types/auth";

type UsersPageProps = {
  users: PublicUser[];
  friendIds: string[];
  onAddFriend: (userId: string) => void;
  onRemoveFriend: (userId: string) => void;
  /** Ouvre la messagerie sur la conversation avec cet ami. */
  onMessage: (userId: string) => Promise<void>;
};

/** Affiche UsersPage dans la langue choisie en conservant son état. */
function UsersPage({
  users,
  friendIds,
  onAddFriend,
  onRemoveFriend,
  onMessage,
}: UsersPageProps) {
  useLanguage();
  return (
    <main className="users-page">
      <header>
        <p className="page-label">{t("Community")}</p>

        <h1>{t("Users")}</h1>

        <p>{t("Discover other members of the music community.")}</p>
      </header>

      <section className="users-section" aria-labelledby="users-title">
        <h2 id="users-title">{t("Community members")}</h2>

        {users.length === 0 ? (
          <p className="empty-users-message">{t("No users are available.")}</p>
        ) : (
          <div className="user-list">
            {users.map((user) => {
              const isFriend = friendIds.includes(user.id);

              return (
                <UserCard
                  key={user.id}
                  user={user}
                  isFriend={isFriend}
                  onAddFriend={onAddFriend}
                  onRemoveFriend={onRemoveFriend}
                  onMessage={onMessage}
                />
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

export default UsersPage;
