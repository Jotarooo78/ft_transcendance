/** Attente de la confirmation Media après le transfert, sans pourcentage de traitement inventé. */
import { useEffect, useState } from "react";

/** Affiche les points animés et un conseil après huit secondes ; le démontage annule le délai. */
export default function AudioPreparation() {
  const [takingLonger, setTakingLonger] = useState(false);
  useEffect(() => {
    const timeout = window.setTimeout(() => setTakingLonger(true), 8_000);
    return () => window.clearTimeout(timeout);
  }, []);

  return <div className="audio-preparation">
    <span className="audio-preparation-title">Preparing audio<span className="preparation-dots" aria-hidden="true">...</span></span>
    <p>Checking the file and preparing playback.</p>
    {takingLonger && <p>This is taking a little longer. Larger files can take more time.</p>}
  </div>;
}
