/** Mesure locale de lecture effective ; déplacer la position ou attendre en pause ne donne pas de temps écouté. */
/** Position et cumul de temps observé, en millisecondes entières, à transmettre au suivi. */
export type ListeningSnapshot = {
  /** Position dans le morceau en millisecondes ; un déplacement ne vaut pas du temps écouté. */
  positionMs: number;
  /** Cumul local déclaré en millisecondes ; le serveur borne le crédit réellement retenu. */
  listenedMsTotal: number;
};
/**
 * Observation du lecteur : horloge monotone, position en millisecondes, lecture active et éventuelle
 * rupture de position.
 */
export type ClockReading = {
  /** Horloge monotone locale en millisecondes, distincte de la position audio. */
  nowMs: number;
  /** Position dans le morceau en millisecondes ; un déplacement ne vaut pas du temps écouté. */
  positionMs: number;
  /** Indique qu’une lecture effective est observée, hors pause et attente. */
  playing: boolean;
  /** Signale un déplacement ou une rupture empêchant de créditer l’intervalle précédent. */
  discontinuity?: boolean;
};

/**
 * Accumule seulement les intervalles cohérents entre temps écoulé et avance audio ; ignore pauses,
 * sauts et longues suspensions.
 */
export class ListeningClock {
  /** Observation précédente utilisée pour calculer l’intervalle d’écoute. */
  private previous: ClockReading | null = null;
  /** Cumul local d’écoute en millisecondes avant arrondi du snapshot. */
  private total = 0;

  /**
   * Ajoute au plus le minimum du temps écoulé et de l’avance audio si l’observation précédente jouait.
   * Ignore les ruptures, intervalles de plus de 2,5 s et sauts hors de la tolérance de 250 ms ; rejette
   * une mesure invalide.
   */
  sample(reading: ClockReading): ListeningSnapshot {
    if (
      !Number.isFinite(reading.nowMs) ||
      reading.nowMs < 0 ||
      !Number.isFinite(reading.positionMs) ||
      reading.positionMs < 0 ||
      reading.positionMs > Number.MAX_SAFE_INTEGER
    )
      throw new Error("Invalid audio clock reading");
    const previous = this.previous;
    if (previous?.playing && !reading.discontinuity) {
      const elapsed = reading.nowMs - previous.nowMs,
        advance = reading.positionMs - previous.positionMs;
      // Discard suspended intervals and jumps. The 250 ms tolerance detects
      // sampling jitter; it never adds credit beyond elapsed time or audio advance.
      if (
        elapsed >= 0 &&
        elapsed <= 2500 &&
        advance >= 0 &&
        advance <= elapsed + 250
      ) {
        this.total = Math.min(
          Number.MAX_SAFE_INTEGER,
          this.total + Math.min(elapsed, advance),
        );
      }
    }
    this.previous = { ...reading };
    return this.snapshot();
  }

  /**
   * Renvoie une copie avec position et cumul arrondis vers le bas en millisecondes, sans modifier
   * l’horloge.
   */
  snapshot(): ListeningSnapshot {
    return {
      positionMs: Math.floor(this.previous?.positionMs ?? 0),
      listenedMsTotal: Math.floor(this.total),
    };
  }

  /** Oublie l’observation précédente et remet le cumul à zéro pour une nouvelle session. */
  reset() {
    this.previous = null;
    this.total = 0;
  }
}
