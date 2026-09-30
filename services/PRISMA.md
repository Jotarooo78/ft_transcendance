# Prisma dans les services propriétaires

## Principe

Chaque service génère son propre client Prisma et ne voit que les modèles de
son schéma PostgreSQL : `auth`, `users`, `catalog`, `media`, `library` ou
`playback`.

```text
schema.prisma -> prisma:generate -> TypeScript généré -> build -> client runtime
```

Les six services utilisent Node.js 22, des modules ESM et Prisma `7.10.0`.
Prisma 7 utilise `@prisma/adapter-pg` au runtime.

## Baselines

Chaque service possède une migration baseline autonome :

| Service | Tables métier |
| --- | --- |
| Auth | `accounts`, `outbox_messages` |
| Users | `profiles`, `inbox_messages`, `friends`, `presences` |
| Catalog | `artists`, `artist_members`, `tracks`, `track_artists`, `releases`, `release_artists`, `release_tracks`, `genres`, `track_genres` |
| Media | `assets`, `variants` |
| Library | `playlists`, `playlist_items`, `track_favorites` |
| Playback | `sessions`, `events` |

Les migrations remplacent l'ancien historique incrémental PRI-2. Elles sont
destinées à une nouvelle database ou à un nouveau volume PostgreSQL.

## Commandes

Exécuter les commandes depuis le dossier du service concerné.

| Commande | Effet |
| --- | --- |
| `npm run prisma:generate` | Génère le client dans `src/generated/prisma`. |
| `npm run prisma:migrate:dev -- --name <nom>` | Conçoit une migration en développement. |
| `npm run prisma:migrate:deploy` | Applique les migrations versionnées avec le rôle de migration. |
| `npm run prisma:smoke` | Compile, se connecte avec le client runtime, exécute `SELECT 1`, puis ferme la connexion. |

`npm run build` lance automatiquement `prisma:generate`. Le serveur HTTP ne
lance jamais de migration.

## Connexions et permissions

Chaque service utilise deux URLs obligatoires :

- `<SERVICE>_MIGRATION_DATABASE_URL` contient le rôle
  `<service>_migration`, propriétaire du schéma et de ses objets ;
- `<SERVICE>_DATABASE_URL` contient le rôle `<service>_runtime`, limité aux
  opérations DML accordées à ses tables.

Le bootstrap SQL crée 12 rôles sans privilèges globaux. `public` n'autorise ni
la création d'objets ni les connexions applicatives implicites. Les scripts
`database/permissions/assign-owners.sql` et
`database/permissions/apply-grants.sql` fixent ensuite les propriétaires et
les droits exacts.

Les références qui traversent les frontières de service restent des UUID sans
clé étrangère SQL. Les clés étrangères, unicités et suppressions en cascade ne
s'appliquent qu'à l'intérieur du schéma propriétaire.

## Installation et preuve

Compose exécute les six conteneurs `migrate-*`, puis
`apply-database-permissions`, avant de démarrer les services. Les scripts
d'initialisation PostgreSQL ne s'exécutent que sur un volume neuf.

Le scénario suivant reconstruit une database jetable, vérifie les 22 tables
métier, les 12 rôles, les propriétaires, les contraintes et l'isolation, puis
rejoue les migrations pour prouver leur idempotence :

```sh
tests/per/run.sh
```

Le détail des objets et cardinalités se trouve dans
[`docs/SCHEMA_DONNEES.md`](../docs/SCHEMA_DONNEES.md).

## Cycle de vie du client

Chaque module `src/database/prisma.ts` crée une instance réutilisée par le
processus. Le hook Fastify `onClose` appelle `prisma.$disconnect()`. Le smoke
test ferme aussi la connexion dans un bloc `finally`.
