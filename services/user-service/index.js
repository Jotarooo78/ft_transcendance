import Fastify from 'fastify';
import client from 'prom-client';

const app = Fastify({ logger: true });
client.collectDefaultMetrics();

app.get('/health', async () => {
  return { status: 'ok', service: 'user-service' };
});

app.get('/metrics', async (req, reply) => {
  reply.header('Content-Type', client.register.contentType);
  return client.register.metrics();
});

// Placeholder : profils, avatars, liste d'amis, statut en ligne...
app.get('/me', async (req, reply) => {
  reply.code(501);
  return { error: 'not implemented yet' };
});

app.listen({ port: 4001, host: '0.0.0.0' });
