/** Visuel commun aux pochettes absentes ou illisibles, indépendant des polices du système. */
import "../styles/empty-artwork.css";
/** Le conteneur conserve les dimensions et couleurs du contexte ; la croche reste dans sa zone centrale. */
export default function EmptyArtwork({
  className,
  label = "No artwork",
}: {
  /** Classes du contexte : carte, ligne, lecteur ou formulaire. */ className: string;
  /** Description accessible de l’absence de pochette. */ label?: string;
}) {
  return (
    <div className={`${className} empty-artwork`} role="img" aria-label={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M13 3v13.2a4 3 0 1 1-2-2.6V3Zm0 0c0 4 7 3 7 8-1-2-4-2-7-3Z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}
