/** Déclenche les relectures uniquement dans un document visible, sans doubler focus et visibilité. */
import { useEffect } from "react";
/** Cadence commune, en millisecondes, des listes actuellement utilisées. */
export const REFRESH_INTERVAL_MS = 30_000;
/** Le demandeur sérialise les lectures ; ce hook ne gère que leurs déclencheurs. */
export function useVisibleRefresh(refresh: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let last = -Infinity;
    let timer: number | undefined;
    /** Fusionne les événements focus/visibility rapprochés ; ignore un onglet masqué. */
    function trigger() {
      if (document.visibilityState !== "visible" || Date.now() - last < 500)
        return;
      last = Date.now();
      refresh();
    }
    /** Arrête réellement le minuteur quand le document n’est plus visible. */
    function visibility() {
      window.clearInterval(timer);
      timer = undefined;
      if (document.visibilityState === "visible") {
        trigger();
        timer = window.setInterval(trigger, REFRESH_INTERVAL_MS);
      }
    }
    visibility();
    window.addEventListener("focus", trigger);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", trigger);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [refresh, enabled]);
}
