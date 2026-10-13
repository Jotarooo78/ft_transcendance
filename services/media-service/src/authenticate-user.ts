import type { FastifyReply, FastifyRequest } from "fastify";

declare module "fastify" { interface FastifyRequest { authenticatedUserId?: string } }
declare module "@fastify/jwt" {
  interface FastifyJWT { payload: { sub?: unknown; exp?: number; [claim: string]: unknown }; user: { sub?: unknown; exp?: number; [claim: string]: unknown } }
}

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Attach only to private routes: public audio keeps its publication check.
export async function authenticateUser(request: FastifyRequest, reply: FastifyReply) {
  request.authenticatedUserId = undefined;
  reply.header("Cache-Control", "no-store");
  try {
    await request.jwtVerify();
    const { sub, exp } = request.user;
    if (typeof sub !== "string" || !uuidPattern.test(sub) ||
      typeof exp !== "number" || !Number.isFinite(exp) || exp <= Date.now() / 1000) {
      throw new Error("Invalid session");
    }
    request.authenticatedUserId = sub.toLowerCase();
  } catch { return reply.code(401).send(request.method === "HEAD" ? undefined : { error: "unauthorized" }); }
}
