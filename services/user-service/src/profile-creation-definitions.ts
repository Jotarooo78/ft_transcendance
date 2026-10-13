/** Contrat reçu d’Auth pour créer un profil une seule fois, avec des erreurs métier explicites. */
/** Nom de l’événement de profil avec version du contrat, partagé entre émetteur et destinataire. */
export const profileProvisionType = "ProfileProvisionRequested.v1";

/**
 * Message versionné de création de profil. aggregateId désigne le compte ; eventId identifie la
 * livraison rejouable.
 */
export type ProfileProvisionCommand = {
  /** Identité stable de la demande, conservée lors de chaque répétition pour éviter un second traitement. */
  eventId: string;
  /** Nom versionné de l’événement ProfileProvisionRequested.v1. */
  type: typeof profileProvisionType;
  /** Version du format du message, indépendante de la version du compte. */
  schemaVersion: 1;
  /** UUID du compte concerné par cette commande de profil. */
  aggregateId: string;
  /** Version entière de l’entité concernée par la commande. */
  aggregateVersion: number;
  /** Date de l’événement au format ISO, conservée lors des répétitions. */
  occurredAt: string;
  /** Résultat validé ou champs de la commande regroupés par ce contrat. */
  data: {
    /** Nom affiché du profil, distinct du username unique. */
    displayName: string;
    /** Nom unique canonique : 3 à 24 caractères a-z, 0-9 ou _. */
    username: string;
  };
};

/** Distingue un profil créé maintenant d’une demande identique déjà traitée. */
export type ProfileProvisionResult = {
  /** created pour une création nouvelle, already_processed pour un événement déjà mémorisé. */
  status: "created" | "already_processed";
};

/**
 * Applique la commande au stockage Users et renvoie sa confirmation ; peut rejeter un conflit de
 * username ou d’identité.
 */
export type ProfileProvisioner = (
  command: ProfileProvisionCommand,
) => Promise<ProfileProvisionResult>;

/** Signale qu’un autre profil possède déjà le username demandé. */
export class UsernameTakenError extends Error {
  /** Initialise une erreur métier identifiable par la route interne. */
  constructor() {
    super("username already registered");
    this.name = "UsernameTakenError";
  }
}

/** Signale qu’un profil existe pour une autre commande ou des données incompatibles. */
export class ProfileConflictError extends Error {
  /** Initialise une erreur métier identifiable par la route interne. */
  constructor() {
    super("profile already exists for another command");
    this.name = "ProfileConflictError";
  }
}
