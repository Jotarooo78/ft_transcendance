import Fastify from 'fastify';
import client from 'prom-client';

const app = Fastify({ logger: true });

// Métriques Prometheus par défaut (CPU, mémoire, event loop...)
// -> reprises telles quelles quand le vrai module Prometheus/Grafana
//    sera branché dessus.
client.collectDefaultMetrics();

app.get('/health', async () => {
  return { status: 'ok', service: 'auth-service' };
});

app.get('/metrics', async (req, reply) => {
  reply.header('Content-Type', client.register.contentType);
  return client.register.metrics();
});

// Placeholder : la vraie logique (signup/login, hash+salt, JWT)
// remplace ceci quand le module User Management sera pris en charge.
app.post('/signup', async (req, reply) => {
  reply.code(501);
  return { error: 'not implemented yet' };
});

app.post('/login', async (req, reply) => {
  reply.code(501);
  return { error: 'not implemented yet' };
});

app.listen({ port: 4000, host: '0.0.0.0' });
