-- Historical state compatible with the controlled no-op strategy: every
-- username is already canonical and the migration must preserve each value.
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
        '11111111-1111-4111-8111-111111111111',
        'Lea@example.test',
        'lea_primary',
        'Léa',
        '$argon2id$fixture$lea',
        'https://example.test/lea.png',
        TIMESTAMP '2026-09-01 10:15:30.123',
        TIMESTAMP '2026-09-02 11:16:31.456'
    ),
    (
        '22222222-2222-4222-8222-222222222222',
        'sam@example.test',
        'sam',
        'Sam',
        '$argon2id$fixture$sam',
        NULL,
        TIMESTAMP '2026-09-03 12:17:32.789',
        TIMESTAMP '2026-09-03 12:17:32.789'
    ),
    (
        '33333333-3333-4333-8333-333333333333',
        'lea@example.test',
        'lea_secondary',
        'Léa secondaire',
        '$argon2id$fixture$lea-secondary',
        NULL,
        TIMESTAMP '2026-09-04 13:18:33.012',
        TIMESTAMP '2026-09-05 14:19:34.345'
    );
