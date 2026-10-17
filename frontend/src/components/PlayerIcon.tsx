/** Icônes vectorielles communes aux commandes et aux lignes musicales. */
/** Ensemble fermé des commandes visuelles du lecteur. */
export type PlayerIconName =
  | "play"
  | "pause"
  | "next"
  | "previous"
  | "shuffle"
  | "repeat"
  | "volume"
  | "muted"
  | "queue"
  | "close"
  | "more";
/** Formes immuables partagées : ne recrée pas toutes les icônes lors de chaque rendu d’une ligne. */
const paths: Record<PlayerIconName, React.ReactNode> = {
  play: <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" stroke="none" />
    </>
  ),
  next: (
    <>
      <path d="m5 5 11 7-11 7Z" fill="currentColor" stroke="none" />
      <path d="M19 5v14" />
    </>
  ),
  previous: (
    <>
      <path d="m19 5-11 7 11 7Z" fill="currentColor" stroke="none" />
      <path d="M5 5v14" />
    </>
  ),
  shuffle: (
    <>
      <path d="M3 6h3c5 0 7 12 12 12h3M17 14l4 4-4 4M3 18h3c2 0 4-3 6-6s4-6 6-6h3M17 2l4 4-4 4" />
    </>
  ),
  repeat: (
    <>
      <path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" />
    </>
  ),
  volume: (
    <>
      <path d="m11 4-5 4H3v8h3l5 4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" />
    </>
  ),
  muted: (
    <>
      <path d="m11 4-5 4H3v8h3l5 4ZM16 9l6 6M22 9l-6 6" />
    </>
  ),
  queue: (
    <>
      <path d="M3 5h18M3 10h18M3 15h9M3 20h9m5-5 5 3-5 3Z" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
};
/** Affiche une icône décorative ; le bouton parent porte le libellé accessible. */
export default function PlayerIcon({
  name,
}: {
  /** Commande représentée. */ name: PlayerIconName;
}) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
