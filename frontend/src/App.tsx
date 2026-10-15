import { translate as t, translateError } from "./services/translate";
import { useLanguage } from "./hooks/useLanguage";
import { useResource } from "./hooks/useResource";
import LanguageSelector from "./components/LanguageSelector";
import RefreshNotice from "./components/RefreshNotice";
import CollectionsProvider from "./components/CollectionsProvider";
import LibraryPage from "./pages/LibraryPage";
import PublicPlaylistPage from "./pages/PublicPlaylistPage";
import MusicPlayerProvider from "./components/MusicPlayerProvider";
import ProjectPage from "./pages/ProjectPage";
import ArtistPage from "./pages/ArtistPage";
import { useMusicRoute } from "./hooks/useMusicRoute";
import { readMusicRoute } from "./services/music-navigation";
import { useCallback, useEffect, useState } from "react";

import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import RegisterPage from "./pages/RegisterPage";
import CatalogPage from "./pages/CatalogPage";
import LibraryViewProvider from "./components/LibraryViewProvider";
import UsersPage from "./pages/UsersPage";
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
import "./styles/playlists.css";

type PublicPage = "register" | "login";

/**
 * Pages privées nécessitant une session du compte ; files et history complètent les écrans de profil
 * et de playlists.
 */
type PrivatePage = "profile" | "catalog" | "library" | "users" | "files";

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error) {
    return error.name === "SyntaxError" ? fallbackMessage : error.message;
  }

  return fallbackMessage;
}

/** Assemble les pages et limite les relectures aux données utilisées par l’écran courant. */
function App() {
  useLanguage();
  const musicRoute = useMusicRoute();
  const [currentPage, setCurrentPage] = useState<PublicPage>("register");

  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(
    null,
  );

  const [privatePage, setPrivatePage] = useState<PrivatePage>("profile");
  const [lastLibrarySection, setLastLibrarySection] = useState("track");
  useEffect(() => {
    /** Retient aussi une section quittée en ouvrant une carte, sans conserver son contenu privé. */
    function rememberSection() {
      const route = readMusicRoute();
      if (route?.kind === "library")
        setLastLibrarySection(route.id.split("/")[0]);
    }
    window.addEventListener("hashchange", rememberSection);
    return () => window.removeEventListener("hashchange", rememberSection);
  }, []);
  const libraryVisible =
    musicRoute?.kind === "library" ||
    (!musicRoute && privatePage === "library");

  /** Revient à un onglet principal sans interrompre le lecteur commun. */
  function navigate(page: PrivatePage) {
    const section =
      musicRoute?.kind === "library"
        ? musicRoute.id.split("/")[0]
        : lastLibrarySection;
    if (musicRoute?.kind === "library")
      setLastLibrarySection(musicRoute.id.split("/")[0]);
    window.location.hash = page === "library" ? `/library/${section}` : "";
    setPrivatePage(page);
  }

  /** Playlists persistantes du compte ; un changement de compte invalide les réponses précédentes. */
  const musicVisible =
    !!musicRoute || ["catalog", "library"].includes(privatePage);
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
      window.location.hash = "";
      setPrivatePage("profile");
      setLastLibrarySection("track");
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
        <LibraryViewProvider>
          <CollectionsProvider active={musicVisible}>
            <header className="site-header">
              <strong className="site-title">FT Music</strong>
              <LanguageSelector />

              <nav
                className="main-navigation"
                aria-label={t("User navigation")}
              >
                <button
                  className={
                    libraryVisible
                      ? "navigation-button active"
                      : "navigation-button"
                  }
                  aria-pressed={libraryVisible}
                  onClick={() => navigate("library")}
                >
                  {" "}
                  {t("Library")}{" "}
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
                  {" "}
                  {t("Upload")}{" "}
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
                  {" "}
                  {t("Profile")}{" "}
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
                  {" "}
                  {t("Catalog")}{" "}
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
                  {" "}
                  {t("Users")}{" "}
                </button>

                <button
                  type="button"
                  className="navigation-button"
                  onClick={() => {
                    void handleLogout();
                  }}
                >
                  {" "}
                  {t("Log out")}{" "}
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
            {libraryVisible && (
              <LibraryPage
                library={library}
                route={
                  musicRoute?.kind === "library"
                    ? musicRoute.id
                    : lastLibrarySection
                }
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
                {translateError(errorMessage)}
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

            {/* La clé du compte remonte les écrans privés pour libérer les états et aperçus de l’ancien compte. */}
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
        </LibraryViewProvider>
      </MusicPlayerProvider>
    );
  }

  if (musicRoute && musicRoute.kind !== "library")
    return (
      <MusicPlayerProvider>
        <header className="site-header">
          <strong className="site-title">FT Music</strong>
          <LanguageSelector />
          <button
            onClick={() => {
              window.location.hash = "";
              setCurrentPage("login");
            }}
          >
            {" "}
            {t("Sign in")}{" "}
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
        <LanguageSelector />

        <nav className="main-navigation" aria-label={t("Authentication")}>
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
            {" "}
            {t("Register")}{" "}
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
            {" "}
            {t("Login")}{" "}
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
