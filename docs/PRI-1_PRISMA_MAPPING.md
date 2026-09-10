# PRI-1 — Mapping Prisma, SQL et contrats Auth/Users

## Périmètre et statut des sources

Ce document couvre uniquement `PRI-1` : définir les modèles Prisma minimaux et
préparer leurs impacts. Il ne crée pas de migration, ne modifie pas les routes et
ne prétend pas décrire la structure d'une base déjà déployée.

Les sources ne disent pas toutes la même chose :

- **Prouvé dans le dépôt** : PostgreSQL 16 est configuré ; Auth et Users utilisent
  aujourd'hui la même table SQL `users` ; les routes SQL utilisent des noms en
  snake_case, alors que la migration initiale a créé plusieurs colonnes en
  camelCase ; le formulaire et son type transmettent déjà un `username`
  obligatoire, mais la route Auth actuelle ne l'enregistre pas.
- **Retenu pour PRI-1** : l'action Notion « Décider et documenter la propriété des
  données » est marquée terminée et attribue l'identité, l'email et le hash à
  Auth, le profil à Users, avec un UUID stable créé par Auth. Le parent de PRI-1
  demande explicitement de raccorder les deux services à Prisma.
- **Décisions enregistrées le 10 septembre 2026** : D01 confirme la séparation
  Auth/Users et l'UUID commun ; D03 supprime `accountType` sans remplacement dans
  le périmètre actuel ; D05 confirme une base par environnement avec schémas et
  accès SQL privés par service ; D02 rend `username` obligatoire, non nul et
  unique. D06 (provisionnement du profil) et les détails de D09 restent hors de
  l'arbitrage de cette action.

La séparation `auth.accounts` / `users.profiles` est donc matérialisée comme la
décision de propriété portée par l'action Notion terminée. Les autres choix ne
sont pas importés depuis la proposition d'architecture du 8 septembre.

## Frontière de propriété

| Table SQL | Modèle Prisma | Propriétaire | Identifiant | Accès direct autorisé |
| --- | --- | --- | --- | --- |
| `auth.accounts` | `Account` | `auth-service` | `id`, UUID créé par Auth | Auth uniquement |
| `users.profiles` | `Profile` | `user-service` | `user_id`, même valeur que `Account.id` | Users uniquement |

`Profile.userId` est une référence logique vers l'identité Auth. Il n'y a pas de
relation Prisma ni de clé étrangère SQL entre les deux propriétaires. Un service
ne doit donc pas générer un client contenant le modèle de l'autre.

## Mapping du modèle `Account`

| Propriété Prisma | Colonne SQL | Null | Contrainte/default | Objet d'API concerné |
| --- | --- | --- | --- | --- |
| `id` | `auth.accounts.id` | non | PK, UUID généré par PostgreSQL | `userId` dans l'identité et `sub` du JWT |
| `email` | `auth.accounts.email` | non | unique | `SignUpRequest.email`, `LoginRequest.email`, identité privée |
| `passwordHash` | `auth.accounts.password_hash` | non | secret Auth | aucun objet de réponse ni message interservice |
| `createdAt` | `auth.accounts.created_at` | non | `now()` | interne ; non requis dans les DTO actuels |
| `updatedAt` | `auth.accounts.updated_at` | non | `now()` au départ ; mise à jour SQL à définir dans PRI-2 | interne |

Le modèle n'ajoute pas les états, sessions, preuves email, rôles plateforme ou
outbox de la proposition large : aucun de ces éléments n'est nécessaire pour
résoudre le mélange actuel entre identité et profil dans PRI-1.

## Mapping du modèle `Profile`

| Propriété Prisma | Colonne SQL | Null | Contrainte/default | Objet d'API concerné |
| --- | --- | --- | --- | --- |
| `userId` | `users.profiles.user_id` | non | PK, fourni par Auth, aucun default local | `UserProfile.userId` |
| `username` | `users.profiles.username` | non | unique | `UserProfile.username` ; obligatoire selon D02 |
| `displayName` | `users.profiles.display_name` | non | non unique | formulaire actuel et `UserProfile.displayName` |
| `avatarUrl` | `users.profiles.avatar_url` | oui | aucune contrainte retenue dans PRI-1 | profil actuel ; une migration vers un asset reste hors périmètre |
| `createdAt` | `users.profiles.created_at` | non | `now()` | interne |
| `updatedAt` | `users.profiles.updated_at` | non | `now()` au départ ; mise à jour SQL à définir dans PRI-2 | interne |

Le formulaire actuel exige déjà `username`, mais le backend doit encore le
valider et le transmettre à Users. La forme exacte et la normalisation du pseudo
restent à préciser sans modifier silencieusement les valeurs historiques pendant
PRI-2.

## `accountType` : suppression validée

Le seul contrat exécutable qui mentionne encore `accountType` est le mock
frontend. Auth l'ignore et aucune colonne SQL ne le stocke. La décision D03 du 10
septembre 2026 est de supprimer ce champ, sans créer `account_type` ni
`onboarding_intent` dans le périmètre actuel.

Le retrait du champ dans le frontend et dans son contrat appartient au raccord
du contrat M0-03 ; PRI-1 se limite à ne pas l'introduire dans les modèles Prisma.
Cette suppression ne définit aucun droit artiste : ce droit devra être porté par
un objet métier distinct lorsqu'il sera conçu.

## Contrats et routes : écarts à traiter plus tard

| Surface actuelle | Écart après PRI-1 | Action dédiée |
| --- | --- | --- |
| `POST /signup` Auth | écrit encore dans `users`, ne crée pas de profil et ignore le `username` reçu | PRI-4 |
| `POST /login` Auth | lit encore `users.password_hash` | PRI-4 |
| `GET /me` Users | lit encore email et profil dans la table commune | PRI-5 |
| Mock frontend | renvoie encore un objet combiné identité/profil | contrat M0-03 puis raccord frontend |
| Client Prisma Users généré | peut rester obsolète tant qu'il n'est pas régénéré | PRI-3 |
| Client Prisma Auth | dépendances et configuration absentes | PRI-3 |

Les exemples d'API cibles restent donc des propositions tant que M0-03 n'est pas
accepté. Le mapping stable déjà utilisable est :

```text
Account.id <-> JWT sub <-> Profile.userId <-> API userId
Account.email -> identité privée Auth
Profile.displayName / username / avatarUrl -> profil Users
```

Les deux projections minimales compatibles avec la propriété retenue sont les
suivantes. Elles fixent la frontière des données, pas encore les noms de routes,
les codes HTTP ni le protocole de provisionnement :

```json
{
  "userId": "11111111-1111-4111-8111-111111111111",
  "email": "lea@example.invalid"
}
```

```json
{
  "userId": "11111111-1111-4111-8111-111111111111",
  "displayName": "Léa",
  "username": "lea",
  "avatarUrl": null
}
```

Le premier objet vient exclusivement d'Auth ; le second exclusivement de Users.
Une vue combinée relève du contrat frontend/API à accepter dans M0-03 et ne
justifie jamais une lecture SQL du schéma voisin.

## Préparation de l'adaptation des données

PRI-2 devra partir de la base réellement inspectée, pas seulement de la migration
initiale. Le plan de transformation à tester sur une copie isolée est :

| Source historique pressentie | Cible | Règle de conservation |
| --- | --- | --- |
| `public.users.id` | `auth.accounts.id` et `users.profiles.user_id` | conserver exactement le UUID |
| email | `auth.accounts.email` | normalisation et collisions à inventorier avant contrainte |
| hash existant | `auth.accounts.password_hash` | copier sans ré-hacher et identifier l'algorithme |
| username | `users.profiles.username` | obligatoire ; conserver la valeur et inventorier doublons ou valeurs invalides |
| display name | `users.profiles.display_name` | conserver la valeur ; si elle est `NULL`, utiliser le `username`, jamais l'email |
| avatar URL | `users.profiles.avatar_url` | conserver si la colonne existe réellement |
| `accountType` | aucune cible | champ supprimé par D03 ; ne pas le migrer ni inventer de valeur de remplacement |

La migration initiale
`services/user-service/prisma/migrations/20260905155209_init/migration.sql`
reste inchangée. La création du delta, le backfill, les contrôles avant/après et
le rollback appartiennent à PRI-2.

## Critères et preuves de PRI-1

| Critère | Preuve dans ce changement | Limite |
| --- | --- | --- |
| Mapping modèle → SQL → contrat et propriétaire | tableaux ci-dessus et deux schémas Prisma par propriétaire | règles de forme/normalisation du username encore à préciser |
| Modèles limités à Auth et Users | `Account` et `Profile` seulement | états distribués et tables futures exclus |
| camelCase Prisma / snake_case SQL | `@map`, `@@map`, `@@schema` et prévisualisation SQL du CLI | prévisualisation seulement, aucune migration enregistrée |
| identité stable | UUID généré sur `Account.id`, repris sans default par `Profile.userId` | transmission interservice traitée dans PRI-4 |
| migration existante préservée | aucun changement sous `prisma/migrations` | base réelle non inspectée |

### Vérifications exécutées

Runtime isolé : image locale `common_repo_user-service`, Node 22.23.2, Prisma et
Prisma Client 7.10.0, réseau désactivé.

| Commande | Résultat observé |
| --- | --- |
| `prisma validate --schema <schema-users>` | code 0, schéma valide |
| `prisma validate --schema <schema-auth>` | code 0, schéma valide |
| `prisma generate --schema <schema-users>` | code 0, client 7.10.0 généré dans le conteneur éphémère |
| `prisma generate --schema <schema-auth>` | code 0, client 7.10.0 généré dans le conteneur éphémère |
| `prisma migrate diff --config <config-v7> --from-empty --to-schema=<schema-users> --script` | code 0 ; SQL observé : schéma `users`, table `profiles`, colonnes snake_case, PK `user_id`, `username` obligatoire et unique |
| `prisma migrate diff --config <config-v7> --from-empty --to-schema=<schema-auth> --script` | code 0 ; SQL observé : schéma `auth`, table `accounts`, UUID PostgreSQL par défaut, email unique, colonnes snake_case |
| `git diff --check` | code 0 |
| comparaison SHA-256 de la migration initiale avec `HEAD` | empreintes identiques |

Le premier essai de `migrate diff` sans configuration Prisma explicite a échoué
dans le moteur de schéma, qui exigeait la datasource. Il n'est pas compté comme
preuve. La commande finale a chargé explicitement la configuration v7, avec une
URL PostgreSQL fictive ; elle n'a contacté ni modifié aucune base.

La sous-action peut être relue techniquement. D01, D02, D03 et D05 sont désormais
enregistrées. D02 impose un `username` obligatoire, non nul et unique ; le modèle
et la migration PRI-2 ont été alignés sur cette décision.
