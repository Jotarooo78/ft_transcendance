import Fastify from 'fastify';
import client from 'prom-client';
import postgres from '@fastify/postgres';
import jwt from '@fastify/jwt';

const app = Fastify({ logger: true });
client.collectDefaultMetrics();

app.register(postgres, { connectionString: process.env.DATABASE_URL });
app.register(jwt, { secret: process.env.JWT_SECRET });

app.get('/health', async () => ({ status: 'ok', service: 'user-service' }));

app.get('/metrics', async (req, reply) => {
  reply.header('Content-Type', client.register.contentType);
  return client.register.metrics();
});

app.get('/me', {
  onRequest: async (req, reply) => {
    try {
      await req.jwtVerify(); // lit et vérifie le header Authorization: Bearer <token>
    } catch {
      reply.code(401).send({ error: 'unauthorized' });
    }
  }
}, async (req, reply) => {
  const { rows } = await app.pg.query(
    'SELECT id, email, display_name, created_at FROM users WHERE id = $1',
    [req.user.sub]
  );
  if (rows.length === 0) {
    reply.code(404);
    return { error: 'user not found' };
  }
  return rows[0];
});

app.listen({ port: 4001, host: '0.0.0.0' });