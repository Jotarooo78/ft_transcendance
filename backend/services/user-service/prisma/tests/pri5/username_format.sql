-- Preuve SQL de les données et refus propres au scénario décrit dans le README voisin. Une assertion échouée arrête psql ; les fixtures ne doivent être exécutées que dans leur cible de test contrôlée.
-- Encadre les écritures de fixture pour que le scénario puisse les valider ou les annuler explicitement.
BEGIN;

INSERT INTO "users"."profiles" ("user_id", "username", "display_name")
VALUES (
    'a1111111-1111-4111-8111-111111111111',
    'pri5_canonical',
    'Canonical username'
);

DO $test$
DECLARE
    violated_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO "users"."profiles" ("user_id", "username", "display_name")
        VALUES (
            'a2222222-2222-4222-8222-222222222222',
            ' Not_Canonical ',
            'Non-canonical username'
        );
        RAISE EXCEPTION 'PRI-5 expected a check_violation for a non-canonical username';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS violated_constraint = CONSTRAINT_NAME;
            IF violated_constraint <> 'profiles_username_canonical_check' THEN
                RAISE EXCEPTION
                    'PRI-5 expected profiles_username_canonical_check, got %',
                    violated_constraint;
            END IF;
    END;
END
$test$;

-- Retire les écritures d’essai de cette transaction après les assertions.
ROLLBACK;
