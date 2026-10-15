/** Attente de la confirmation Media après le transfert, sans pourcentage de traitement inventé. */
import { useEffect, useState } from "react";

/** Anime un reflet sur le texte et remplace le conseil après huit secondes, dans un espace réservé. */
export default function AudioPreparation() {
  const [takingLonger, setTakingLonger] = useState(false);
  useEffect(() => {
    const timeout = window.setTimeout(() => setTakingLonger(true), 8_000);
    return () => window.clearTimeout(timeout);
  }, []);

  return <div className="audio-preparation upload-state">
    <span className="audio-preparation-title">Preparing audio</span>
    <p className="upload-status-hint" key={takingLonger ? "long" : "initial"}>
      {takingLonger ? "This is taking a little longer. Larger files can take more time." : "Checking the file and preparing playback."}
    </p>
  </div>;
}
