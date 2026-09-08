import { useState } from "react";

import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import type {
  AuthenticatedUser,
} from "./types/auth";

import "./App.css";

type PublicPage =
  | "register"
  | "login";

function App() {
  const [currentPage, setCurrentPage] =
    useState<PublicPage>("register");

  const [currentUser, setCurrentUser] =
    useState<AuthenticatedUser | null>(null);

  function handleLoginSuccess(
    user: AuthenticatedUser,
  ) {
    setCurrentUser(user);
  }

  function handleLogout() {
    setCurrentUser(null);
    setCurrentPage("login");
  }

  if (currentUser !== null) {
    return (
      <>
        <header className="site-header">
          <strong className="site-title">
            FT Music
          </strong>

          <nav
            className="main-navigation"
            aria-label="User navigation"
          >
            <span>
              Connected as{" "}
              {currentUser.displayName}
            </span>

            <button
              type="button"
              className="navigation-button"
              onClick={handleLogout}
            >
              Log out
            </button>
          </nav>
        </header>

        <main>
          <h1>
            Welcome, {currentUser.displayName}!
          </h1>

          <p>
            You are connected as{" "}
            <strong>
              {currentUser.accountType}
            </strong>
            .
          </p>

          <p>
            Your profile page will be added in the
            next step.
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <header className="site-header">
        <strong className="site-title">
          FT Music
        </strong>

        <nav
          className="main-navigation"
          aria-label="Authentication"
        >
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

      {currentPage === "register"
        ? (
          <RegisterPage />
        )
        : (
          <LoginPage
            onLoginSuccess={handleLoginSuccess}
          />
        )}
    </>
  );
}

export default App;