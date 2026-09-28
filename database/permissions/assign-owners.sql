\set ON_ERROR_STOP on

BEGIN;

ALTER SCHEMA auth OWNER TO auth_migration;
ALTER TABLE auth.accounts OWNER TO auth_migration;

ALTER SCHEMA users OWNER TO users_migration;
ALTER TABLE users.profiles OWNER TO users_migration;
ALTER TABLE users.inbox_messages OWNER TO users_migration;

ALTER TABLE public.users OWNER TO users_migration;
ALTER TABLE public._prisma_migrations OWNER TO users_migration;
GRANT USAGE ON SCHEMA public TO users_migration;

COMMIT;
