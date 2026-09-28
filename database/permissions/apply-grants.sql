\set ON_ERROR_STOP on

BEGIN;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public, auth, users FROM auth_runtime, users_runtime;
REVOKE ALL ON SCHEMA auth, users FROM PUBLIC;

GRANT USAGE ON SCHEMA auth TO auth_runtime;
GRANT USAGE ON SCHEMA users TO users_runtime;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM auth_runtime, users_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA auth FROM auth_runtime, users_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA users FROM auth_runtime, users_runtime;

GRANT SELECT, INSERT, UPDATE
  ON TABLE auth.accounts, auth.outbox_messages
  TO auth_runtime;

GRANT SELECT, INSERT
  ON TABLE users.profiles, users.inbox_messages
  TO users_runtime;

COMMIT;
