-- Representative state accepted by PRI-2: the mandatory username becomes the
-- display_name only when the legacy displayName is NULL.
INSERT INTO "public"."users" (
    "id",
    "email",
    "username",
    "displayName",
    "passwordHash",
    "avatarUrl",
    "createdAt",
    "updatedAt"
)
VALUES
    (
        '44444444-4444-4444-8444-444444444444',
        'null-name@example.test',
        'null-name',
        NULL,
        '$argon2id$fixture$null-name',
        NULL,
        TIMESTAMP '2026-09-06 15:20:35.678',
        TIMESTAMP '2026-09-06 15:20:35.678'
    );
