import Fastify from "fastify";
import client from "prom-client";
import { disconnectPrisma, prisma } from "./database/prisma.js";

const app = Fastify({ logger: true });
client.collectDefaultMetrics({ prefix: "catalog_service_" });

app.get("/health", async () => ({ status: "ok", service: "catalog-service" }));
app.get("/ready", async (_request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ready", service: "catalog-service" };
  } catch {
    reply.code(503);
    return { status: "not-ready", service: "catalog-service" };
  }
});
app.get("/metrics", async (_request, reply) => {
  reply.header("Content-Type", client.register.contentType);
  return client.register.metrics();
});
app.addHook("onClose", disconnectPrisma);

await app.listen({ port: Number(process.env.PORT ?? 4002), host: "0.0.0.0" });
