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
import { useLegalRoute } from "./hooks/useLegalRoute";
import { readMusicRoute } from "./services/music-navigation";
import LegalPage from "./pages/LegalPage";
import SiteFooter from "./components/SiteFooter";
import { useCallback, useEffect, useState } from "react";

import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import RegisterPage from "./pages/RegisterPage";
import CatalogPage from "./pages/CatalogPage";
import LibraryViewProvider from "./components/LibraryViewProvider";
import UsersPage from "./pages/UsersPage";
import FilesPage from "./pages/FilesPage";
import MessagesPage from "./pages/MessagesPage";
import ChatProvider from "./components/ChatProvider";
import MessagesNavButton from "./components/MessagesNavButton";

import type { AuthenticatedUser } from "./types/auth";
import type { ChatConversation } from "./types/chat";
import { openConversation } from "./services/chat";
import { useLibrary } from "./hooks/useLibrary";

import {
  clearAccessToken,
  getAccessToken,
  onSessionCleared,
} from "./services/session";
import { restoreSession } from "./services/auth";
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
import "./styles/messages.css";
import "./styles/legal.css";

type PublicPage = "register" | "login";

/**
 * Pages privées nécessitant une session du compte ; files et history complètent les écrans de profil
 * et de playlists.
 */
type PrivatePage =
  | "profile"
  | "catalog"
  | "library"
  | "users"
  | "files"
  | "messages";

/** Onglets que l'on peut retrouver après un rechargement. */
const privatePages: PrivatePage[] = [
  "profile",
  "catalog",
  "library",
  "users",
  "files",
  "messages",
];
/** Clé de l'onglet ouvert dans `sessionStorage`, propre à l'onglet du navigateur comme le jeton. */
const PAGE_STORAGE_KEY = "ft_private_page";

/** Onglet ouvert avant le rechargement, ou le profil par défaut. */
function readStoredPage(): PrivatePage {
  try {
    const page = globalThis.sessionStorage?.getItem(PAGE_STORAGE_KEY);
    return privatePages.find((item) => item === page) ?? "profile";
  } catch {
    return "profile";
  }
}

/** Retient l'onglet ouvert pour le retrouver après un rechargement ; null l'oublie. */
function storePage(page: PrivatePage | null): void {
  try {
    if (page === null) globalThis.sessionStorage?.removeItem(PAGE_STORAGE_KEY);
    else globalThis.sessionStorage?.setItem(PAGE_STORAGE_KEY, page);
  } catch {
    // Stockage bloqué : on revient simplement au profil après un rechargement.
  }
}

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
  /** Page légale ouverte depuis le pied de page ; elle remplace l’onglet sans fermer la session. */
  const legalRoute = useLegalRoute();
  /** Adresse qui prend la place des onglets principaux : contenu musical ou page légale. */
  const pageRoute = musicRoute ?? legalRoute;
  const [currentPage, setCurrentPage] = useState<PublicPage>("register");

  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(
    null,
  );

  const [privatePage, setPrivatePage] = useState<PrivatePage>(readStoredPage);
  /**
   * Reconnexion après un rechargement : « pending » tant que le profil n'est pas relu à partir du
   * jeton de l'onglet, « failed » si le serveur n'a pas pu répondre.
   */
  const [restoring, setRestoring] = useState<"idle" | "pending" | "failed">(
    getAccessToken() === null ? "idle" : "pending",
  );
  const [restoreAttempt, setRestoreAttempt] = useState(0);
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
    musicRoute?.kind === "library" || (!pageRoute && privatePage === "library");

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
    storePage(page);
  }

  /** Playlists persistantes du compte ; un changement de compte invalide les réponses précédentes. */
  const musicVisible =
    !!musicRoute || ["catalog", "library"].includes(privatePage);
  const library = useLibrary(currentUser?.id ?? null, musicVisible);

  const ownerId = currentUser?.id ?? null;
  const userDataVisible =
    !!ownerId &&
    !musicRoute &&
    ["profile", "users", "messages"].includes(privatePage);
  /** Le répertoire complet ne sert qu’à Users ; Profil utilise uniquement les amis. */
  const directoryVisible = !!ownerId && !pageRoute && privatePage === "users";
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
  /** Conversation ouverte depuis Utilisateurs ou Profil, affichée dès l'arrivée dans la messagerie. */
  const [chatStart, setChatStart] = useState<ChatConversation | null>(null);

  /** Affiche la messagerie sur une conversation déjà ouverte (après un partage de morceau). */
  function openChat(conversation: ChatConversation) {
    setErrorMessage("");
    setChatStart(conversation);
    navigate("messages");
  }

  /** Ouvre (ou retrouve) la conversation avec cet ami, puis affiche la messagerie dessus. */
  async function handleMessage(userId: string): Promise<void> {
    setErrorMessage("");
    try {
      const conversation = await openConversation(userId);
      setChatStart(conversation);
      navigate("messages");
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, "Unable to confirm this action. Please retry."),
      );
    }
  }

  /** Au chargement, reconnecte l'onglet s'il avait une session (jeton dans `sessionStorage`). */
  useEffect(() => {
    if (getAccessToken() === null) return;
    restoreSession().then(
      (user) => {
        if (user) setCurrentUser(user);
        setRestoring("idle");
      },
      () => {
        // Jeton refusé : il est déjà effacé et la page de connexion s'affiche. Sinon, panne.
        setRestoring(getAccessToken() === null ? "idle" : "failed");
      },
    );
  }, [restoreAttempt]);

  useEffect(() => {
    const unsubscribe = onSessionCleared(() => {
      setCurrentUser(null);
      setCurrentPage("login");
      window.location.hash = "";
      setPrivatePage("profile");
      setLastLibrarySection("track");
      storePage(null);
      setRestoring("idle");
      setErrorMessage("");
      setChatStart(null);
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
        <ChatProvider userId={currentUser.id} onOpenConversation={openChat}>
          <LibraryViewProvider>
            <CollectionsProvider active={musicVisible}>
              <header className="site-header">
                <strong className="site-title">FT GoodVibes</strong>
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
                      !pageRoute && privatePage === "files"
                        ? "navigation-button active"
                        : "navigation-button"
                    }
                    aria-pressed={!pageRoute && privatePage === "files"}
                    onClick={() => navigate("files")}
                  >
                    {" "}
                    {t("Upload")}{" "}
                  </button>
                  <button
                    type="button"
                    className={
                      !pageRoute && privatePage === "profile"
                        ? "navigation-button active"
                        : "navigation-button"
                    }
                    aria-pressed={!pageRoute && privatePage === "profile"}
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
                      !pageRoute && privatePage === "catalog"
                        ? "navigation-button active"
                        : "navigation-button"
                    }
                    aria-pressed={!pageRoute && privatePage === "catalog"}
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
                      !pageRoute && privatePage === "users"
                        ? "navigation-button active"
                        : "navigation-button"
                    }
                    aria-pressed={!pageRoute && privatePage === "users"}
                    onClick={() => {
                      navigate("users");
                    }}
                  >
                    {" "}
                    {t("Users")}{" "}
                  </button>

                  <MessagesNavButton
                    active={!pageRoute && privatePage === "messages"}
                    onClick={() => {
                      setChatStart(null);
                      navigate("messages");
                    }}
                  />

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
              {legalRoute && <LegalPage id={legalRoute} />}
              {errorMessage && (
                <p className="message error-message" role="alert">
                  {translateError(errorMessage)}
                </p>
              )}

              {!pageRoute && privatePage === "profile" && (
                <ProfilePage
                  user={currentUser}
                  friends={friends}
                  onUpdateProfile={handleUpdateProfile}
                  onRemoveFriend={handleRemoveFriend}
                  onMessage={handleMessage}
                />
              )}

              {!pageRoute && privatePage === "catalog" && (
                <CatalogPage
                  key={currentUser.id}
                  playlists={library.playlists}
                  onAddItem={library.addItem}
                />
              )}

              {/* La clé du compte remonte les écrans privés pour libérer les états et aperçus de l’ancien compte. */}
              {!pageRoute && privatePage === "files" && (
                <FilesPage key={currentUser.id} user={currentUser} />
              )}

              {!pageRoute && privatePage === "users" && (
                <UsersPage
                  users={users}
                  friendIds={friendIds}
                  onAddFriend={handleAddFriend}
                  onRemoveFriend={handleRemoveFriend}
                  onMessage={handleMessage}
                />
              )}

              {!pageRoute && privatePage === "messages" && (
                <MessagesPage
                  key={`${currentUser.id}:${chatStart?.id ?? ""}`}
                  user={currentUser}
                  friends={friends}
                  initialConversation={chatStart}
                />
              )}
              <SiteFooter />
            </CollectionsProvider>
          </LibraryViewProvider>
        </ChatProvider>
      </MusicPlayerProvider>
    );
  }

  if (restoring !== "idle")
    return (
      <>
        <header className="site-header">
          <strong className="site-title">FT GoodVibes</strong>
          <LanguageSelector />
        </header>
        <main>
          <header>
            <h1>{t("Welcome back")}</h1>
            <p role="status">
              {restoring === "pending"
                ? t("Restoring your session…")
                : t("Unable to restore your session.")}
            </p>
          </header>
          {restoring === "failed" && (
            <div className="edit-profile-actions">
              <button
                type="button"
                className="cancel-edit-button"
                onClick={() => clearAccessToken()}
              >
                {t("Sign in again")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRestoring("pending");
                  setRestoreAttempt((value) => value + 1);
                }}
              >
                {t("Retry")}
              </button>
            </div>
          )}
        </main>
        <SiteFooter />
      </>
    );

  if (musicRoute && musicRoute.kind !== "library")
    return (
      <MusicPlayerProvider>
        <header className="site-header">
          <strong className="site-title">FT GoodVibes</strong>
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
        <SiteFooter />
      </MusicPlayerProvider>
    );

  return (
    <>
      <header className="site-header">
        <strong className="site-title">FT GoodVibes</strong>
        <LanguageSelector />

        <nav className="main-navigation" aria-label={t("Authentication")}>
          <button
            type="button"
            className={
              !legalRoute && currentPage === "register"
                ? "navigation-button active"
                : "navigation-button"
            }
            aria-pressed={!legalRoute && currentPage === "register"}
            onClick={() => {
              window.location.hash = "";
              setCurrentPage("register");
            }}
          >
            {" "}
            {t("Register")}{" "}
          </button>

          <button
            type="button"
            className={
              !legalRoute && currentPage === "login"
                ? "navigation-button active"
                : "navigation-button"
            }
            aria-pressed={!legalRoute && currentPage === "login"}
            onClick={() => {
              window.location.hash = "";
              setCurrentPage("login");
            }}
          >
            {" "}
            {t("Login")}{" "}
          </button>
        </nav>
      </header>

      {legalRoute && <LegalPage id={legalRoute} />}
      {!legalRoute &&
        (currentPage === "register" ? (
          <RegisterPage />
        ) : (
          <LoginPage onLoginSuccess={handleLoginSuccess} />
        ))}
      <SiteFooter />
    </>
  );
}

export default App;
