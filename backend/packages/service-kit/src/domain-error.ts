/**
 * Refus métier attendu. Le client reçoit `{ error: code, ...details }` avec ce statut :
 * `details` porte les champs publics supplémentaires d'un contrat (`code`, `message`…).
 */
export class DomainError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(code)
    this.name = 'DomainError'
  }
}
