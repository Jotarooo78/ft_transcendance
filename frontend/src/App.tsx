import { useResource } from "./hooks/useResource";
import RefreshNotice from "./components/RefreshNotice";
import CollectionsProvider from "./components/CollectionsProvider";
import LibraryPage from "./pages/LibraryPage";
import PublicPlaylistPage from "./pages/PublicPlaylistPage";
import MusicPlayerProvider from "./components/MusicPlayerProvider";
import ProjectPage from "./pages/ProjectPage";
import ArtistPage from "./pages/ArtistPage";
import { useMusicRoute } from "./hooks/useMusicRoute";
import { useCallback, useEffect, useState } from "react";

import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import RegisterPage from "./pages/RegisterPage";
import CatalogPage from "./pages/CatalogPage";
import PlaylistsPage from "./pages/PlaylistsPage";
import UsersPage from "./pages/UsersPage";
import HistoryPage from "./pages/HistoryPage";
import FilesPage from "./pages/FilesPage";

import type { AuthenticatedUser } from "./types/auth";
import { useLibrary } from "./hooks/useLibrary";

import { clearAccessToken, onSessionCleared } from "./services/session";
import {
  addFriend,
  getFriends,
  getUsers,
  removeFriend,
  updateMyProfile,
  uploadMyAvatar,
  deleteMyAvatar,
  markPresenceOffline,
  sendPresenceHeartbeat,
} from "./services/users";
import type { AvatarUploadProgress } from "./services/users";

import "./App.css";

type PublicPage = "register" | "login";

/**
 * Pages privées nécessitant une session du compte ; files et history complètent les écrans de profil
 * et de playlists.
 */
type PrivatePage =
  | "profile"
  | "catalog"
  | "playlists"
  | "library"
  | "history"
  | "users"
  | "files";

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error) {
    return error.name === "SyntaxError" ? fallbackMessage : error.message;
  }

  return fallbackMessage;
}

/** Assemble les pages et limite les relectures aux données utilisées par l’écran courant. */
function App() {
  const musicRoute = useMusicRoute();
  const [currentPage, setCurrentPage] = useState<PublicPage>("register");

  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(
    null,
  );

  const [privatePage, setPrivatePage] = useState<PrivatePage>("profile");

  /** Revient à un onglet principal sans interrompre le lecteur commun. */
  function navigate(page: PrivatePage) {
    window.location.hash = "";
    setPrivatePage(page);
  }

  /** Playlists persistantes du compte ; un changement de compte invalide les réponses précédentes. */
  const musicVisible =
    !!musicRoute ||
    ["catalog", "library", "playlists", "history"].includes(privatePage);
  const library = useLibrary(currentUser?.id ?? null, musicVisible);

  const ownerId = currentUser?.id ?? null;
  const userDataVisible =
    !!ownerId && !musicRoute && ["profile", "users"].includes(privatePage);
  /** Le répertoire complet ne sert qu’à Users ; Profil utilise uniquement les amis. */
  const directoryVisible = !!ownerId && !musicRoute && privatePage === "users";
  const userData = useResource(
    useCallback(
      async (signal) => {
        if (!ownerId) return { users: [], friends: [] };
        const [users, friends] = await Promise.all([
          directoryVisible ? getUsers(signal) : Promise.resolve([]),
          getFriends(signal),
        ]);
        return { users, friends };
      },
      [ownerId, directoryVisible],
    ),
    userDataVisible,
  );
  const users = userData.data?.users ?? [],
    friends = userData.data?.friends ?? [];

  const friendIds = friends.map((friend) => friend.id);

  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onSessionCleared(() => {
      setCurrentUser(null);
      setCurrentPage("login");
      navigate("profile");
      setErrorMessage("");
    });

    return unsubscribe;
  }, []);

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

  function handleLoginSuccess(user: AuthenticatedUser) {
    setErrorMessage("");
    setCurrentUser(user);
    navigate("profile");
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

  /** Enregistre le profil puis actualise le répertoire après chaque confirmation, y compris l’avatar. */
  async function handleUpdateProfile(
    displayName: string,
    username: string,
    bio: string,
    avatarFile: File | null,
    removeAvatar: boolean,
    onAvatarProgress: (progress: AvatarUploadProgress) => void,
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

    userData.reload();

    // Le texte a déjà été confirmé. L’avatar est une seconde opération : son échec conserve le texte sauvegardé.
    if (avatarFile !== null) {
      try {
        const avatarProfile = await uploadMyAvatar(
          avatarFile,
          onAvatarProgress,
        );
        setCurrentUser((user) =>
          user === null
            ? null
            : {
                ...user,
                avatarUrl: avatarProfile.avatarUrl,
              },
        );
        userData.reload();
      } catch {
        throw new Error(
          "Profile saved, but the avatar was not uploaded. Please try uploading it again.",
        );
      }
    } else if (removeAvatar) {
      try {
        const avatarProfile = await deleteMyAvatar();

        setCurrentUser((user) =>
          user === null
            ? null
            : {
                ...user,
                avatarUrl: avatarProfile.avatarUrl,
              },
        );
        userData.reload();
      } catch {
        throw new Error(
          "Profile saved, but the avatar was not removed. Please try again.",
        );
      }
    }
  }

  /** Modifie la relation puis relit sans laisser un ancien GET écraser la confirmation. */
  async function handleAddFriend(userId: string): Promise<void> {
    setErrorMessage("");

    const resume = userData.pause();
    try {
      await addFriend(userId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to add this friend."));
    } finally {
      resume();
    }
  }

  /** Retire la relation et reprend la lecture des amis après la mutation. */
  async function handleRemoveFriend(userId: string): Promise<void> {
    setErrorMessage("");

    const resume = userData.pause();
    try {
      await removeFriend(userId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to remove this friend."));
    } finally {
      resume();
    }
  }

  if (currentUser !== null) {
    return (
      <MusicPlayerProvider key={currentUser.id} accountId={currentUser.id}>
        <CollectionsProvider active={musicVisible}>
          <header className="site-header">
            <strong className="site-title">FT Music</strong>

            <nav className="main-navigation" aria-label="User navigation">
              <button
                className={
                  !musicRoute && privatePage === "library"
                    ? "navigation-button active"
                    : "navigation-button"
                }
                aria-pressed={!musicRoute && privatePage === "library"}
                onClick={() => navigate("library")}
              >
                Library
              </button>
              <button
                type="button"
                className={
                  privatePage === "files"
                    ? "navigation-button active"
                    : "navigation-button"
                }
                aria-pressed={!musicRoute && privatePage === "files"}
                onClick={() => navigate("files")}
              >
                Upload
              </button>
              <button
                type="button"
                className={
                  privatePage === "history"
                    ? "navigation-button active"
                    : "navigation-button"
                }
                aria-pressed={!musicRoute && privatePage === "history"}
                onClick={() => navigate("history")}
              >
                History
              </button>
              <button
                type="button"
                className={
                  privatePage === "profile"
                    ? "navigation-button active"
                    : "navigation-button"
                }
                aria-pressed={!musicRoute && privatePage === "profile"}
                onClick={() => {
                  navigate("profile");
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
                aria-pressed={!musicRoute && privatePage === "catalog"}
                onClick={() => {
                  navigate("catalog");
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
                aria-pressed={!musicRoute && privatePage === "playlists"}
                onClick={() => {
                  navigate("playlists");
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
                aria-pressed={!musicRoute && privatePage === "users"}
                onClick={() => {
                  navigate("users");
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

          {userDataVisible && (
            <RefreshNotice
              retained={!!userData.data}
              error={userData.error ?? userData.refreshError}
              retry={userData.reload}
            />
          )}
          {!musicRoute && privatePage === "library" && (
            <LibraryPage
              library={library}
              onUploads={() => navigate("files")}
            />
          )}
          {musicRoute?.kind === "playlists" && (
            <PublicPlaylistPage key={musicRoute.id} id={musicRoute.id} />
          )}
          {musicRoute?.kind === "projects" && (
            <ProjectPage key={musicRoute.id} id={musicRoute.id} />
          )}
          {musicRoute?.kind === "artists" && (
            <ArtistPage key={musicRoute.id} id={musicRoute.id} />
          )}
          {errorMessage && (
            <p className="message error-message" role="alert">
              {errorMessage}
            </p>
          )}

          {!musicRoute && privatePage === "profile" && (
            <ProfilePage
              user={currentUser}
              friends={friends}
              onUpdateProfile={handleUpdateProfile}
              onRemoveFriend={handleRemoveFriend}
            />
          )}

          {!musicRoute && privatePage === "catalog" && (
            <CatalogPage
              key={currentUser.id}
              playlists={library.playlists}
              onAddItem={library.addItem}
            />
          )}

          {!musicRoute && privatePage === "playlists" && (
            <PlaylistsPage
              key={currentUser.id}
              playlists={library.playlists}
              loading={library.loading}
              error={library.error}
              refreshError={library.refreshError}
              onRetry={library.reload}
              onCreate={library.create}
              onRemoveItem={library.removeItem}
              onUpdate={library.update}
              onDelete={library.remove}
            />
          )}

          {/* La clé du compte remonte les écrans privés pour libérer les états et aperçus de l’ancien compte. */}
          {!musicRoute && privatePage === "history" && (
            <HistoryPage key={currentUser.id} />
          )}
          {!musicRoute && privatePage === "files" && (
            <FilesPage key={currentUser.id} user={currentUser} />
          )}

          {!musicRoute && privatePage === "users" && (
            <UsersPage
              users={users}
              friendIds={friendIds}
              onAddFriend={handleAddFriend}
              onRemoveFriend={handleRemoveFriend}
            />
          )}
        </CollectionsProvider>
      </MusicPlayerProvider>
    );
  }

  if (musicRoute)
    return (
      <MusicPlayerProvider>
        <header className="site-header">
          <strong className="site-title">FT Music</strong>
          <button
            onClick={() => {
              window.location.hash = "";
              setCurrentPage("login");
            }}
          >
            Sign in
          </button>
        </header>
        {musicRoute.kind === "playlists" ? (
          <PublicPlaylistPage key={musicRoute.id} id={musicRoute.id} />
        ) : musicRoute.kind === "projects" ? (
          <ProjectPage key={musicRoute.id} id={musicRoute.id} />
        ) : (
          <ArtistPage key={musicRoute.id} id={musicRoute.id} />
        )}
      </MusicPlayerProvider>
    );

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
