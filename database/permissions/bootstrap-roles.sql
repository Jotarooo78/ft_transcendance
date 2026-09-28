\set ON_ERROR_STOP on

SELECT format(
  'CREATE ROLE auth_migration LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  :'auth_migration_password'
)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = 'auth_migration'
)
\gexec

SELECT format(
  'CREATE ROLE users_migration LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  :'users_migration_password'
)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = 'users_migration'
)
\gexec

SELECT format(
  'CREATE ROLE auth_runtime LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  :'auth_runtime_password'
)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = 'auth_runtime'
)
\gexec

SELECT format(
  'CREATE ROLE users_runtime LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  :'users_runtime_password'
)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = 'users_runtime'
)
\gexec

ALTER ROLE auth_migration PASSWORD :'auth_migration_password';
ALTER ROLE users_migration PASSWORD :'users_migration_password';
ALTER ROLE auth_runtime PASSWORD :'auth_runtime_password';
ALTER ROLE users_runtime PASSWORD :'users_runtime_password';

REVOKE CONNECT ON DATABASE :"database_name" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"database_name"
  TO auth_migration, users_migration, auth_runtime, users_runtime;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
