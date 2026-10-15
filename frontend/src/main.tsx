import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { updateDocumentLanguage } from "./services/language";

// Applique la langue avant le premier affichage des composants.
updateDocumentLanguage();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
