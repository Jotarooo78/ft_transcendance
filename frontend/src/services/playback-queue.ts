/** File d’envoi du suivi audio : une requête de progression à la fois, même séquence lors des répétitions et clôture après les confirmations. */
import type { ListeningSnapshot } from "./listening-clock.ts";
import type { PlaybackSession, ProgressPayload } from "./playback.ts";

/**
 * Erreur portant la possibilité de retenter : un refus définitif ne doit pas être répété
 * automatiquement.
 */
export class PlaybackRequestError extends Error {
  /** Autorise les répétitions bornées de cette requête ; false représente un refus définitif. */
  readonly retryable: boolean;
  /** Conserve le message et la possibilité de retenter ce refus de transport. */
  constructor(retryable: boolean, message: string) {
    super(message);
    this.retryable = retryable;
  }
}
/**
 * État visible de sauvegarde, message utilisateur et disponibilité éventuelle du bouton de nouvelle
 * tentative.
 */
export type TrackingStatus = {
  /** État visible de sauvegarde : ouverture, enregistrement, confirmation, erreur ou clôture. */
  state: "opening" | "saving" | "saved" | "closed" | "error";
  /** Message de suivi ou demande à transmettre, selon le contrat contenant ce champ. */
  message: string;
  /** Indique que l’utilisateur peut demander une nouvelle tentative de sauvegarde. */
  canRetry: boolean;
};
/**
 * Opérations de transport et garde de compte injectées ; delay permet de tester les répétitions sans
 * attente réelle.
 */
type Options = {
  /** Ouvre une nouvelle session ; une réponse perdue ne doit pas provoquer une ouverture répétée automatiquement. */
  open: () => Promise<PlaybackSession>;
  /** Envoie une progression avec la même séquence lors des répétitions. */
  progress: (id: string, input: ProgressPayload) => Promise<PlaybackSession>;
  /** Libération des ressources à la fermeture, ou clôture de la session dans le transport Playback. */
  close: (id: string) => Promise<PlaybackSession>;
  /** Garde vérifiant que la file appartient encore au compte courant. */
  isCurrent: () => boolean;
  /** Publie un état de suivi à l’interface encore attachée. */
  notify: (status: TrackingStatus) => void;
  /** Attente injectable entre les répétitions pour permettre des tests déterministes. */
  delay?: () => Promise<void>;
};

/**
 * Sérialise ouverture, progressions et clôture. Conserve l’événement non confirmé pour le rejouer
 * identiquement ; ne répète jamais automatiquement une ouverture à résultat incertain.
 */
export class PlaybackQueue {
  /** Opérations de transport et notifications injectées dans la file. */
  private options: Options;
  /** Session confirmée ou état transactionnel de la session concernée. */
  private session: PlaybackSession | null = null;
  /** Dernière observation locale disponible, en attente de regroupement. */
  private latest: ListeningSnapshot | null = null;
  /** Événement non confirmé conservé intact pour une répétition avec la même séquence. */
  private pending: ProgressPayload | null = null;
  /** Dernière observation confirmée, utilisée pour éviter un envoi identique inutile. */
  private acknowledged: ListeningSnapshot = {
    positionMs: 0,
    listenedMsTotal: 0,
  };
  /** Numéro à attribuer au prochain nouvel événement, avancé seulement après confirmation. */
  private nextSequence = 1;
  /** Indique qu’une ouverture a déjà été demandée pour cette file. */
  private started = false;
  /** Empêche de nouveaux échanges après la perte du compte courant. */
  private stopped = false;
  /** Suspend la sauvegarde après un échec sans arrêter la lecture audio. */
  private blocked = false;
  /** Empêche les notifications à un composant React déjà démonté. */
  private detached = false;
  /** Indique qu’une clôture est demandée après la dernière progression. */
  private terminal = false;
  /** Indique que la clôture a été confirmée par le serveur. */
  private closed = false;
  /** Promesse de l’ouverture unique de cette session. */
  private opening: Promise<void> | null = null;
  /** Promesse de l’unique boucle d’envoi active. */
  private worker: Promise<void> | null = null;

  /** Conserve les opérations injectées et initialise la file pour une session de lecture. */
  constructor(options: Options) {
    this.options = options;
  }

  /** Vérifie que le compte reste courant ; un changement stoppe les futurs envois de cette file. */
  private current() {
    if (this.stopped || !this.options.isCurrent()) {
      this.stopped = true;
      this.latest = null;
      this.pending = null;
      return false;
    }
    return true;
  }
  /** Publie l’état de sauvegarde seulement si l’interface est encore attachée et le compte courant. */
  private notify(
    state: TrackingStatus["state"],
    message: string,
    canRetry = false,
  ) {
    if (!this.detached && this.current())
      this.options.notify({ state, message, canRetry });
  }
  /**
   * Ouvre une seule session et lance l’envoi des observations. Si la confirmation d’ouverture est
   * perdue, bloque sans refaire POST, car une session peut déjà exister.
   */
  start(snapshot: ListeningSnapshot): Promise<void> {
    if (this.started) {
      this.offer(snapshot);
      return this.opening ?? Promise.resolve();
    }
    if (!this.current()) return Promise.resolve();
    this.started = true;
    this.latest = { ...snapshot };
    this.notify("opening", "Starting listening history…");
    this.opening = (async () => {
      try {
        const session = await this.options.open();
        if (!this.current()) return;
        this.session = session;
        await this.pump();
      } catch {
        this.blocked = true;
        // Opening is not idempotent: a lost reply may already have created a session.
        this.notify(
          "error",
          "Listening history could not be started or confirmed. Audio can continue.",
        );
      }
    })();
    return this.opening;
  }
  /**
   * Conserve la dernière observation disponible et déclenche l’envoi si la session est démarrée ; ignore
   * une file arrêtée ou terminée.
   */
  offer(snapshot: ListeningSnapshot) {
    if (this.terminal || this.closed || !this.current()) return;
    this.latest = { ...snapshot };
    if (this.started) void this.pump();
  }
  /**
   * Mémorise la dernière observation, attend l’ouverture puis les envois avant de fermer la session tant
   * que le compte reste courant.
   */
  async finish(snapshot: ListeningSnapshot): Promise<void> {
    if (!this.terminal) this.latest = { ...snapshot };
    this.terminal = true;
    if (!this.started || !this.current()) return;
    await this.opening;
    while (this.session && !this.blocked && !this.closed && this.current())
      await this.pump();
  }
  /** Détache les notifications React et demande la fin de suivi avec la dernière observation disponible. */
  detach(snapshot: ListeningSnapshot) {
    this.detached = true;
    void this.finish(snapshot);
  }
  /**
   * Débloque une sauvegarde échouée et relance le même événement ou la clôture, seulement pour une
   * session confirmée du compte courant.
   */
  retry() {
    if (!this.session || !this.current() || this.closed) return;
    this.blocked = false;
    void this.pump();
  }

  /**
   * Retente une opération éligible au maximum deux fois après le premier échec, avec délai et contrôle
   * de compte entre chaque tentative.
   */
  private async attempt(
    operation: () => Promise<PlaybackSession>,
  ): Promise<PlaybackSession> {
    for (let attempt = 0; ; attempt++) {
      if (!this.current())
        throw new PlaybackRequestError(false, "Account changed.");
      try {
        return await operation();
      } catch (error) {
        if (
          !this.current() ||
          attempt >= 2 ||
          (error instanceof PlaybackRequestError && !error.retryable)
        )
          throw error;
        await (this.options.delay?.() ??
          new Promise((resolve) => setTimeout(resolve, 150)));
      }
    }
  }
  /**
   * Garantit un seul worker actif ; reprend si une observation arrive pendant la fin du worker
   * précédent.
   */
  private pump(): Promise<void> {
    if (this.worker) return this.worker;
    if (!this.session || this.blocked || this.closed || !this.current())
      return Promise.resolve();
    this.worker = this.run().finally(() => {
      this.worker = null;
      // A reading may arrive between run returning and this completion callback.
      if (
        this.session &&
        !this.blocked &&
        !this.closed &&
        this.current() &&
        (this.latest || this.terminal)
      )
        void this.pump();
    });
    return this.worker;
  }
  /**
   * Envoie les observations avec séquence stable, attend chaque confirmation puis avance la séquence.
   * Sur échec conserve l’événement et bloque ; une fin demandée ferme après la dernière progression.
   */
  private async run() {
    while (this.session && this.current()) {
      if (!this.pending && this.latest) {
        const snapshot = this.latest;
        this.latest = null;
        if (
          snapshot.positionMs !== this.acknowledged.positionMs ||
          snapshot.listenedMsTotal !== this.acknowledged.listenedMsTotal
        ) {
          this.pending = { sequence: this.nextSequence, ...snapshot };
        }
      }
      if (this.pending) {
        const payload = this.pending,
          id = this.session.id;
        this.notify("saving", "Saving listening progress…");
        try {
          const confirmed = await this.attempt(() =>
            this.options.progress(id, payload),
          );
          if (!this.current()) return;
          if (confirmed.id !== id || confirmed.lastSequence < payload.sequence)
            throw new PlaybackRequestError(
              false,
              "Mismatched progress response.",
            );
          this.session = confirmed;
          this.acknowledged = payload;
          this.nextSequence = payload.sequence + 1;
          this.pending = null;
          this.notify("saved", "Listening progress saved.");
        } catch {
          this.blocked = true;
          this.notify(
            "error",
            "Listening progress could not be saved. Audio can continue.",
            true,
          );
          return;
        }
        continue;
      }
      if (this.terminal && !this.closed) {
        const id = this.session.id;
        this.notify("saving", "Saving the end of this listening session…");
        try {
          const confirmed = await this.attempt(() => this.options.close(id));
          if (!this.current()) return;
          if (confirmed.id !== id || confirmed.endedAt === null)
            throw new PlaybackRequestError(false, "Mismatched close response.");
          this.session = confirmed;
          this.closed = true;
          this.notify("closed", "Listening session saved.");
        } catch {
          this.blocked = true;
          this.notify(
            "error",
            "The end of this listening session could not be saved. Audio can continue.",
            true,
          );
        }
      }
      return;
    }
  }
}
