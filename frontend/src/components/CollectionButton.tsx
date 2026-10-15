import { useState } from "react";
import { useCollections } from "../contexts/collections";
import type { CollectionKind } from "../types/collections";
/** Bouton partagé : le libellé et l'état distinguent aimer, enregistrer et suivre. */
export default function CollectionButton({
  kind,
  id,
}: {
  kind: CollectionKind;
  id: string;
}) {
  const collection = useCollections(),
    [error, setError] = useState("");
  if (!collection) return null;
  const saved = collection.data?.[kind].some((item) => item.id === id) ?? false;
  const labels =
    kind === "track"
      ? ["Like track", "Unlike track"]
      : kind === "artist"
        ? ["Follow artist", "Unfollow artist"]
        : ["Save " + kind, "Unsave " + kind];
  /** Attend la confirmation et conserve le refus près du bouton. */
  async function toggle() {
    setError("");
    try {
      await collection!.change(kind, id, !saved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save.");
    }
  }
  return (
    <span className="collection-action">
      <button
        type="button"
        className="collection-button"
        aria-label={labels[saved ? 1 : 0]}
        aria-pressed={saved}
        disabled={collection.loading || collection.busy || !!collection.error}
        onClick={() => void toggle()}
      >
        {kind === "track" ? (saved ? "♥ " : "♡ ") : saved ? "✓ " : "+ "}
        {labels[saved ? 1 : 0]}
      </button>
      {(error || collection.error) && (
        <span role="alert">
          {error || collection.error}
          <button onClick={collection.reload}>Retry library</button>
        </span>
      )}
    </span>
  );
}
