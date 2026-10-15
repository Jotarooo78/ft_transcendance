/** Mémoire de navigation limitée au compte et à la durée de sa session React. */
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
/** Filtres et position conservés indépendamment pour chaque collection. */
export type LibraryView = {
  query: string;
  sort: string;
  page: number;
  scroll: number;
};
export const LibraryViewContext = createContext<Map<
  string,
  LibraryView
> | null>(null);
/** Restaure la position après chargement, et conserve les choix au démontage de l'écran. */
export function useLibraryView(key: string, ready = true) {
  const memory = useContext(LibraryViewContext);
  const [view, setView] = useState<LibraryView>(
    () =>
      memory?.get(key) ?? { query: "", sort: "updated", page: 1, scroll: 0 },
  );
  const latest = useRef(view);
  useLayoutEffect(() => {
    latest.current = view;
  }, [view]);
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (!ready || restored.current) return;
    /** Attend les dimensions nécessaires sans jamais contrarier un nouveau geste de défilement. */
    function restore() {
      if (
        document.documentElement.scrollHeight - window.innerHeight >=
        latest.current.scroll
      ) {
        restored.current = true;
        window.scrollTo({ top: latest.current.scroll, behavior: "instant" });
        observer.disconnect();
      }
    }
    const observer = new ResizeObserver(restore);
    /** Un geste explicite remplace la position mémorisée. */
    function cancel() {
      restored.current = true;
      observer.disconnect();
    }
    observer.observe(document.body);
    restore();
    window.addEventListener("wheel", cancel, { passive: true });
    window.addEventListener("touchmove", cancel, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("touchmove", cancel);
    };
  }, [ready]);
  useLayoutEffect(
    () => () => {
      memory?.set(key, { ...latest.current, scroll: window.scrollY });
    },
    [memory, key],
  );
  return [view, setView] as const;
}
