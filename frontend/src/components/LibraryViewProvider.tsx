/** Garde les filtres sans conserver les données privées des anciennes pages. */
import { useState, type ReactNode } from "react";
import { LibraryViewContext, type LibraryView } from "../contexts/library-view";
/** Remonté avec le lecteur lors d'un changement de compte. */
export default function LibraryViewProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [memory] = useState(() => new Map<string, LibraryView>());
  return (
    <LibraryViewContext.Provider value={memory}>
      {children}
    </LibraryViewContext.Provider>
  );
}
