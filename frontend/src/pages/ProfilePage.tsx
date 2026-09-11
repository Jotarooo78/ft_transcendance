import type { AuthenticatedUser } from "../types/auth";

type ProfilePageProps = {
  user: AuthenticatedUser;
};

function ProfilePage({ user }: ProfilePageProps) {
  const creationDate = new Intl.DateTimeFormat("en", {
    dateStyle: "long",
  }).format(new Date(user.createdAt));

  return (
    <main>
      <header>
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
        <h2 id="profile-information-title">Profile information</h2>

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
            <dt>Member since</dt>
            <dd>{creationDate}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}

export default ProfilePage;
