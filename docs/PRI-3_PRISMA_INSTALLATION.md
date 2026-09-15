# PRI-3 — Clients Prisma, génération et migration

## Résultat

Les six domaines propriétaires retenus jusqu'à M1 disposent maintenant d'un
client Prisma local à leur service : Auth, Users, Catalogue, Media, Library et
Playback.

Chaque service utilise :

- Node.js 22 ;
- des modules ESM ;
- Prisma CLI, Client et adaptateur PostgreSQL `7.10.0` ;
- le générateur `prisma-client` avec une sortie explicite dans
  `src/generated/prisma` ;
- une instance `PrismaClient` réutilisée par processus ;
- une fermeture explicite avec `$disconnect()`.

Les clients M1 sont raccordés à des conteneurs distincts. Leurs endpoints
`/ready` interrogent PostgreSQL avec leur propre client. Aucun modèle métier M1
n'a été inventé dans cette action : les fichiers `schema.prisma` déclarent
seulement leur schéma propriétaire.

## Frontières

| Service | Schéma visible par son client | Port |
| --- | --- | --- |
| `auth-service` | `auth` | 4000 |
| `user-service` | `users` | 4001 |
| `catalog-service` | `catalog` | 4002 |
| `media-service` | `media` | 4003 |
| `library-service` | `library` | 4004 |
| `playback-service` | `playback` | 4005 |

## Trois opérations distinctes

| Script npm | Usage | Connexion PostgreSQL |
| --- | --- | --- |
| `prisma:generate` | Générer le client après installation ou changement du modèle ; exécuté avant le build | Aucune connexion |
| `prisma:migrate:dev` | Concevoir et appliquer une migration en développement | `<SERVICE>_MIGRATION_DATABASE_URL` |
| `prisma:migrate:deploy` | Appliquer les migrations versionnées pendant une release | `<SERVICE>_MIGRATION_DATABASE_URL` |

Le serveur utilise `<SERVICE>_DATABASE_URL`, avec `DATABASE_URL` comme fallback
temporaire local. Un démarrage normal ne lance jamais `migrate dev` ni
`migrate deploy`.

## Build et runtime

Les Dockerfiles possèdent deux stages logiques :

1. `build` installe aussi les outils de développement, génère le client et
   compile TypeScript ;
2. `runtime` retire les dépendances de développement, optionnelles et peer qui
   ne sont pas nécessaires à l'exécution.

La CLI Prisma n'est donc pas disponible dans le serveur HTTP final. Le client
généré et ses dépendances runtime restent présents.

## Vérifications exécutées — 15 septembre 2026

| Preuve | Résultat observé |
| --- | --- |
| `npm install --package-lock-only --ignore-scripts` sous Node 22 | lockfile créé ou mis à jour pour les six services |
| Build des six stages `build` | `npm ci`, Prisma `7.10.0` generate et `tsc` réussis |
| Build des six images runtime | réussi ; audit npm du runtime : 0 vulnérabilité |
| Smoke Prisma des six services | six `SELECT 1`, codes 0, connexions fermées |
| `/ready` Catalogue, Media, Library et Playback | quatre réponses HTTP 200 `ready` |
| `prisma:migrate:deploy` | code 0 dans six bases `transcendence_pri3_test_*` distinctes |
| `prisma:migrate:dev --create-only` | code 0 pour les six services ; migrations de vérification vides et confinées aux conteneurs éphémères |
| `docker-compose config -q` | code 0 ; avertissement seulement sur les variables Grafana absentes de l'environnement local |
| `git diff --check` | code 0 |

Les six bases de test et les quatre conteneurs de readiness ont été supprimés
après vérification. La base de travail `transcendence` n'a reçu aucune migration
PRI-3.

## Limites et suite

- PRI-2 reste l'unique historique actuellement exécutable pour Auth et Users ;
  il est conservé dans `user-service`. Ne pas lancer un historique Auth séparé
  sur la base partagée avant baselining.
- Plusieurs historiques Prisma indépendants dans la même base PostgreSQL ne
  sont pas encore validés. D09 doit fixer l'autorité et l'isolation avant les
  premières migrations M1 partagées.
- Les URLs de `.env.example` utilisent encore le compte PostgreSQL local commun.
  Les variables runtime/migration sont séparées, mais les rôles SQL à privilèges
  minimaux restent à provisionner.
- `docker-compose` 1.29.2 échoue avec Docker 29 lors de la recréation d'un
  conteneur existant (`KeyError: ContainerConfig`). Les images et la
  configuration sont valides ; l'essai runtime a été effectué avec `docker run`
  sur le réseau Compose existant. Mettre à niveau vers Compose v2 avant le
  prochain `up` complet.

Le mode d'emploi quotidien se trouve dans
[`services/PRISMA.md`](../services/PRISMA.md).
