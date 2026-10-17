/** Suit l’ouverture et la fermeture des pages légales, y compris avec précédent/suivant. */
import { useEffect, useState } from "react";
import { readLegalRoute } from "../services/legal-navigation";
/** S’abonne au fragment d’URL et retire l’abonnement au démontage. */
export function useLegalRoute() {
  const [route, setRoute] = useState(readLegalRoute);
  useEffect(() => {
    const update = () => setRoute(readLegalRoute());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return route;
}
