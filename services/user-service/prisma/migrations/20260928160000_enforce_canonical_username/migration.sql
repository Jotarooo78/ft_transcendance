-- Historical rows are intentionally not rewritten. The migration may proceed
-- only when the audited database already satisfies the canonical contract.
DO $preflight$
DECLARE
    noncanonical_username_count BIGINT;
BEGIN
    SELECT COUNT(*)
      INTO noncanonical_username_count
      FROM "users"."profiles"
     WHERE "username" <> lower(btrim("username"))
        OR "username" !~ '^[a-z0-9_]{3,30}$';

    IF noncanonical_username_count > 0 THEN
        RAISE EXCEPTION
            'USERNAME migration blocked: % historical username(s) are not canonical',
            noncanonical_username_count;
    END IF;
END
$preflight$;

ALTER TABLE "users"."profiles"
    ADD CONSTRAINT "profiles_username_canonical_check"
    CHECK (
        "username" = lower(btrim("username"))
        AND "username" ~ '^[a-z0-9_]{3,30}$'
    );
