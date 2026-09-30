\set ON_ERROR_STOP on

DO $assertions$
DECLARE
    role_name text;
    role_record record;
    schema_name text;
    expected_owner text;
    bad_table record;
BEGIN
    FOREACH role_name IN ARRAY ARRAY[
        'auth_migration', 'auth_runtime',
        'users_migration', 'users_runtime',
        'catalog_migration', 'catalog_runtime',
        'media_migration', 'media_runtime',
        'library_migration', 'library_runtime',
        'playback_migration', 'playback_runtime'
    ] LOOP
        SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
          INTO role_record
          FROM pg_roles
         WHERE rolname = role_name;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'missing role: %', role_name;
        END IF;

        IF NOT role_record.rolcanlogin
           OR role_record.rolsuper
           OR role_record.rolcreatedb
           OR role_record.rolcreaterole
           OR role_record.rolreplication
           OR role_record.rolbypassrls THEN
            RAISE EXCEPTION 'unsafe attributes for role: %', role_name;
        END IF;

        IF has_database_privilege(role_name, current_database(), 'TEMP') THEN
            RAISE EXCEPTION 'service role can create temporary tables: %', role_name;
        END IF;
    END LOOP;

    FOREACH schema_name IN ARRAY ARRAY['auth', 'users', 'catalog', 'media', 'library', 'playback'] LOOP
        expected_owner := schema_name || '_migration';

        IF (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = schema_name)
           IS DISTINCT FROM expected_owner THEN
            RAISE EXCEPTION 'wrong owner for schema %', schema_name;
        END IF;

        IF has_schema_privilege(schema_name || '_runtime', schema_name, 'CREATE') THEN
            RAISE EXCEPTION 'runtime role can create in schema %', schema_name;
        END IF;
    END LOOP;

    SELECT n.nspname AS schema_name, c.relname AS table_name, pg_get_userbyid(c.relowner) AS owner_name
      INTO bad_table
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE n.nspname = ANY (ARRAY['auth', 'users', 'catalog', 'media', 'library', 'playback'])
       AND c.relkind IN ('r', 'p')
       AND pg_get_userbyid(c.relowner) <> n.nspname || '_migration'
     LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'wrong table owner: %.% is owned by %', bad_table.schema_name, bad_table.table_name, bad_table.owner_name;
    END IF;

    IF to_regclass('public.users') IS NOT NULL THEN
        RAISE EXCEPTION 'legacy public.users must not exist';
    END IF;

    IF (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'auth') <> 3
       OR (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'users') <> 5
       OR (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'catalog') <> 10
       OR (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'media') <> 3
       OR (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'library') <> 4
       OR (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'playback') <> 3 THEN
        RAISE EXCEPTION 'unexpected table count in one or more schemas';
    END IF;

    IF has_table_privilege('auth_runtime', 'users.profiles', 'SELECT')
       OR has_table_privilege('users_runtime', 'auth.accounts', 'SELECT')
       OR has_table_privilege('catalog_runtime', 'media.assets', 'SELECT')
       OR has_table_privilege('media_runtime', 'catalog.tracks', 'SELECT')
       OR has_table_privilege('library_runtime', 'playback.sessions', 'SELECT')
       OR has_table_privilege('playback_runtime', 'library.playlists', 'SELECT') THEN
        RAISE EXCEPTION 'a runtime role can read a neighboring schema';
    END IF;

    IF has_table_privilege('auth_runtime', 'auth.accounts', 'DELETE')
       OR has_table_privilege('users_runtime', 'users.profiles', 'DELETE')
       OR has_table_privilege('users_runtime', 'users.inbox_messages', 'UPDATE') THEN
        RAISE EXCEPTION 'Auth or Users received an operation not used by the current code';
    END IF;
END
$assertions$;

SELECT
    table_schema,
    COUNT(*) AS table_count
FROM information_schema.tables
WHERE table_schema IN ('auth', 'users', 'catalog', 'media', 'library', 'playback')
GROUP BY table_schema
ORDER BY table_schema;
