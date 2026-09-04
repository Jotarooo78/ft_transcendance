import Fastify from 'fastify';
import client from 'prom-client';
import postgres from '@fastify/postgres';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';

const app = Fastify({ logger: true });

client.collectDefaultMetrics(); //Prometheus collect

app.register(postgres, { connectionString: process.env.DATABASE_URL });
app.register(jwt, { secret: process.env.JWT_SECRET });
app.register(rateLimit, {
  global: false,
});

app.get('/health', async () => ({ status: 'ok', service: 'auth-service' })); //healthcheck

app.get('/metrics', async (req, reply) => {
  reply.header('Content-Type', client.register.contentType); // GPU, CPU info... etc
  return client.register.metrics();
});

app.get('/me', {
  onRequest: async (req, reply) => {
    try {
      await req.jwtVerify();
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

app.post('/login', {
  config: {
    rateLimit: {
      max: 5,
      timeWindow: '1 minute'
    }
  }
}, async (req, reply) => {
  const { email, password } = req.body;
});

const start = async () => { // server launch
  try {
    await app.listen({ port: 4001, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();