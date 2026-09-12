import { useState } from "react";

import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import RegisterPage from "./pages/RegisterPage";
import CatalogPage from "./pages/CatalogPage";
import PlaylistsPage from "./pages/PlaylistsPage";

import { mockPlaylists } from "./data/playlists";
import type { AuthenticatedUser } from "./types/auth";
import type { Playlist } from "./types/music";

import "./App.css";

type PublicPage = "register" | "login";

type PrivatePage = "profile" | "catalog" | "playlists";

function App() {
  const [currentPage, setCurrentPage] = useState<PublicPage>("register");

  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(
    null,
  );

  const [privatePage, setPrivatePage] = useState<PrivatePage>("profile");

  const [playlists, setPlaylists] = useState<Playlist[]>(mockPlaylists);

  function handleLoginSuccess(user: AuthenticatedUser) {
    setCurrentUser(user);
    setPrivatePage("profile");
  }

  function handleLogout() {
    setCurrentUser(null);
    setCurrentPage("login");
    setPrivatePage("profile");
  }

  function handleCreatePlaylist(playlist: Playlist) {
    setPlaylists((currentPlaylists) => [...currentPlaylists, playlist]);
  }

  function handleAddTrackToPlaylist(playlistId: string, trackId: string) {
    setPlaylists((currentPlaylists) =>
      currentPlaylists.map((playlist) => {
        if (playlist.id !== playlistId) {
          return playlist;
        }

        if (playlist.trackIds.includes(trackId)) {
          return playlist;
        }

        return {
          ...playlist,
          trackIds: [...playlist.trackIds, trackId],
        };
      }),
    );
  }

  function handleRemoveTrackFromPlaylist(playlistId: string, trackId: string) {
    setPlaylists((currentPlaylists) =>
      currentPlaylists.map((playlist) =>
        playlist.id === playlistId
          ? {
              ...playlist,
              trackIds: playlist.trackIds.filter((id) => id !== trackId),
            }
          : playlist,
      ),
    );
  }

  function handleDeletePlaylist(playlistId: string) {
    setPlaylists((currentPlaylists) =>
      currentPlaylists.filter((playlist) => playlist.id !== playlistId),
    );
  }

  function handleUpdatePlaylist(
    playlistId: string,
    name: string,
    description: string,
  ) {
    setPlaylists((currentPlaylists) =>
      currentPlaylists.map((playlist) =>
        playlist.id === playlistId
          ? { ...playlist, name, description }
          : playlist,
      ),
    );
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

            <span>Connected as {currentUser.username}</span>

            <button
              type="button"
              className="navigation-button"
              onClick={handleLogout}
            >
              Log out
            </button>
          </nav>
        </header>

        {privatePage === "profile" && <ProfilePage user={currentUser} />}

        {privatePage === "catalog" && (
          <CatalogPage
            playlists={playlists}
            onAddTrackToPlaylist={handleAddTrackToPlaylist}
          />
        )}

        {privatePage === "playlists" && (
          <PlaylistsPage
            playlists={playlists}
            onCreatePlaylist={handleCreatePlaylist}
            onRemoveTrack={handleRemoveTrackFromPlaylist}
            onDeletePlaylist={handleDeletePlaylist}
            onUpdatePlaylist={handleUpdatePlaylist}
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
