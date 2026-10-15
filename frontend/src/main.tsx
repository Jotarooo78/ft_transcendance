import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { updateDocumentLanguage } from "./services/language";
import { installFormLanguage } from "./services/validate-form-language";

// Applique la langue avant le premier affichage des composants.
updateDocumentLanguage();
/** Nettoyage des messages natifs lorsque le module est rechargé en développement. */
const removeFormLanguage = installFormLanguage();
if (import.meta.hot) import.meta.hot.dispose(removeFormLanguage);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
