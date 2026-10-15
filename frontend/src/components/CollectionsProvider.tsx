import { useCallback, useRef, useState, type ReactNode } from "react";
import { useResource } from "../hooks/useResource";
import { getCollection, setCollected } from "../services/collections";
import { CollectionsContext } from "../contexts/collections";
import type { CollectionKind, Collections } from "../types/collections";
/** Partage les lectures et sérialise les actions, avec réinitialisation au changement de compte. */
export default function CollectionsProvider({
  children,
}: {
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
  );
  const locked = useRef(false),
    [busy, setBusy] = useState(false);
  /** Attend le serveur puis relit les références communes, sans mise à jour optimiste. */
  async function change(kind: CollectionKind, id: string, saved: boolean) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      await setCollected(kind, id, saved);
      resource.reload();
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <CollectionsContext.Provider value={{ ...resource, busy, change }}>
      {children}
    </CollectionsContext.Provider>
  );
}
