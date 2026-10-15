/** Suit les liens musicaux et les boutons précédent/suivant du navigateur. */
import { useEffect, useState } from "react";
import { readMusicRoute } from "../services/music-navigation";
/** S’abonne au fragment d’URL et retire l’abonnement au démontage. */
export function useMusicRoute() {
  const [route, setRoute] = useState(readMusicRoute);
  useEffect(() => {
    const update = () => setRoute(readMusicRoute());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return route;
}
