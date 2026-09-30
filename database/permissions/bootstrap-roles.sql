\set ON_ERROR_STOP on

SELECT format('CREATE ROLE auth_migration LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', :'auth_migration_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auth_migration')
\gexec
SELECT format('CREATE ROLE auth_runtime LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', :'auth_runtime_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auth_runtime')
\gexec
SELECT format('CREATE ROLE users_migration LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', :'users_migration_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'users_migration')
\gexec
SELECT format('CREATE ROLE users_runtime LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', :'users_runtime_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'users_runtime')
\gexec
SELECT format('CREATE ROLE catalog_migration LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', :'catalog_migration_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'catalog_migration')
\gexec
SELECT format('CREATE ROLE catalog_runtime LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', :'catalog_runtime_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'catalog_runtime')
\gexec
SELECT format('CREATE ROLE media_migration LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', :'media_migration_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'media_migration')
\gexec
SELECT format('CREATE ROLE media_runtime LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', :'media_runtime_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'media_runtime')
\gexec
SELECT format('CREATE ROLE library_migration LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', :'library_migration_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'library_migration')
\gexec
SELECT format('CREATE ROLE library_runtime LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', :'library_runtime_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'library_runtime')
\gexec
SELECT format('CREATE ROLE playback_migration LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', :'playback_migration_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'playback_migration')
\gexec
SELECT format('CREATE ROLE playback_runtime LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', :'playback_runtime_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'playback_runtime')
\gexec

ALTER ROLE auth_migration PASSWORD :'auth_migration_password';
ALTER ROLE auth_runtime PASSWORD :'auth_runtime_password';
ALTER ROLE users_migration PASSWORD :'users_migration_password';
ALTER ROLE users_runtime PASSWORD :'users_runtime_password';
ALTER ROLE catalog_migration PASSWORD :'catalog_migration_password';
ALTER ROLE catalog_runtime PASSWORD :'catalog_runtime_password';
ALTER ROLE media_migration PASSWORD :'media_migration_password';
ALTER ROLE media_runtime PASSWORD :'media_runtime_password';
ALTER ROLE library_migration PASSWORD :'library_migration_password';
ALTER ROLE library_runtime PASSWORD :'library_runtime_password';
ALTER ROLE playback_migration PASSWORD :'playback_migration_password';
ALTER ROLE playback_runtime PASSWORD :'playback_runtime_password';

REVOKE CONNECT, TEMPORARY ON DATABASE :"database_name" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"database_name" TO
  auth_migration, auth_runtime,
  users_migration, users_runtime,
  catalog_migration, catalog_runtime,
  media_migration, media_runtime,
  library_migration, library_runtime,
  playback_migration, playback_runtime;

REVOKE ALL ON SCHEMA public FROM PUBLIC;

CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION auth_migration;
CREATE SCHEMA IF NOT EXISTS users AUTHORIZATION users_migration;
CREATE SCHEMA IF NOT EXISTS catalog AUTHORIZATION catalog_migration;
CREATE SCHEMA IF NOT EXISTS media AUTHORIZATION media_migration;
CREATE SCHEMA IF NOT EXISTS library AUTHORIZATION library_migration;
CREATE SCHEMA IF NOT EXISTS playback AUTHORIZATION playback_migration;

ALTER SCHEMA auth OWNER TO auth_migration;
ALTER SCHEMA users OWNER TO users_migration;
ALTER SCHEMA catalog OWNER TO catalog_migration;
ALTER SCHEMA media OWNER TO media_migration;
ALTER SCHEMA library OWNER TO library_migration;
ALTER SCHEMA playback OWNER TO playback_migration;

REVOKE ALL ON SCHEMA auth, users, catalog, media, library, playback FROM PUBLIC;

GRANT USAGE, CREATE ON SCHEMA auth TO auth_migration;
GRANT USAGE, CREATE ON SCHEMA users TO users_migration;
GRANT USAGE, CREATE ON SCHEMA catalog TO catalog_migration;
GRANT USAGE, CREATE ON SCHEMA media TO media_migration;
GRANT USAGE, CREATE ON SCHEMA library TO library_migration;
GRANT USAGE, CREATE ON SCHEMA playback TO playback_migration;
GRANT USAGE ON SCHEMA auth TO auth_runtime;
GRANT USAGE ON SCHEMA users TO users_runtime;
GRANT USAGE ON SCHEMA catalog TO catalog_runtime;
GRANT USAGE ON SCHEMA media TO media_runtime;
GRANT USAGE ON SCHEMA library TO library_runtime;
GRANT USAGE ON SCHEMA playback TO playback_runtime;

ALTER ROLE auth_migration IN DATABASE :"database_name" SET search_path TO auth, pg_catalog;
ALTER ROLE auth_runtime IN DATABASE :"database_name" SET search_path TO auth, pg_catalog;
ALTER ROLE users_migration IN DATABASE :"database_name" SET search_path TO users, pg_catalog;
ALTER ROLE users_runtime IN DATABASE :"database_name" SET search_path TO users, pg_catalog;
ALTER ROLE catalog_migration IN DATABASE :"database_name" SET search_path TO catalog, pg_catalog;
ALTER ROLE catalog_runtime IN DATABASE :"database_name" SET search_path TO catalog, pg_catalog;
ALTER ROLE media_migration IN DATABASE :"database_name" SET search_path TO media, pg_catalog;
ALTER ROLE media_runtime IN DATABASE :"database_name" SET search_path TO media, pg_catalog;
ALTER ROLE library_migration IN DATABASE :"database_name" SET search_path TO library, pg_catalog;
ALTER ROLE library_runtime IN DATABASE :"database_name" SET search_path TO library, pg_catalog;
ALTER ROLE playback_migration IN DATABASE :"database_name" SET search_path TO playback, pg_catalog;
ALTER ROLE playback_runtime IN DATABASE :"database_name" SET search_path TO playback, pg_catalog;
