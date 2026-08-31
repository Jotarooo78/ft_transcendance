import Fastify from 'fastify';
import client from 'prom-client';
import postgres from '@fastify/postgres';
import jwt from '@fastify/jwt';
import argon2 from 'argon2';

const app = Fastify({ logger: true });
client.collectDefaultMetrics();

app.register(postgres, { connectionString: process.env.DATABASE_URL });
app.register(jwt, { secret: process.env.JWT_SECRET });

app.get('/health', async () => ({ status: 'ok', service: 'auth-service' }));

app.get('/metrics', async (req, reply) => {
  reply.header('Content-Type', client.register.contentType);
  return client.register.metrics();
});

app.post('/signup', async (req, reply) => {
  const { email, password } = req.body;
  if (!email || !password || password.length < 8) {
    reply.code(400);
    return { error: 'email and password (min 8 chars) required' };
  }

  const passwordHash = await argon2.hash(password);

  try {
    const { rows } = await app.pg.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, passwordHash]
    );
    reply.code(201);
    return rows[0];
  } catch (err) {
    if (err.code === '23505') { // violation de contrainte UNIQUE
      reply.code(409);
      return { error: 'email already registered' };
    }
    throw err;
  }
});

app.post('/login', async (req, reply) => {
  const { email, password } = req.body;

  const { rows } = await app.pg.query(
    'SELECT id, password_hash FROM users WHERE email = $1',
    [email]
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

  const token = app.jwt.sign({ sub: rows[0].id, email }, { expiresIn: '1h' });
  return { token };
});

app.listen({ port: 4000, host: '0.0.0.0' });