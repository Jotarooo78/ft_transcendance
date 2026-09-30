# Structure des services M1

Les six services suivent la même structure technique. Chaque service possède
son code, son client Prisma, sa baseline et son schéma PostgreSQL.

## Fichiers communs

| Fichier | Rôle |
| --- | --- |
| `.dockerignore` | Exclut les dépendances et fichiers générés de l'image. |
| `Dockerfile` | Construit et démarre le conteneur. |
| `package.json`, `package-lock.json` | Déclarent et verrouillent les dépendances. |
| `tsconfig.json` | Configure la compilation TypeScript. |
| `prisma.migration.config.ts` | Lit l'URL du rôle de migration. |
| `prisma/schema.prisma` | Déclare les modèles possédés par le service. |
| `prisma/migrations/*_baseline_*/migration.sql` | Crée le schéma métier depuis une database neuve. |
| `src/database/prisma.ts` | Instancie le client avec l'URL runtime. |
| `src/database/prisma.smoke.ts` | Vérifie une connexion runtime simple. |

`node_modules`, `dist` et `src/generated/prisma` sont générés localement et ne
sont pas versionnés.

## Répartition des données

| Service | Port | Schéma | Tables métier |
| --- | ---: | --- | --- |
| Auth | 4000 | `auth` | comptes et outbox |
| Users | 4001 | `users` | profils, inbox, amis et présences |
| Catalog | 4002 | `catalog` | artistes, membres, morceaux, sorties, crédits et genres |
| Media | 4003 | `media` | assets et variantes |
| Library | 4004 | `library` | playlists, occurrences et favoris |
| Playback | 4005 | `playback` | sessions et événements d'écoute |

Les schémas complets et les cardinalités sont décrits dans
[`SCHEMA_DONNEES.md`](SCHEMA_DONNEES.md).

## Ordre de démarrage Docker

1. PostgreSQL initialise les 12 rôles et les six schémas sur un volume neuf.
2. Les six conteneurs `migrate-*` appliquent leur baseline avec leur rôle de
   migration.
3. `apply-database-permissions` fixe les propriétaires et les droits runtime.
4. Les services HTTP démarrent avec leurs comptes runtime.

Un service ne peut donc pas démarrer avant la réussite de la structure et des
permissions de toute la database.

## Santé et métriques

Tous les services exposent :

| Route | Signification |
| --- | --- |
| `GET /health` | Le processus HTTP répond. |
| `GET /ready` | Le service indique s'il peut travailler. |
| `GET /metrics` | Métriques au format Prometheus. |

Auth et Users possèdent déjà leurs parcours métier HTTP. Catalog, Media,
Library et Playback ont leur modèle de données complet, mais leurs handlers
métier seront branchés dans une étape ultérieure.

## Isolation

Chaque service reçoit une URL runtime limitée à son schéma. Les rôles de
migration possèdent les objets ; les rôles runtime ne peuvent ni créer ni
modifier la structure. Les références interservices sont des UUID logiques :
aucune clé étrangère ne traverse une frontière de propriété.

Le scénario [`tests/per/run.sh`](../tests/per/run.sh) reconstruit et contrôle
cette structure sur une database jetable.
