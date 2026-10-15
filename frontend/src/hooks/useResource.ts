/** Lecture annulable commune aux écrans ; aucun ancien résultat ne remplace une nouvelle demande. */
import { useCallback, useEffect, useState } from "react";
/** Le chargeur doit être stabilisé avec useCallback et inclure ses paramètres dans ses dépendances. */
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    load?: typeof load;
    retry: number;
    data?: T;
    error?: string;
  }>({ retry: -1 });
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ load, retry, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({
            load,
            retry,
            error:
              error instanceof Error
                ? error.message
                : "Unable to load. Please retry.",
          });
      });
    return () => controller.abort();
  }, [load, retry]);
  const reload = useCallback(() => setRetry((n) => n + 1), []);
  const current = result.load === load && result.retry === retry;
  return {
    data: current ? result.data : undefined,
    error: current ? result.error : undefined,
    loading: !current,
    reload,
  };
}
