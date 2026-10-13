/** Contrat et suivi de la création du profil : Auth conserve le compte et une demande durable à livrer à Users. */
/** Nom de l’événement de profil avec version du contrat, partagé entre émetteur et destinataire. */
export const profileProvisionType = "ProfileProvisionRequested.v1";

/**
 * Demande de profil conservée dans la boîte d’envoi durable (outbox). Son eventId reste identique lors
 * des nouvelles tentatives.
 */
export type PendingProfileProvision = {
  /** Identité stable de la demande, conservée lors de chaque répétition pour éviter un second traitement. */
  eventId: string;
  /** UUID du compte auquel le profil ou la demande est rattaché. */
  userId: string;
  /** Version entière de l’entité concernée par la commande. */
  aggregateVersion: number;
  /** Date de l’événement au format ISO, conservée lors des répétitions. */
  occurredAt: string;
  /** Nom affiché du profil, distinct du username unique. */
  displayName: string;
  /** Nom unique canonique : 3 à 24 caractères a-z, 0-9 ou _. */
  username: string;
  /** Nombre de tentatives de livraison déjà comptées. */
  attempts: number;
};

/**
 * Compte et empreinte du mot de passe nécessaires à la connexion. Seul un compte active peut recevoir
 * un jeton.
 */
export type AccountForLogin = {
  /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
  id: string;
  /** Adresse utilisée pour identifier le compte à la connexion. */
  email: string;
  /** Empreinte du mot de passe conservée côté Auth, jamais un mot de passe en clair. */
  passwordHash: string;
  /**
   * pending_profile avant confirmation Users, active après livraison, profile_failed après conflit
   * définitif.
   */
  state: "pending_profile" | "active" | "profile_failed";
};

/**
 * Champs validés avant la transaction d’inscription ; passwordHash contient une empreinte, jamais le
 * mot de passe en clair.
 */
export type CreateRegistrationInput = {
  /** Adresse utilisée pour identifier le compte à la connexion. */
  email: string;
  /** Empreinte du mot de passe conservée côté Auth, jamais un mot de passe en clair. */
  passwordHash: string;
  /** Nom affiché du profil, distinct du username unique. */
  displayName: string;
  /** Nom unique canonique : 3 à 24 caractères a-z, 0-9 ou _. */
  username: string;
};

/** Compte pending_profile et message créés ensemble dans la même transaction. */
export type CreatedRegistration = {
  /** Compte créé dans la même transaction que sa demande de profil. */
  account: {
    /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
    id: string;
    /** Adresse utilisée pour identifier le compte à la connexion. */
    email: string;
  };
  /** Message de suivi ou demande à transmettre, selon le contrat contenant ce champ. */
  message: PendingProfileProvision;
};

/**
 * Opérations de stockage nécessaires à l’inscription et à la livraison du profil ; implémentées par
 * Prisma ou une doublure de test.
 */
export interface RegistrationStore {
  /** Vérifie que le stockage peut répondre avant de déclarer Auth prêt. */
  checkReady(): Promise<void>;
  /** Crée atomiquement le compte en attente et sa demande de profil ; refuse un email déjà utilisé. */
  createPendingRegistration(
    input: CreateRegistrationInput,
  ): Promise<CreatedRegistration>;
  /** Recherche le compte avec son état et son empreinte de mot de passe ; renvoie null s’il n’existe pas. */
  findAccountByEmail(email: string): Promise<AccountForLogin | null>;
  /** Liste au plus limit demandes arrivées à leur prochaine date de tentative. */
  listPendingProvisions(limit: number): Promise<PendingProfileProvision[]>;
  /** Incrémente les tentatives et reporte une demande encore en attente, sans activer le compte. */
  markProvisionAttemptFailed(
    message: PendingProfileProvision,
    errorCode: string,
  ): Promise<void>;
  /** Confirme la livraison et active atomiquement le compte encore en attente. */
  markProvisioned(message: PendingProfileProvision): Promise<void>;
  /** Enregistre le conflit définitif et empêche l’activation du compte. */
  markProvisionPermanentlyFailed(
    message: PendingProfileProvision,
    errorCode: PermanentProvisionCode,
  ): Promise<void>;
}

/**
 * Livre une demande à Users. Sa résolution confirme le profil ; son rejet distingue conflit définitif
 * et panne à retenter.
 */
export type ProfileProvisioner = (
  message: PendingProfileProvision,
) => Promise<void>;

/** Conflits connus empêchant définitivement la création du profil pour cette demande. */
export type PermanentProvisionCode =
  | "USERNAME_TAKEN"
  | "PROFILE_CONFLICT";

/** Signale un email déjà enregistré afin que la route renvoie un conflit sans exposer les détails SQL. */
export class DuplicateEmailError extends Error {
  /** Initialise l’erreur métier et son identité ; aucun accès réseau ou SQL. */
  constructor() {
    super("email already registered");
    this.name = "DuplicateEmailError";
  }
}

/**
 * Porte le code d’un conflit définitif signalé par Users ; ne doit pas être traité comme une simple
 * panne réseau.
 */
export class PermanentProfileProvisionError extends Error {
  /** Initialise l’erreur métier et son identité ; aucun accès réseau ou SQL. */
  constructor(public readonly code: PermanentProvisionCode) {
    super(code);
    this.name = "PermanentProfileProvisionError";
  }
}

/** Résultat de livraison : profil confirmé, nouvelle tentative attendue ou conflit définitif. */
export type DeliveryResult =
  | {
    /** Résultat de cette livraison, sans confondre attente et confirmation. */
    status: "delivered" }
  | {
    /** État simulé de livraison de la demande dans la boîte d’envoi du test. */
    status: "pending" }
  | {
    /** Statut HTTP du refus conservé pour que la route ou le client le traite. */
    status: "permanent_failure";
    /** Code de refus public ou code métier, distinct du message détaillé interne. */
    code: PermanentProvisionCode };

/**
 * Conserve seulement un nom d’erreur borné à 80 caractères, sans enregistrer son message
 * potentiellement sensible.
 */
function safeErrorCode(error: unknown): string {
  if (error instanceof Error && error.name) {
    return error.name.slice(0, 80);
  }
  return "UnknownProvisionError";
}

/**
 * Livre la demande, puis active le compte en cas de succès. Une panne reporte la tentative ; un
 * conflit connu marque le compte en échec.
 * @param store Stockage du compte et de la demande durable.
 * @param provisionProfile Envoi au service Users.
 * @param message Demande à livrer avec son identité stable.
 * @returns État confirmé de cette tentative ; une erreur de stockage peut encore rejeter la promesse.
 */
export async function deliverProfileProvision(
  store: RegistrationStore,
  provisionProfile: ProfileProvisioner,
  message: PendingProfileProvision,
): Promise<DeliveryResult> {
  try {
    await provisionProfile(message);
    await store.markProvisioned(message);
    return { status: "delivered" };
  } catch (error) {
    if (error instanceof PermanentProfileProvisionError) {
      await store.markProvisionPermanentlyFailed(message, error.code);
      return { status: "permanent_failure", code: error.code };
    }

    await store.markProvisionAttemptFailed(message, safeErrorCode(error));
    return { status: "pending" };
  }
}
