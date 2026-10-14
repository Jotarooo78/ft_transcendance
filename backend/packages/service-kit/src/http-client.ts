/**
 * @file http-client.ts
 * @brief Appels HTTP d'un service vers un autre.
 *
 * @details Les services ne partagent pas de base de données : quand l'un a besoin d'une information
 *   détenue par un autre, il le lui demande par HTTP, comme le ferait un navigateur. Par exemple,
 *   library-service demande à catalog-service si un morceau existe avant de l'ajouter à une
 *   playlist.
 *
 * Ce fichier fournit la fonction qui fait ces appels, avec trois protections : un délai maximal (si
 * l'autre service ne répond pas en 2 secondes, on abandonne au lieu d'attendre indéfiniment), le
 * refus des redirections, et une taille de réponse limitée. Un service lent ou en panne ne peut
 * donc pas bloquer celui qui l'appelle.
 */

/** @brief Ce qu'il faut préciser pour appeler un autre service. */
export type JsonRequest = {
  /**
   * @brief Méthode HTTP : `GET` pour lire (valeur par défaut), `PUT` ou `POST` pour envoyer des
   *   données.
   */
  method?: string
  /**
   * @brief En-têtes HTTP à joindre à l'appel, par exemple le jeton interne qui prouve que
   *   l'appelant est un service.
   */
  headers?: Record<string, string>
  /** @brief Données à envoyer. Elles sont converties en JSON automatiquement. */
  body?: unknown
  /**
   * @brief Durée maximale de l'appel en millisecondes. Passé ce délai, l'appel échoue. 2000 par
   *   défaut.
   */
  timeoutMs?: number
}

/** @brief Réponse reçue de l'autre service. */
export type JsonResponse = {
  /** @brief Statut HTTP reçu : 200, 404, 503… */
  status: number
  /** @brief Vrai si le statut indique un succès (entre 200 et 299). */
  ok: boolean
  /**
   * @brief Contenu de la réponse, déjà décodé du JSON. Vaut null si la réponse est vide ou n'est
   *   pas du JSON. Son type est inconnu : l'appelant doit vérifier ce qu'il contient avant de s'en
   *   servir.
   */
  body: unknown
}

/** @brief Délai maximal d'un appel quand l'appelant n'en précise pas : 2 secondes. */
const defaultTimeoutMs = 2000
/**
 * @brief Taille maximale acceptée pour une réponse : 64 Kio. Les réponses entre services sont
 *   toujours petites ; une réponse énorme signale un problème.
 */
const maxBodyLength = 64 * 1024

/**
 * @brief Convertit un texte JSON en valeur JavaScript, sans jamais provoquer d'erreur.
 * @param text Texte reçu.
 * @returns La valeur décodée, ou null si le texte n'est pas du JSON valide.
 */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * @brief Appelle un autre service et renvoie sa réponse.
 * @details Point important : un statut d'erreur comme 404 ou 503 ne provoque pas d'exception. Il
 *   est renvoyé dans `status`, et c'est l'appelant qui décide ce qu'il signifie : pour
 *   library-service, un 404 du catalogue veut dire « ce morceau n'existe pas », ce qui est une
 *   réponse normale. Une exception n'est levée que si l'appel lui-même n'a pas pu aboutir.
 * @param url Adresse complète de la route à appeler, par exemple
 *   `http://catalog-service:4002/tracks/<id>`.
 * @param request Méthode, en-têtes, données et délai.
 * @returns Le statut, l'indicateur de succès et le contenu décodé.
 * @throws {Error} Si l'autre service est injoignable, s'il dépasse le délai, s'il répond par une
 *   redirection ou si sa réponse est trop volumineuse.
 */
export async function fetchJson(
  url: URL | string,
  request: JsonRequest = {}
): Promise<JsonResponse> {
  const { method = 'GET', headers = {}, body, timeoutMs = defaultTimeoutMs } = request
  const response = await fetch(url, {
    method,
    headers: body === undefined ? headers : { ...headers, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error',
  })
  const text = await response.text()
  if (text.length > maxBodyLength) {
    throw new Error('Response body exceeds the internal limit')
  }
  return { status: response.status, ok: response.ok, body: parseJson(text) }
}

/**
 * @brief Dit si une valeur de type inconnu est un objet (au sens `{ clé: valeur }`).
 * @details Les données venues de l'extérieur (corps d'une requête, réponse d'un autre service) sont
 *   de type `unknown` : TypeScript interdit d'y lire un champ sans vérification. Cette fonction
 *   fait la vérification de base.
 * @param value Valeur à tester.
 * @returns Vrai pour un objet ; faux pour un tableau, pour null, ou pour un texte, un nombre, un
 *   booléen.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
