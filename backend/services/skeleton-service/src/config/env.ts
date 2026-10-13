import { Type, type Static } from 'typebox'
import { Value } from 'typebox/value'

const EnvSchema = Type.Object({
  PORT: Type.Optional(Type.String({ pattern: '^[0-9]+$' })),
  JWT_SECRET: Type.String({ minLength: 1 }),
})

export type Config = { port: number; jwtSecret: string }

/** Port interne du service ; Compose ne le fournit pas, il fait partie du contrat avec Nginx. */
const defaultPort = 4099

/** Lit les variables d'environnement ; lève une erreur nommant la première variable invalide. */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const [issue] = Value.Errors(EnvSchema, source)
  if (issue) {
    throw new Error(`Invalid environment: ${issue.instancePath || '/'} ${issue.message}`)
  }
  const env = source as Static<typeof EnvSchema>
  return { port: Number(env.PORT ?? defaultPort), jwtSecret: env.JWT_SECRET }
}
