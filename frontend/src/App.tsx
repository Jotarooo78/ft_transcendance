import { useState } from "react";

import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import RegisterPage from "./pages/RegisterPage";
import CatalogPage from "./pages/CatalogPage";

import type { AuthenticatedUser } from "./types/auth";

import "./App.css";

type PublicPage = "register" | "login";

type PrivatePage = "profile" | "catalog";

function App() {
  const [currentPage, setCurrentPage] = useState<PublicPage>("register");

  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(
    null,
  );

  const [privatePage, setPrivatePage] = useState<PrivatePage>("profile");

  function handleLoginSuccess(user: AuthenticatedUser) {
    setCurrentUser(user);
    setPrivatePage("profile");
  }

  function handleLogout() {
    setCurrentUser(null);
    setCurrentPage("login");
    setPrivatePage("profile");
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

        {privatePage === "profile" ? (
          <ProfilePage user={currentUser} />
        ) : (
          <CatalogPage />
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
