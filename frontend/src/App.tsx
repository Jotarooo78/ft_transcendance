import { useState } from "react";

import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";

import "./App.css";

type PublicPage =
  | "register"
  | "login";

function App() {
  const [currentPage, setCurrentPage] =
    useState<PublicPage>("register");

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
        ? <RegisterPage />
        : <LoginPage />}
    </>
  );
}

export default App;