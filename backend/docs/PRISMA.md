# Base de données et Prisma

Ce document explique comment les données du backend sont organisées, qui a le
droit d'y toucher, et comment les modifier. Il s'adresse à quelqu'un qui n'a
jamais vu le projet.

L'organisation générale du code est décrite dans [CONVENTIONS.md](CONVENTIONS.md).

## Sommaire

1. [L'essentiel en une minute](#1-lessentiel-en-une-minute)
2. [Les notions à connaître](#2-les-notions-à-connaître)
3. [Une base, six schémas](#3-une-base-six-schémas)
4. [Deux rôles par service](#4-deux-rôles-par-service)
5. [Les liens entre services](#5-les-liens-entre-services)
6. [Où sont les fichiers](#6-où-sont-les-fichiers)
7. [Ce qui se passe au démarrage](#7-ce-qui-se-passe-au-démarrage)
8. [Utiliser Prisma dans le code](#8-utiliser-prisma-dans-le-code)
9. [Recettes](#9-recettes)
10. [Commandes](#10-commandes)
11. [Pièges connus](#11-pièges-connus)

---

## 1. L'essentiel en une minute

- Une seule base **PostgreSQL 16**, nommée par `DB_NAME` (`transcendence`).
- Elle est divisée en **six schémas**, un par service. Un service ne voit et ne
  touche que le sien.
- Chaque service a **deux comptes de connexion** : l'un modifie la structure des
  tables (migrations), l'autre lit et écrit les lignes (serveur).
- Les tables sont décrites dans `prisma/schema.prisma` de chaque service.
- **Aucune clé étrangère ne relie deux schémas.** Un service qui référence une
  donnée d'un autre garde seulement son identifiant.

---

## 2. Les notions à connaître

**Schéma PostgreSQL.** Un dossier de tables à l'intérieur d'une base. La table
`playlists` du schéma `library` s'écrit `library.playlists`. Deux schémas peuvent
avoir une table de même nom sans se gêner.

**Rôle.** Un compte de connexion à PostgreSQL, avec des droits précis :
lire telle table, y écrire, la modifier, etc.

**DDL et DML.** Le DDL change la _structure_ (créer une table, ajouter une
colonne). Le DML change les _données_ (insérer, modifier, supprimer des lignes).

**Migration.** Un fichier SQL daté qui fait évoluer la structure. Les migrations
s'appliquent dans l'ordre et une seule fois : la base se souvient de celles déjà
passées, dans la table `_prisma_migrations` de chaque schéma.

**Prisma.** L'outil qui fait le lien entre TypeScript et PostgreSQL. Il a trois
parties :

| Partie               | Rôle                                                                         |
| -------------------- | ---------------------------------------------------------------------------- |
| `schema.prisma`      | la description des tables, écrite à la main                                  |
| la commande `prisma` | applique les migrations et génère le client                                  |
| le client généré     | du code TypeScript pour lire et écrire, produit dans `src/generated/prisma/` |

**Clé étrangère.** Une contrainte qui garantit qu'une colonne pointe vers une
ligne existante d'une autre table. Ici, elles n'existent **qu'à l'intérieur d'un
schéma**.

**Transaction.** Un groupe d'écritures qui réussissent toutes ou échouent
toutes. Indispensable quand deux lignes doivent rester cohérentes.

---

## 3. Une base, six schémas

22 tables au total.

| Schéma     | Service propriétaire | Tables                                                                                                                            |
| ---------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `auth`     | auth-service         | `accounts`, `outbox_messages`                                                                                                     |
| `users`    | user-service         | `profiles`, `inbox_messages`, `friends`, `presences`                                                                              |
| `catalog`  | catalog-service      | `artists`, `artist_members`, `tracks`, `track_artists`, `releases`, `release_artists`, `release_tracks`, `genres`, `track_genres` |
| `media`    | media-service        | `assets`, `variants`                                                                                                              |
| `library`  | library-service      | `playlists`, `playlist_items`, `track_favorites`                                                                                  |
| `playback` | playback-service     | `sessions`, `events`                                                                                                              |

À quoi sert chaque table :

| Table                                                                                          | Contenu                                                                                     |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `auth.accounts`                                                                                | un compte : email, mot de passe haché, état (`pending_profile`, `active`, `profile_failed`) |
| `auth.outbox_messages`                                                                         | demandes de création de profil à livrer à Users                                             |
| `users.profiles`                                                                               | un profil : username unique, nom affiché, bio, avatar                                       |
| `users.inbox_messages`                                                                         | demandes de création de profil déjà traitées, pour ne pas les rejouer                       |
| `users.friends`                                                                                | amitiés, stockées dans les deux sens (deux lignes par amitié)                               |
| `users.presences`                                                                              | dernier signe de vie de chaque compte                                                       |
| `catalog.tracks`                                                                               | un morceau : titre, durée, état (`draft` ou `published`), fichier audio                     |
| `catalog.artists`, `releases`, `genres`                                                        | artistes, sorties (albums) et genres                                                        |
| `catalog.track_artists`, `release_artists`, `release_tracks`, `track_genres`, `artist_members` | liens entre ces objets                                                                      |
| `media.assets`                                                                                 | un fichier envoyé : propriétaire, type, taille, état, nom sur le disque                     |
| `media.variants`                                                                               | fichiers dérivés d'un original, par exemple l'aperçu MP3                                    |
| `library.playlists`                                                                            | une playlist privée et son numéro de version                                                |
| `library.playlist_items`                                                                       | les morceaux d'une playlist, avec leur position                                             |
| `library.track_favorites`                                                                      | favoris — table créée, pas encore utilisée par une route                                    |
| `playback.sessions`                                                                            | une écoute : morceau, début, fin, temps crédité                                             |
| `playback.events`                                                                              | les signaux de progression reçus pendant une écoute                                         |

Les colonnes exactes se lisent dans `backend/services/<service>/prisma/schema.prisma`.
Le détail des contraintes est dans `docs/SCHEMA_DONNEES.md`.

Les **octets** des fichiers ne sont pas en base : ils sont sur des volumes
Docker (`media_data` pour l'audio et les images, `avatar_data` pour les avatars).
La base n'en garde que le nom et les caractéristiques.

---

## 4. Deux rôles par service

| Rôle                  | Utilisé par                      | Peut faire                                                    |
| --------------------- | -------------------------------- | ------------------------------------------------------------- |
| `<service>_migration` | le conteneur `migrate-<service>` | créer et modifier les tables de son schéma (DDL)              |
| `<service>_runtime`   | le serveur du service            | lire et écrire des lignes dans son schéma (DML), rien d'autre |

Soit douze rôles : `auth_migration`, `auth_runtime`, `users_migration`,
`users_runtime`, etc.

**Pourquoi.** Si un service est compromis ou bogué, il ne peut ni toucher aux
tables des autres, ni détruire la structure des siennes. C'est aussi ce qui rend
réel le découpage en microservices : un service **ne peut pas** tricher en lisant
la table d'un voisin, PostgreSQL le lui refuse.

Les droits du rôle runtime sont donnés **table par table** et opération par
opération, dans `database/permissions/apply-grants.sql`. Par exemple
`auth_runtime` peut lire, insérer et modifier `auth.accounts`, mais pas en
supprimer ; `users_runtime` peut insérer dans `users.inbox_messages` mais pas
modifier une ligne existante.

Chaque service reçoit donc deux adresses de connexion :

| Variable                      | Rôle             | Lue par        |
| ----------------------------- | ---------------- | -------------- |
| `AUTH_DATABASE_URL`           | `auth_runtime`   | le serveur     |
| `AUTH_MIGRATION_DATABASE_URL` | `auth_migration` | les migrations |

Et de même avec les préfixes `USER_`, `CATALOG_`, `MEDIA_`, `LIBRARY_` et
`PLAYBACK_`. Les valeurs sont dans le `.env` de la racine du dépôt, sur le modèle
de `.env.example`.

---

## 5. Les liens entre services

Un morceau (Catalogue) a un fichier audio (Media). Une playlist (Library)
contient des morceaux (Catalogue). Ces liens existent, mais **sans clé
étrangère** : la colonne contient simplement l'identifiant (un UUID).

| Colonne                                                             | Désigne          | Chez    |
| ------------------------------------------------------------------- | ---------------- | ------- |
| `users.profiles.user_id`                                            | un compte        | auth    |
| `catalog.tracks.audio_asset_id`                                     | un fichier audio | media   |
| `catalog.releases.cover_asset_id`, `catalog.artists.image_asset_id` | une image        | media   |
| `media.assets.uploader_user_id`                                     | un compte        | auth    |
| `library.playlists.owner_user_id`                                   | un compte        | auth    |
| `library.playlist_items.track_id`                                   | un morceau       | catalog |
| `playback.sessions.user_id`                                         | un compte        | auth    |
| `playback.sessions.track_id`                                        | un morceau       | catalog |

**Conséquence.** PostgreSQL ne vérifie pas que l'objet désigné existe. C'est le
code qui le fait, en interrogeant l'autre service par HTTP au moment d'écrire :
Library demande au Catalogue si le morceau est publié avant de l'ajouter à une
playlist ; Media demande au Catalogue si un fichier est encore utilisé avant de
le supprimer.

À l'intérieur d'un schéma, en revanche, les clés étrangères sont normales :
supprimer une playlist supprime ses `playlist_items`.

---

## 6. Où sont les fichiers

Par service, dans `backend/services/<service>/` :

| Fichier                                        | Rôle                                                                 | Le modifie-t-on ?                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `prisma/schema.prisma`                         | description des tables                                               | oui, pour changer la structure                                          |
| `prisma/migrations/<date>_<nom>/migration.sql` | une migration                                                        | on en ajoute, on ne modifie jamais une migration déjà appliquée         |
| `prisma.migration.config.ts`                   | réglages de la commande `prisma` (schéma, dossier, URL de migration) | rarement                                                                |
| `src/generated/prisma/`                        | client généré                                                        | **jamais** : il est recréé par `prisma:generate` et n'est pas versionné |
| `src/repositories/prisma.ts`                   | `createPrisma(url)` : crée le client                                 | rarement                                                                |
| `src/repositories/*.repository.ts`             | les requêtes du service                                              | oui                                                                     |
| `src/scripts/prisma-smoke.ts`                  | vérifie que le rôle runtime peut se connecter                        | non                                                                     |
| `src/seed/`                                    | données de démonstration (Catalog et Media)                          | au besoin                                                               |

Pour toute la base, à la racine du dépôt :

| Fichier                                    | Rôle                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| `database/init/10-bootstrap-roles.sh`      | lancé par PostgreSQL sur un volume neuf : crée les rôles et les schémas |
| `database/permissions/bootstrap-roles.sql` | le SQL de cette création                                                |
| `database/permissions/assign-owners.sql`   | donne chaque table à son rôle de migration                              |
| `database/permissions/apply-grants.sql`    | donne aux rôles runtime leurs droits, table par table                   |
| `tests/per/`                               | la campagne qui prouve que tout cela est correct                        |

---

## 7. Ce qui se passe au démarrage

`docker compose up` enchaîne quatre étapes ; chacune attend la précédente.

```
1. db                  PostgreSQL démarre.
                       Sur un volume NEUF seulement : création des 12 rôles et des 6 schémas.

2. migrate-auth        Six conteneurs, un par service. Chacun applique ses migrations
   migrate-users       avec son rôle de migration (commande : prisma migrate deploy),
   migrate-catalog     puis s'arrête.
   ...

3. apply-permissions   Attribue les tables à leurs propriétaires, puis donne aux rôles
                       runtime leurs droits. S'arrête.

4. auth-service ...    Les six serveurs démarrent, chacun avec son rôle runtime.
```

Un serveur **n'applique jamais de migration** : il n'en a pas le droit.

---

## 8. Utiliser Prisma dans le code

### Le client est créé une fois, dans `server.ts`

```ts
const prisma = createPrisma(config.databaseUrl) // src/repositories/prisma.ts
const playlists = createPlaylistsRepository(prisma) // passé aux repositories
```

Il est fermé à l'arrêt du serveur (`prisma.$disconnect()`).

### Seuls les `repositories/` l'utilisent

Aucun service, contrôleur ou fichier de `domain/` n'importe Prisma. Pour une
nouvelle lecture ou écriture, ajoute une fonction dans le repository concerné :

```ts
find(owner: string, id: string): Promise<PlaylistRow | null> {
  return prisma.playlist.findFirst({ where: { id, ownerUserId: owner } })
}
```

**Toujours filtrer sur le propriétaire** quand la donnée appartient à un compte.
C'est ce filtre qui empêche un utilisateur de lire la playlist d'un autre.

### Noms : TypeScript d'un côté, SQL de l'autre

Dans `schema.prisma`, un modèle `Playlist` avec un champ `ownerUserId`
correspond à la table `playlists` et à la colonne `owner_user_id` (`@map` et
`@@map` font la correspondance). On écrit `ownerUserId` dans le code et
`owner_user_id` dans du SQL écrit à la main.

### Les grands nombres arrivent en `bigint`

Les durées, tailles et numéros de version sont des `BIGINT` en base et des
`bigint` en TypeScript (`6000n`). JSON ne sait pas les transporter : on les
convertit en `number` dans `domain/` **en vérifiant qu'ils sont représentables
exactement** (`Number.isSafeInteger`). Exemples : `toPlaylist` dans
`library-service`, `toSession` dans `playback-service`.

### Transactions

Quand plusieurs écritures doivent réussir ensemble :

```ts
await prisma.$transaction(async (tx) => {
  await tx.inboxMessage.create({ ... })
  await tx.profile.create({ ... })
})
```

Dans la fonction, **utiliser `tx` et jamais `prisma`** : une requête faite avec
`prisma` sortirait de la transaction sans prévenir.

### SQL écrit à la main

Deux cas où le client Prisma ne suffit pas :

| Cas                                             | Exemple dans le code                                                                                            |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| verrouiller une ligne (`SELECT ... FOR UPDATE`) | `library-service/src/repositories/playlist-lock.ts`, `playback-service/src/repositories/sessions.repository.ts` |
| requête avec agrégats et sous-requêtes          | `catalog-service/src/repositories/track-list.sql.ts`                                                            |

On utilise alors `prisma.$queryRaw` avec un gabarit :

```ts
await tx.$queryRaw`SELECT version FROM library.playlists WHERE id = ${id}::uuid FOR UPDATE`
```

Les valeurs entre `${}` sont **liées** par Prisma, pas collées dans le texte :
c'est ce qui protège de l'injection SQL. Ne construis jamais une requête en
concaténant des chaînes.

### Reconnaître une violation d'unicité

Quand une contrainte `UNIQUE` est violée (email déjà pris, username déjà pris),
Prisma lève une erreur de code `P2002`. Le repository la transforme en erreur
métier — voir `isUniqueViolation` dans `user-service` et `auth-service`.

---

## 9. Recettes

### Ajouter une colonne à une table existante

1. Ajoute le champ dans `prisma/schema.prisma` du service. Une colonne
   obligatoire ajoutée à une table non vide doit avoir une valeur par défaut.
2. Crée la migration (voir « Créer une migration » ci-dessous).
3. Régénère le client : `npm run prisma:generate -w @ft/<service>`.
4. Utilise la colonne dans le repository, puis dans `domain/` et `schemas/` si
   elle doit apparaître dans une réponse.
5. Aucun droit à ajouter : les droits sont donnés par table.
6. Lance `tests/per/run.sh`.

### Ajouter une table

Les étapes 1 à 4 ci-dessus, puis trois fichiers à compléter :

| Fichier                                  | Quoi ajouter                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `database/permissions/assign-owners.sql` | `ALTER TABLE <schéma>.<table> OWNER TO <service>_migration;`                   |
| `database/permissions/apply-grants.sql`  | la table dans le `GRANT` du service, avec seulement les opérations nécessaires |
| `tests/per/assert-state.sql`             | le nouveau nombre de tables du schéma et les droits attendus                   |

Sans la ligne de `GRANT`, le serveur reçoit `permission denied for table ...` à
la première requête.

### Créer une migration

Une migration est un dossier `prisma/migrations/<AAAAMMJJHHMMSS>_<nom>/`
contenant un fichier `migration.sql`. `prisma migrate deploy` applique tout
dossier qui n'a pas encore été appliqué.

Deux façons de la produire :

- **À la main** : crée le dossier et écris le SQL (`ALTER TABLE ...`). C'est la
  méthode la plus sûre ici, et le SQL reste lisible en revue.
- **Avec `npm run prisma:migrate:dev -- --name <nom>`** : Prisma compare le
  schéma à la base et écrit le SQL. Cette commande a besoin d'une base joignable
  depuis ta machine et du droit de créer une base temporaire. Les rôles du projet
  n'ont pas ce droit (`NOCREATEDB`) et PostgreSQL n'est pas publié hors du réseau
  Docker : en l'état, elle ne fonctionne pas sans adapter l'environnement.

Dans les deux cas : nomme la table avec son schéma (`library.playlists`), et ne
modifie jamais une migration déjà appliquée quelque part — ajoute-en une
nouvelle.

### Appliquer les migrations sur ta pile locale

```bash
docker compose up -d --build migrate-library apply-permissions library-service
```

Le conteneur `migrate-library` applique la migration, `apply-permissions`
rétablit les droits, puis le service redémarre.

### Repartir d'une base vide

Les scripts qui créent les rôles ne tournent que sur un volume neuf. Pour tout
reconstruire :

```bash
docker compose down --volumes
```

```bash
docker compose up -d --build
```

**Attention : la première commande efface toutes les données locales** (base,
fichiers audio, avatars, tableaux de bord Grafana).

### Regarder ce qu'il y a en base

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Puis, dans `psql` : `\dn` liste les schémas, `\dt library.*` les tables d'un
schéma, `SELECT * FROM library.playlists LIMIT 5;` affiche des lignes.

### Installer les données de démonstration

```bash
docker compose exec media-service npm run seed:demo
```

```bash
docker compose exec catalog-service npm run seed:demo
```

Trois fichiers audio et trois morceaux publiés. Les deux commandes sont
rejouables sans créer de doublon.

---

## 10. Commandes

À lancer avec `-w @ft/<service>` depuis `backend/`, ou sans depuis le dossier du
service.

| Commande                                     | Effet                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| `npm run prisma:validate`                    | vérifie que `schema.prisma` est correct                                |
| `npm run prisma:generate`                    | génère le client dans `src/generated/prisma/`                          |
| `npm run prisma:migrate:deploy`              | applique les migrations en attente (rôle de migration)                 |
| `npm run prisma:migrate:dev -- --name <nom>` | écrit une migration à partir du schéma (voir ses conditions plus haut) |
| `npm run prisma:smoke`                       | se connecte avec le rôle runtime et exécute `SELECT 1`                 |
| `npm run seed:demo`                          | installe les données de démonstration (Catalog et Media)               |

`npm run build`, `npm run typecheck` et `npm test` lancent `prisma:generate`
d'eux-mêmes.

Preuve complète des migrations, des rôles et des droits, depuis la racine :

```bash
tests/per/run.sh
```

Elle reconstruit une base jetable, vérifie les 22 tables, les 12 rôles, les
propriétaires et les interdictions (un service ne peut pas lire le schéma d'un
autre), puis rejoue les migrations pour prouver qu'elles ne font rien la seconde
fois.

---

## 11. Pièges connus

| Symptôme                                                    | Cause                                                            | Solution                                                         |
| ----------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `Cannot find module '../generated/prisma/client.js'`        | le client n'est pas généré                                       | `npm run prisma:generate -w @ft/<service>`                       |
| `permission denied for table ...`                           | il manque un `GRANT` pour le rôle runtime                        | compléter `apply-grants.sql`, relancer `apply-permissions`       |
| `permission denied for schema ...`                          | le service utilise la mauvaise URL, ou vise le schéma d'un autre | vérifier `<SERVICE>_DATABASE_URL`                                |
| `role "..._runtime" does not exist`                         | la base a été créée avant l'ajout des rôles                      | repartir d'un volume neuf                                        |
| la pile ne démarre pas, variables `*_PASSWORD` non définies | `.env` incomplet                                                 | le compléter d'après `.env.example`                              |
| une colonne ajoutée n'apparaît pas dans le code             | client non régénéré                                              | `npm run prisma:generate`                                        |
| `npm audit` signale `prisma`, `mysql2`, `deepmerge-ts`      | failles de l'outil en ligne de commande, pas du serveur          | ne pas lancer `npm audit fix --force` : il rétrograderait Prisma |
