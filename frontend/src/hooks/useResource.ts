/** Lectures annulables : contenu stable pendant la relecture et isolation des identités de ressources. */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useVisibleRefresh } from "./useVisibleRefresh";
/** État d’une réponse, attaché au chargeur et donc à son compte, sa recherche et sa page. */
type Result<T> = {
  /** Chargeur stabilisé ou portée explicite de la collection dans son écran. */ identity?:
    string | ((signal: AbortSignal) => Promise<T>);
  /** Dernière confirmation conservée pendant une panne transitoire. */ data?: T;
  /** Message de la dernière lecture échouée. */ error?: string;
  /** Une lecture de cette identité est en cours. */ pending: boolean;
};
/** Refus définitif : aucune ancienne donnée ne doit survivre à une révocation ou une suppression. */
function invalidatesData(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "status" in error &&
    [401, 403, 404].includes(Number(error.status))
  );
}
/**
 * Le chargeur useCallback inclut tous les paramètres ; auto active les déclencheurs visibles.
 * scope est réservé aux membres changeants d’une même collection : inclure page/catégorie,
 * et isoler son composant par compte. Par défaut, changer de chargeur efface les données.
 */
export function useResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  auto = true,
  scope?: string,
) {
  // Une portée explicite n’est permise qu’à l’intérieur d’un écran déjà isolé par compte.
  // Elle permet de mettre à jour les membres d’une même collection sans la vider.
  const identity = scope ?? load;
  const confirmedIdentity = useRef<typeof identity | undefined>(undefined);
  const [result, setResult] = useState<Result<T>>({ pending: false });
  /** Commandes remplacées après chaque changement d’identité, jamais pendant le rendu. */
  const commands = useRef({
    run: (force: boolean) => {
      void force;
    },
    pause: (): (() => void) => () => {},
    update: (change: (data: T | undefined) => T) => {
      void change;
    },
  });
  /** Élément réellement visible avant remplacement ; distinct du simple scrollY. */
  const anchor = useRef<{
    element: Element;
    top: number;
    scroll: number;
  } | null>(null);
  useLayoutEffect(() => {
    const saved = anchor.current;
    anchor.current = null;
    if (saved?.element.isConnected && window.scrollY === saved.scroll) {
      const delta = saved.element.getBoundingClientRect().top - saved.top;
      if (Math.abs(delta) > 0.5)
        window.scrollBy({ top: delta, behavior: "instant" });
    }
  }, [result]);
  useEffect(() => {
    let controller: AbortController | undefined;
    let disposed = false,
      pauses = 0,
      hasData = confirmedIdentity.current === identity;
    /** Retient l’élément visible seulement pour une mise à jour de la même ressource. */
    function rememberAnchor() {
      if (!hasData || window.scrollY === 0) return;
      const element = [
        ...document.querySelectorAll("main [data-scroll-anchor]"),
      ].find((item) => {
        const box = item.getBoundingClientRect();
        return box.bottom > 0 && box.top < window.innerHeight;
      });
      if (element)
        anchor.current = {
          element,
          top: element.getBoundingClientRect().top,
          scroll: window.scrollY,
        };
    }
    /** Une commande explicite invalide la lecture précédente ; les déclencheurs automatiques fusionnent. */
    async function run(force: boolean) {
      if (disposed || pauses || (controller && !force)) return;
      controller?.abort();
      const request = new AbortController();
      controller = request;
      setResult((previous) =>
        previous.identity === identity
          ? { ...previous, pending: true }
          : { identity, pending: true },
      );
      try {
        const data = await load(request.signal);
        if (disposed || request.signal.aborted || controller !== request)
          return;
        rememberAnchor();
        hasData = true;
        confirmedIdentity.current = identity;
        setResult({ identity, data, pending: false });
      } catch (failure) {
        if (disposed || request.signal.aborted || controller !== request)
          return;
        const clear = invalidatesData(failure);
        if (clear) {
          hasData = false;
          confirmedIdentity.current = undefined;
        }
        setResult((previous) => ({
          identity,
          data:
            !clear && previous.identity === identity
              ? previous.data
              : undefined,
          pending: false,
          error:
            failure instanceof Error
              ? failure.message
              : "Unable to load. Please retry.",
        }));
      } finally {
        if (controller === request) controller = undefined;
      }
    }
    commands.current = {
      run: (force) => {
        void run(force);
      },
      /** Suspend les GET pendant une mutation ; reprend avec une lecture après sa résolution. */
      pause: () => {
        pauses++;
        controller?.abort();
        controller = undefined;
        let released = false;
        return () => {
          if (released) return;
          released = true;
          pauses--;
          if (!pauses) void run(true);
        };
      },
      /** Applique exclusivement une confirmation de mutation de cette identité. */
      update: (change) => {
        if (disposed) return;
        rememberAnchor();
        hasData = true;
        confirmedIdentity.current = identity;
        setResult((previous) => ({
          identity,
          data: change(
            previous.identity === identity ? previous.data : undefined,
          ),
          pending: false,
        }));
      },
    };
    void run(false);
    return () => {
      disposed = true;
      controller?.abort();
    };
  }, [load, identity]);
  const reload = useCallback(() => commands.current.run(true), []);
  const revalidate = useCallback(() => commands.current.run(false), []);
  const pause = useCallback(() => commands.current.pause(), []);
  const update = useCallback(
    (change: (data: T | undefined) => T) => commands.current.update(change),
    [],
  );
  useVisibleRefresh(revalidate, auto);
  const current = result.identity === identity;
  const data = current ? result.data : undefined;
  return {
    data,
    error: current && data === undefined ? result.error : undefined,
    refreshError: current && data !== undefined ? result.error : undefined,
    loading: !current || (data === undefined && result.pending),
    refreshing: current && data !== undefined && result.pending,
    reload,
    pause,
    update,
  };
}
