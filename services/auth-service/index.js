import Fastify from 'fastify';
import client from 'prom-client';
import postgres from '@fastify/postgres';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import argon2 from 'argon2';

const app = Fastify({ logger: true });
client.collectDefaultMetrics({ prefix: 'auth_service_' });

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['service', 'method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
});

app.register(postgres, { connectionString: process.env.DATABASE_URL });
app.register(jwt, { secret: process.env.JWT_SECRET });
app.register(rateLimit, {
  global: false,
  max: 120,
  timeWindow: '1 minute',
});

app.addHook('onRequest', async (req) => {
  req.requestStart = process.hrtime.bigint();
});

app.addHook('onResponse', async (req, reply) => {
  const durationNs = process.hrtime.bigint() - req.requestStart;
  const durationSeconds = Number(durationNs) / 1e9;
  const route = req.routeOptions?.url ?? 'unknown';

  httpRequestDurationSeconds
    .labels('auth-service', req.method, route, String(reply.statusCode))
    .observe(durationSeconds);
});

app.get('/health', async () => ({ status: 'ok', service: 'auth-service' }));

app.get('/ready', async (req, reply) => {
  try {
    await app.pg.query('SELECT 1');
    return { status: 'ready', service: 'auth-service' };
  } catch {
    reply.code(503);
    return { status: 'not-ready', service: 'auth-service' };
  }
});

app.get('/metrics', async (req, reply) => {
  reply.header('Content-Type', client.register.contentType);
  return client.register.metrics();
});

app.post('/signup', {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: '1 minute',
    },
  },
}, async (req, reply) => {
  const { email, password } = req.body;
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!normalizedEmail || !password || password.length < 8) {
    reply.code(400);
    return { error: 'email and password (min 8 chars) required' };
  }

  const passwordHash = await argon2.hash(password);

  try {
    const { rows } = await app.pg.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [normalizedEmail, passwordHash]
    );
    reply.code(201);
    return rows[0];
  } catch (err) {
    if (err.code === '23505') {
      reply.code(409);
      return { error: 'email already registered' };
    }
    throw err;
  }
});

app.post('/login', {
  config: {
    rateLimit: {
      max: 20,
      timeWindow: '1 minute',
    },
  },
}, async (req, reply) => {
  const { email, password } = req.body;

  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normalizedEmail || !password) {
    reply.code(400);
    return { error: 'email and password required' };
  }

  const { rows } = await app.pg.query(
    'SELECT id, password_hash FROM users WHERE email = $1',
    [normalizedEmail]
  );
  if (rows.length === 0) {
    reply.code(401);
    return { error: 'invalid credentials' };
  }

  const valid = await argon2.verify(rows[0].password_hash, password);
  if (!valid) {
    reply.code(401);
    return { error: 'invalid credentials' };
  }

  const token = app.jwt.sign({ sub: rows[0].id, email: normalizedEmail }, { expiresIn: '1h' });
  return { token };
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
    await app.listen({ port: 4000, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();