import RefreshNotice from "./RefreshNotice";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { useResource } from "../hooks/useResource";
import { getCollection, setCollected } from "../services/collections";
import { CollectionsContext } from "../contexts/collections";
import type { CollectionKind, Collections } from "../types/collections";
/** Partage les lectures et sérialise les actions, avec réinitialisation au changement de compte. */
export default function CollectionsProvider({
  children,
  active = true,
}: {
  /** Pages où les boutons de collection ou la bibliothèque sont visibles. */ active?: boolean;
  children: ReactNode;
}) {
  const resource = useResource(
    useCallback(async (signal) => {
      const kinds: CollectionKind[] = [
        "track",
        "project",
        "artist",
        "playlist",
      ];
      const pairs = await Promise.all(
        kinds.map(async (kind) => [kind, await getCollection(kind, signal)]),
      );
      return Object.fromEntries(pairs) as Collections;
    }, []),
    active,
  );
  const locked = useRef(false),
    [busy, setBusy] = useState(false);
  /** Attend le serveur puis relit les références communes, sans mise à jour optimiste. */
  async function change(kind: CollectionKind, id: string, saved: boolean) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    const resume = resource.pause();
    try {
      await setCollected(kind, id, saved);
    } finally {
      resume();
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <CollectionsContext.Provider value={{ ...resource, busy, change }}>
      {children}
      {active && (
        <RefreshNotice error={resource.refreshError} retry={resource.reload} />
      )}
    </CollectionsContext.Provider>
  );
}
