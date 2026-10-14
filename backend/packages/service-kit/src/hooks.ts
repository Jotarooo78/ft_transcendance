/**
 * @file hooks.ts
 * @brief Petites fonctions réutilisables à brancher sur une route.
 *
 * @details Dans Fastify, un « hook » est une fonction exécutée à un moment précis du traitement
 *   d'une requête. `onRequest` est le tout premier moment : avant la lecture du corps, avant la
 *   validation, avant notre code.
 */

import type { FastifyReply, FastifyRequest } from 'fastify'

/**
 * @brief Interdit aux navigateurs et aux serveurs intermédiaires de garder la réponse en mémoire.
 * @details À utiliser sur une route dont la réponse est privée ou peut changer à tout instant. Elle
 *   ajoute l'en-tête HTTP `Cache-Control: no-store`. Comme elle s'exécute dès l'arrivée de la
 *   requête, l'en-tête est présent même si la requête est ensuite refusée.
 * @param _request Requête reçue ; elle n'est pas utilisée, d'où le tiret bas devant son nom.
 * @param reply Réponse en cours de préparation, sur laquelle l'en-tête est ajouté.
 */
export async function noStore(_request: FastifyRequest, reply: FastifyReply) {
  reply.header('Cache-Control', 'no-store')
}
