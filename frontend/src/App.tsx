import { useEffect, useState } from "react";

import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import RegisterPage from "./pages/RegisterPage";
import CatalogPage from "./pages/CatalogPage";
import PlaylistsPage from "./pages/PlaylistsPage";
import UsersPage from "./pages/UsersPage";

import type { AuthenticatedUser, PublicUser } from "./types/auth";
import { useLibrary } from "./hooks/useLibrary";

import { clearAccessToken, onSessionCleared } from "./services/session";
import {
  addFriend,
  getFriends,
  getUsers,
  removeFriend,
  updateMyProfile,
  uploadMyAvatar,
  markPresenceOffline,
  sendPresenceHeartbeat,
} from "./services/users";

import "./App.css";

type PublicPage = "register" | "login";

type PrivatePage = "profile" | "catalog" | "playlists" | "users";

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error) {
    return error.name === "SyntaxError" ? fallbackMessage : error.message;
  }

  return fallbackMessage;
}

function App() {
  const [currentPage, setCurrentPage] = useState<PublicPage>("register");

  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(
    null,
  );

  const [users, setUsers] = useState<PublicUser[]>([]);

  const [privatePage, setPrivatePage] = useState<PrivatePage>("profile");

  const library = useLibrary(currentUser?.id ?? null);

  const [friends, setFriends] = useState<PublicUser[]>([]);

  const friendIds = friends.map((friend) => friend.id);

  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onSessionCleared(() => {
      setCurrentUser(null);
      setUsers([]);
      setFriends([]);
      setCurrentPage("login");
      setPrivatePage("profile");
      setErrorMessage("");
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (currentUser === null) {
      return;
    }

    let isCancelled = false;

    async function loadUserData() {
      try {
        const [loadedUsers, loadedFriends] = await Promise.all([
          getUsers(),
          getFriends(),
        ]);

        if (!isCancelled) {
          setUsers(loadedUsers);
          setFriends(loadedFriends);
          setErrorMessage("");
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(
            getErrorMessage(error, "Unable to load users and friends."),
          );
        }
      }
    }

    void loadUserData();

    return () => {
      isCancelled = true;
    };
  }, [currentUser]);

  useEffect(() => {
    if (currentUser === null) {
      return;
    }

    async function sendHeartbeat() {
      try {
        await sendPresenceHeartbeat();
        setErrorMessage("");
      } catch (error) {
        setErrorMessage(
          getErrorMessage(error, "Unable to update your online status."),
        );
      }
    }

    void sendHeartbeat();

    const intervalId = window.setInterval(() => {
      void sendHeartbeat();
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentUser]);

  useEffect(() => {
    if (currentUser === null) {
      return;
    }

    async function refreshUserData() {
      try {
        const [loadedUsers, loadedFriends] = await Promise.all([
          getUsers(),
          getFriends(),
        ]);

        setUsers(loadedUsers);
        setFriends(loadedFriends);
        setErrorMessage("");
      } catch (error) {
        setErrorMessage(
          getErrorMessage(error, "Unable to refresh users and friends."),
        );
      }
    }

    const intervalId = window.setInterval(() => {
      void refreshUserData();
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentUser]);

  function handleLoginSuccess(user: AuthenticatedUser) {
    setErrorMessage("");
    setCurrentUser(user);
    setPrivatePage("profile");
  }

  async function handleLogout(): Promise<void> {
    try {
      await markPresenceOffline();
    } catch {
      // Heartbeats stop after logout, so the backend will eventually mark the
      // user offline even if this best-effort request cannot be delivered.
    } finally {
      clearAccessToken();
    }
  }

  async function handleUpdateProfile(
    displayName: string,
    username: string,
    bio: string,
    avatarFile: File | null,
  ): Promise<void> {
    const profile = await updateMyProfile({
      displayName,
      username,
      bio: bio === "" ? null : bio,
    });

    setCurrentUser((currentUser) => {
      if (currentUser === null) {
        return null;
      }

      return {
        ...currentUser,
        id: profile.userId,
        displayName: profile.displayName,
        username: profile.username,
        bio: profile.bio,
        avatarUrl: profile.avatarUrl,
      };
    });

    if (avatarFile !== null) {
      try {
        const avatarProfile = await uploadMyAvatar(avatarFile);
        setCurrentUser((user) => user === null ? null : {
          ...user, avatarUrl: avatarProfile.avatarUrl,
        });
      } catch {
        throw new Error("Texte sauvegardé, avatar non envoyé. Réessayez l’envoi de l’avatar.");
      }
    }
  }

  async function refreshFriends(): Promise<void> {
    const loadedFriends = await getFriends();
    setFriends(loadedFriends);
  }

  async function handleAddFriend(userId: string): Promise<void> {
    setErrorMessage("");

    try {
      await addFriend(userId);
      await refreshFriends();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to add this friend."));
    }
  }

  async function handleRemoveFriend(userId: string): Promise<void> {
    setErrorMessage("");

    try {
      await removeFriend(userId);
      await refreshFriends();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to remove this friend."));
    }
  }

  if (currentUser !== null) {
    return (
      <>
        <header className="site-header">
          <strong className="site-title">FT Music</strong>

          <nav className="main-navigation" aria-label="User navigation">
            <button
              type="button"
              className={
                privatePage === "profile"
                  ? "navigation-button active"
                  : "navigation-button"
              }
              aria-pressed={privatePage === "profile"}
              onClick={() => {
                setPrivatePage("profile");
              }}
            >
              Profile
            </button>

            <button
              type="button"
              className={
                privatePage === "catalog"
                  ? "navigation-button active"
                  : "navigation-button"
              }
              aria-pressed={privatePage === "catalog"}
              onClick={() => {
                setPrivatePage("catalog");
              }}
            >
              Catalog
            </button>

            <button
              type="button"
              className={
                privatePage === "playlists"
                  ? "navigation-button active"
                  : "navigation-button"
              }
              aria-pressed={privatePage === "playlists"}
              onClick={() => {
                setPrivatePage("playlists");
              }}
            >
              Playlists
            </button>

            <button
              type="button"
              className={
                privatePage === "users"
                  ? "navigation-button active"
                  : "navigation-button"
              }
              aria-pressed={privatePage === "users"}
              onClick={() => {
                setPrivatePage("users");
              }}
            >
              Users
            </button>

            <button
              type="button"
              className="navigation-button"
              onClick={() => {
                void handleLogout();
              }}
            >
              Log out
            </button>
          </nav>
        </header>

        {errorMessage && (
          <p className="message error-message" role="alert">
            {errorMessage}
          </p>
        )}

        {privatePage === "profile" && (
          <ProfilePage
            user={currentUser}
            friends={friends}
            onUpdateProfile={handleUpdateProfile}
            onRemoveFriend={handleRemoveFriend}
          />
        )}

        {privatePage === "catalog" && (
          <CatalogPage
            key={currentUser.id}
            playlists={library.playlists}
            onAddItem={library.addItem}
          />
        )}

        {privatePage === "playlists" && (
          <PlaylistsPage
            key={currentUser.id}
            playlists={library.playlists}
            loading={library.loading}
            error={library.error}
            onRetry={library.reload}
            onCreate={library.create}
            onRemoveItem={library.removeItem}
            onUpdate={library.update}
            onDelete={library.remove}
          />
        )}

        {privatePage === "users" && (
          <UsersPage
            users={users}
            friendIds={friendIds}
            onAddFriend={handleAddFriend}
            onRemoveFriend={handleRemoveFriend}
          />
        )}
      </>
    );
  }

  return (
    <>
      <header className="site-header">
        <strong className="site-title">FT Music</strong>

        <nav className="main-navigation" aria-label="Authentication">
          <button
            type="button"
            className={
              currentPage === "register"
                ? "navigation-button active"
                : "navigation-button"
            }
            aria-pressed={currentPage === "register"}
            onClick={() => {
              setCurrentPage("register");
            }}
          >
            Register
          </button>

          <button
            type="button"
            className={
              currentPage === "login"
                ? "navigation-button active"
                : "navigation-button"
            }
            aria-pressed={currentPage === "login"}
            onClick={() => {
              setCurrentPage("login");
            }}
          >
            Login
          </button>
        </nav>
      </header>

      {currentPage === "register" ? (
        <RegisterPage />
      ) : (
        <LoginPage onLoginSuccess={handleLoginSuccess} />
      )}
    </>
  );
}

export default App;
