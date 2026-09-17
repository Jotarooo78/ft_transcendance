import UserCard from "../components/UserCard";
import type { PublicUser } from "../types/auth";

type UsersPageProps = {
  users: PublicUser[];
};

function UsersPage({ users }: UsersPageProps) {
  return (
    <main className="users-page">
      <header>
        <p className="page-label">Community</p>

        <h1>Users</h1>

        <p>Discover other members of the music community.</p>
      </header>

      <section className="users-section" aria-labelledby="users-title">
        <h2 id="users-title">Community members</h2>

        {users.length === 0 ? (
          <p className="empty-users-message">No users are available.</p>
        ) : (
          <div className="user-list">
            {users.map((user) => (
              <UserCard key={user.id} user={user} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default UsersPage;
