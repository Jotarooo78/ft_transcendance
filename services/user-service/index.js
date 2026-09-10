
import Fastify from 'fastify';
import client from 'prom-client';
import jwt from '@fastify/jwt';
 
const app = Fastify({ logger: true });
client.collectDefaultMetrics({ prefix: 'user_service_' });

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['service', 'method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
});

app.register(jwt, { secret: process.env.JWT_SECRET });

app.addHook('onRequest', async (req) => {
  req.requestStart = process.hrtime.bigint();
});

app.addHook('onResponse', async (req, reply) => {
  const durationNs = process.hrtime.bigint() - req.requestStart;
  const durationSeconds = Number(durationNs) / 1e9;
  const route = req.routeOptions?.url ?? 'unknown';

  httpRequestDurationSeconds
    .labels('user-service', req.method, route, String(reply.statusCode))
    .observe(durationSeconds);
});
 
app.get('/health', async () => ({ status: 'ok', service: 'user-service' }));

app.get('/ready', async () => ({ status: 'ready', service: 'user-service' }));
 
app.get('/metrics', async (req, reply) => {
  reply.header('Content-Type', client.register.contentType);
  return client.register.metrics();
});

app.get('/me', {
  onRequest: async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'unauthorized' });
    }
  },
}, async (req) => {
  return {
    id: req.user.sub,
    email: req.user.email,
  };
});

app.post('/verify', async (req, reply) => {
  try {
    await req.jwtVerify();
    return { valid: true, user: req.user };
  } catch {
    reply.code(401);
    return { valid: false };
  }
});

app.setErrorHandler((err, req, reply) => {
  req.log.error({ err }, 'unhandled error');
  if (!reply.sent) {
    reply.code(500).send({ error: 'internal server error' });
  }
});
 
const start = async () => {
  try {
    await app.listen({ port: 4001, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();