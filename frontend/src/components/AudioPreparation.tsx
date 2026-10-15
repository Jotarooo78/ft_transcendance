import { translate as t } from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
/** Attente de la confirmation Media après le transfert, sans pourcentage de traitement inventé. */
import { useEffect, useState } from "react";

/** Anime un reflet sur le texte et remplace le conseil après huit secondes, dans un espace réservé. */
export default function AudioPreparation() {
  useLanguage();
  const [takingLonger, setTakingLonger] = useState(false);
  useEffect(() => {
    const timeout = window.setTimeout(() => setTakingLonger(true), 8_000);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <div className="audio-preparation upload-state">
      <span className="audio-preparation-title">{t("Preparing audio")}</span>
      <p className="upload-status-hint" key={takingLonger ? "long" : "initial"}>
        {takingLonger
          ? t(
              "This is taking a little longer. Larger files can take more time.",
            )
          : t("Checking the file and preparing playback.")}
      </p>
    </div>
  );
}
