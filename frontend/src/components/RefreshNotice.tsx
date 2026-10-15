/** Signale une relecture échouée sans retirer les dernières données confirmées. */
/** Le bouton de reprise n’apparaît que lorsqu’une erreur exige une action possible. */
export default function RefreshNotice({
  error,
  retry,
  retained = true,
}: {
  /** Erreur transitoire conservant les données précédentes. */ error?: string;
  /** Indique si une confirmation précédente reste affichée. */ retained?: boolean;
  /** Relance explicitement la lecture. */ retry: () => void;
}) {
  if (!error) return null;
  return (
    <p role="status" className="refresh-notice">
      {retained
        ? "The update failed; the last loaded content is still shown. "
        : ""}
      {error} <button onClick={retry}>Retry update</button>
    </p>
  );
}
