/** Adaptation HTTP des projets ; aucune requête SQL dans ce fichier. */
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { ProjectsService } from '../services/projects.service.js'
import type { ProjectInput } from '../domain/project.js'
/** Chemin validé contenant l’identité stable du projet. */
type Params = { id: string }
/** Paramètres de pagination et recherche validés avant l’appel. */
type Query = { q?: string; page?: number; pageSize?: number; owner?: string }
/** Assemble les contrôleurs ; les versions et identités viennent de la requête validée. */
export function createProjectsController(service: ProjectsService) {
  return {
    /** Liste publique ou personnelle selon la route enregistrée. */
    list: (privateList: boolean) => (request: FastifyRequest<{ Querystring: Query }>) =>
      service.list(request.query, request.headers.authorization, privateList),
    /** Détail publié ou détail du propriétaire. */
    get: (privateRead: boolean) => (request: FastifyRequest<{ Params: Params }>) =>
      service.get(request.params.id.toLowerCase(), request.headers.authorization, privateRead),
    /** Sauvegarde complète du brouillon ou des métadonnées publiées. */
    save: (request: FastifyRequest<{ Params: Params; Body: ProjectInput }>) =>
      service.save(request.params.id.toLowerCase(), request.headers.authorization, request.body),
    /** Publication explicitement demandée par le compte. */
    publish: (request: FastifyRequest<{ Params: Params; Body: { expectedVersion: number } }>) =>
      service.publish(
        request.params.id.toLowerCase(),
        request.headers.authorization,
        request.body.expectedVersion
      ),
    /** Le succès 204 signifie que les références retirées et leur nettoyage ont été traités. */
    async discard(
      request: FastifyRequest<{ Params: Params; Body: { expectedVersion: number } }>,
      reply: FastifyReply
    ) {
      await service.discard(
        request.params.id.toLowerCase(),
        request.headers.authorization,
        request.body.expectedVersion
      )
      return reply.code(204).send()
    },
  }
}
