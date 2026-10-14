# Guide du backend

Ce document s'adresse à quelqu'un qui n'a jamais vu le projet. Il explique ce que
fait le backend, les notions à connaître, comment le code est rangé, et où aller
pour modifier ou ajouter quelque chose.

La base de données a son propre document : [PRISMA.md](PRISMA.md).

## Sommaire

1. [Le backend en une minute](#1-le-backend-en-une-minute)
2. [Les notions à connaître](#2-les-notions-à-connaître)
3. [Vue d'ensemble](#3-vue-densemble)
4. [Le dossier `backend/`](#4-le-dossier-backend)
5. [Anatomie d'un service](#5-anatomie-dun-service)
6. [Le trajet d'une requête, pas à pas](#6-le-trajet-dune-requête-pas-à-pas)
7. [Le paquet partagé `@ft/service-kit`](#7-le-paquet-partagé-ftservice-kit)
8. [Comment les services se parlent](#8-comment-les-services-se-parlent)
9. [Les six services](#9-les-six-services)
10. [Validation et erreurs](#10-validation-et-erreurs)
11. [Tests](#11-tests)
12. [Je veux… (recettes)](#12-je-veux-recettes)
13. [Quand ça ne marche pas](#13-quand-ça-ne-marche-pas)
14. [Règles d'écriture](#14-règles-décriture)
15. [Commandes](#15-commandes)

---

## 1. Le backend en une minute

Le backend d'une application d'écoute de musique. Il est découpé en **six petits
serveurs indépendants**, les _services_. Chacun a une seule responsabilité, son
propre conteneur Docker et sa propre partie de la base de données.

| Service            | Ce dont il est responsable                                    |
| ------------------ | ------------------------------------------------------------- |
| `auth-service`     | les comptes, les mots de passe, la connexion                  |
| `user-service`     | les profils, les avatars, les amis, la présence en ligne      |
| `catalog-service`  | les morceaux, artistes et albums publiés                      |
| `media-service`    | les fichiers : envoi, vérification, stockage, diffusion audio |
| `library-service`  | les playlists privées                                         |
| `playback-service` | les sessions d'écoute et l'historique                         |

Techniquement : Node.js 22, TypeScript, le framework web **Fastify**, la base
**PostgreSQL** via **Prisma**. Le navigateur ne parle jamais directement à un
service : tout passe par **Nginx**, qui aiguille chaque requête.

---

## 2. Les notions à connaître

Lis cette section une fois ; le reste du document s'appuie dessus.

**Microservice.** Un petit serveur qui ne fait qu'une chose. Les services ne
partagent ni code métier ni tables : s'ils ont besoin l'un de l'autre, ils se
parlent en HTTP, comme le ferait un navigateur.

**Fastify.** Le framework qui reçoit les requêtes HTTP. Une _route_ associe une
URL à une fonction. Un _plugin_ ajoute un comportement à tout le serveur (par
exemple « vérifier le jeton de connexion »). Un _hook_ est une fonction exécutée
à une étape précise d'une requête, par exemple `onRequest`, tout au début.

**Schéma et validation.** Un schéma décrit la forme attendue d'une donnée
(« un objet avec un champ `name` de type texte »). Fastify refuse toute requête
qui ne respecte pas le schéma de sa route, avant d'appeler notre code. Les
schémas sont écrits avec la bibliothèque **TypeBox**, qui en tire aussi le type
TypeScript : la validation et le typage ne peuvent pas diverger.

**DTO.** La forme d'une donnée telle qu'on l'envoie au client. Elle est souvent
plus petite que ce qui est en base : on n'expose jamais un mot de passe haché ou
un chemin de fichier.

**Prisma.** La bibliothèque qui parle à PostgreSQL. On décrit les tables dans un
fichier `schema.prisma` ; Prisma génère du code TypeScript pour les lire et les
écrire. Voir [PRISMA.md](PRISMA.md).

**Repository.** Un fichier dont le seul rôle est de lire et d'écrire en base.
Le reste du code ne connaît pas Prisma : il appelle le repository.

**Injection de dépendances.** Au lieu de créer lui-même sa connexion à la base,
un morceau de code la _reçoit en paramètre_. En production on lui passe la vraie,
dans un test on lui passe une fausse en mémoire. C'est ce qui permet de tester
tout un service sans base de données.

**JWT (jeton de connexion).** Quand un utilisateur se connecte, `auth-service`
lui remet un jeton signé contenant son identifiant. Le navigateur le renvoie à
chaque requête dans l'en-tête `Authorization: Bearer <jeton>`. Les autres
services vérifient la signature avec un secret partagé (`JWT_SECRET`) : ils
savent qui appelle sans interroger aucune base.

**Jeton interne.** Un second secret (`INTERNAL_SERVICE_TOKEN`), utilisé
seulement quand un _service_ en appelle un autre sur une route `/internal/...`.
Ces routes sont en plus bloquées par Nginx : le navigateur ne peut pas les
atteindre.

**Erreur métier (`DomainError`).** Un refus prévu et normal : playlist
introuvable, fichier trop gros, version périmée. Elle porte le statut HTTP et le
code à renvoyer. Tout le reste est une _panne_ : elle est journalisée, et le
client reçoit une erreur générique sans détail interne.

**Idempotence.** Une opération est idempotente si la refaire ne change rien de
plus. C'est essentiel sur un réseau : si une réponse se perd, le client renvoie
la même requête, et il ne faut pas créer deux profils ou compter deux fois le
même temps d'écoute.

**Verrou et version.** Deux requêtes peuvent vouloir modifier la même playlist
au même instant. On s'en protège de deux façons : un _verrou_ en base
(`SELECT ... FOR UPDATE`) fait attendre la seconde, et un _numéro de version_
permet de la refuser si la playlist a changé depuis que le client l'a lue.

**Healthcheck et métriques.** Chaque service expose `/health` (« je tourne »),
`/ready` (« je peux servir, ma base répond ») et `/metrics` (chiffres lus par
Prometheus, affichés dans Grafana).

---

## 3. Vue d'ensemble

```
                         Navigateur
                             │  HTTPS
                             ▼
                    ┌────────────────┐
                    │     Nginx      │   aiguille selon le début de l'URL
                    └───────┬────────┘   et bloque /internal et /metrics
        ┌──────────┬────────┼─────────┬───────────┬────────────┐
        ▼          ▼        ▼         ▼           ▼            ▼
   /api/auth  /api/users /api/catalog /api/media /api/library /api/playback
     auth       user      catalog      media      library      playback
     :4000      :4001      :4002       :4003       :4004        :4005
        │          ▲         ▲  ▲  ▲      │           │            │
        └──────────┘         │  │  └──────┘           │            │
     création du profil      │  └─────────────────────┘            │
                             └─────────────────────────────────────┘
                                 « ce morceau est-il publié ? »

        chaque service ──► PostgreSQL (un schéma par service)
        media, user    ──► volumes Docker (fichiers audio, avatars)
        Prometheus     ──► lit /metrics de chaque service
```

| Service            | Port | Préfixe public   | Schéma SQL | Appelle |
| ------------------ | ---- | ---------------- | ---------- | ------- |
| `auth-service`     | 4000 | `/api/auth/`     | `auth`     | user    |
| `user-service`     | 4001 | `/api/users/`    | `users`    | —       |
| `catalog-service`  | 4002 | `/api/catalog/`  | `catalog`  | —       |
| `media-service`    | 4003 | `/api/media/`    | `media`    | catalog |
| `library-service`  | 4004 | `/api/library/`  | `library`  | catalog |
| `playback-service` | 4005 | `/api/playback/` | `playback` | catalog |

Nginx **retire le préfixe** avant de transmettre : le navigateur appelle
`/api/library/playlists`, `library-service` reçoit `/playlists`. Dans le code des
services, les routes sont donc écrites sans préfixe. La configuration est dans
`nginx/nginx.conf`.

---

## 4. Le dossier `backend/`

```
backend/
├─ package.json          # déclare les « workspaces » : un seul npm install pour tout
├─ package-lock.json     # versions exactes de toutes les dépendances
├─ tsconfig.base.json    # réglages TypeScript communs
├─ .prettierrc.json      # règles de formatage
├─ docs/                 # ce guide et PRISMA.md
├─ packages/
│  └─ service-kit/       # code partagé par les six services (section 7)
└─ services/
   ├─ auth-service/
   ├─ user-service/
   ├─ catalog-service/
   ├─ media-service/
   ├─ library-service/
   └─ playback-service/
```

C'est un **monorepo npm** : `packages/*` et `services/*` sont des paquets liés
entre eux. Un service importe le code partagé par `import { ... } from
'@ft/service-kit'`.

---

## 5. Anatomie d'un service

Les six services ont **exactement la même arborescence**. Quand tu en connais
un, tu connais les autres.

```
services/library-service/
├─ Dockerfile                    # construction de l'image
├─ package.json                  # scripts et dépendances
├─ prisma/                       # tables du service et leurs migrations
├─ prisma.migration.config.ts    # réglages des commandes de migration
├─ src/
│  ├─ server.ts        # DÉMARRAGE : lit la config, crée les vraies dépendances, ouvre le port
│  ├─ app.ts           # ASSEMBLAGE : branche plugins, services, contrôleurs et routes
│  ├─ config/          # env.ts : variables d'environnement, validées au démarrage
│  ├─ routes/          # la liste des URL : méthode, chemin, protection, schémas
│  ├─ controllers/     # lit la requête, appelle un service, renvoie la réponse
│  ├─ schemas/         # forme des entrées et des réponses (TypeBox)
│  ├─ services/        # les règles métier
│  ├─ repositories/    # le seul endroit qui parle à la base
│  ├─ clients/         # appels HTTP vers les autres services
│  ├─ domain/          # types métier, fonctions pures, erreurs
│  ├─ scripts/         # petites commandes (vérification de connexion)
│  └─ generated/       # code produit par Prisma — ne jamais modifier, non versionné
└─ test/               # tests unitaires
```

### Qui a le droit d'importer quoi

```
routes ──► controllers ──► services ──► repositories ──► base
                               │    └──► clients ──────► autre service
                               ▼
                            domain   (utilisable par tous)
```

| Dossier         | Répond à la question                               | Connaît Fastify ? | Connaît Prisma ? |
| --------------- | -------------------------------------------------- | ----------------- | ---------------- |
| `routes/`       | quelles URL existent, et qui peut les appeler ?    | oui               | non              |
| `controllers/`  | que lire dans la requête, que renvoyer ?           | oui               | non              |
| `schemas/`      | à quoi ressemble une entrée valide ?               | non               | non              |
| `services/`     | que doit-il se passer, et dans quel ordre ?        | non               | non              |
| `domain/`       | quelles sont les règles et les erreurs du métier ? | non               | non              |
| `repositories/` | comment lire et écrire en base ?                   | non               | oui              |
| `clients/`      | comment interroger un autre service ?              | non               | non              |

Cette séparation a un but pratique : **une règle métier se trouve dans
`services/` ou `domain/`, jamais ailleurs**. Si tu cherches pourquoi une requête
est refusée, tu sais où regarder ; si tu changes de base de données, seuls les
`repositories/` bougent.

Dossiers supplémentaires de certains services :

- `media-service` : `storage/` (accès au disque) et `validation/` (décodage des
  fichiers dans un processus isolé) ;
- `user-service` : `storage/` (fichiers d'avatar) ;
- `auth-service` : `workers/` (tâche de fond) ;
- `catalog-service` et `media-service` : `seed/` (données de démonstration).

### `server.ts` et `app.ts` : pourquoi deux fichiers

`app.ts` exporte `buildApp(config, dependencies)`. Cette fonction **n'ouvre pas
de port et ne crée rien** : elle reçoit la base, les clients HTTP, etc. en
paramètre et assemble le serveur.

`server.ts` est le seul fichier qui lit l'environnement, crée la vraie connexion
à la base et appelle `listen`.

Les tests appellent `buildApp` avec de fausses dépendances et interrogent le
serveur en mémoire, sans réseau ni base.

---

## 6. Le trajet d'une requête, pas à pas

Exemple réel : ajouter un morceau à une playlist.

```
POST /api/library/playlists/<id>/items
Authorization: Bearer <jeton>
{ "trackId": "<uuid>", "expectedVersion": 3 }
```

| Étape | Fichier                                                      | Ce qui se passe                                                                                                                                   |
| ----- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | `nginx/nginx.conf`                                           | Nginx reconnaît `/api/library/`, retire le préfixe et transmet `POST /playlists/<id>/items` au port 4004.                                         |
| 1     | `routes/playlist-items.routes.ts`                            | La route déclare `onRequest: app.authenticate` et ses schémas.                                                                                    |
| 2     | `service-kit` → `plugins/auth.ts`                            | Le jeton est vérifié. S'il est invalide : 401. Sinon `request.userId` reçoit l'identifiant du compte.                                             |
| 3     | `schemas/playlists.schema.ts`                                | Fastify compare l'URL et le corps aux schémas. Champ manquant, en trop ou du mauvais type : 400 `invalid_request`.                                |
| 4     | `controllers/playlist-items.controller.ts`                   | Le contrôleur rassemble le compte, la playlist et la version attendue, puis appelle le service.                                                   |
| 5     | `services/playlist-items.service.ts`                         | Les règles, dans l'ordre : la playlist existe-t-elle pour ce compte (404) ? la version est-elle la bonne (409) ? le morceau est-il publié (404) ? |
| 6     | `clients/catalog.client.ts`                                  | Pour la dernière question, appel HTTP à `catalog-service`.                                                                                        |
| 7     | `repositories/playlist-lock.ts` puis `playlist-mutations.ts` | La playlist est verrouillée en base, la version revérifiée, l'occurrence ajoutée et la version incrémentée, le tout dans une transaction.         |
| 8     | `domain/playlist.ts`                                         | La ligne lue en base est convertie en playlist publique (`toPlaylist`).                                                                           |
| 9     | `schemas/playlists.schema.ts`                                | La réponse est filtrée par le schéma de réponse : un champ qui n'y figure pas n'est pas envoyé.                                                   |

Si une étape lève une `DomainError`, le plugin d'erreurs la transforme en
réponse `{ "error": "<code>" }`. Si autre chose casse (base en panne…), l'erreur
est journalisée et le client reçoit `503 { "error": "library_unavailable" }`.

**Toute route de tout service suit ce même chemin.** Pour comprendre une route,
ouvre son fichier `routes/`, puis suis les appels.

---

## 7. Le paquet partagé `@ft/service-kit`

Dans `backend/packages/service-kit/src/`. Il contient ce que les six services
font à l'identique, pour ne l'écrire et ne le corriger qu'une fois.

| Élément                                         | Fichier                     | À quoi il sert                                                                                          |
| ----------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `createApp()`                                   | `create-app.ts`             | Crée le serveur Fastify d'un service avec la validation stricte, les métriques et la gestion d'erreurs. |
| `authPlugin`                                    | `plugins/auth.ts`           | Ajoute `app.authenticate`, à poser sur une route privée. Renseigne `request.userId`.                    |
| `internalTokenPlugin`                           | `plugins/internal-token.ts` | Ajoute `app.requireInternalToken`, pour les routes `/internal`.                                         |
| `opsPlugin`                                     | `plugins/ops.ts`            | Ajoute `/health`, `/ready` et `/metrics`.                                                               |
| `metricsPlugin`                                 | `plugins/metrics.ts`        | Mesure la durée de chaque requête.                                                                      |
| `errorsPlugin`                                  | `plugins/errors.ts`         | Transforme toute erreur en réponse HTTP.                                                                |
| `DomainError`, `invalidRequest`                 | `domain-error.ts`           | L'erreur métier et son cas le plus courant.                                                             |
| `readEnv`                                       | `env.ts`                    | Lit et valide les variables d'environnement.                                                            |
| `fetchJson`, `isRecord`                         | `http-client.ts`            | Appel HTTP vers un autre service, avec délai maximal.                                                   |
| `UuidSchema`, `PageQuerySchema`, `toPagination` | `schemas.ts`                | Schémas communs : identifiant et pagination.                                                            |
| `noStore`                                       | `hooks.ts`                  | Interdit la mise en cache d'une réponse.                                                                |

`index.ts` liste tout ce qui est exporté. **Après toute modification de ce
paquet, il faut le recompiler** (`npm run build:packages`) : les services
importent sa version compilée.

Règle : si le même code apparaît dans deux services, il a sa place ici.

---

## 8. Comment les services se parlent

### Le jeton de connexion

```
1. POST /api/auth/login          → auth-service vérifie le mot de passe
2.                                ← { "token": "<JWT>" }   valable 1 heure
3. GET /api/library/playlists    → Authorization: Bearer <JWT>
4. library-service vérifie la signature avec JWT_SECRET, lit l'identifiant du compte
```

Le jeton contient `sub` (l'identifiant du compte) et `exp` (sa date
d'expiration). Aucun service autre qu'Auth ne consulte de table de comptes.

**Conséquence importante dans le code** : l'identité vient toujours de
`request.userId`, jamais du corps ni de l'URL. Un client ne peut pas se faire
passer pour un autre en envoyant un autre identifiant.

### Les appels entre services

| Qui appelle | Qui est appelé | Route                                 | Pourquoi                                             | Si l'appelé est en panne                            |
| ----------- | -------------- | ------------------------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| auth        | user           | `PUT /internal/profiles/:userId`      | créer le profil d'un nouveau compte                  | l'inscription reste « en attente » et sera relivrée |
| library     | catalog        | `GET /tracks/:id`                     | vérifier qu'un morceau est publié avant de l'ajouter | l'ajout est refusé (503)                            |
| playback    | catalog        | `GET /tracks/:id`                     | connaître la durée du morceau                        | l'ouverture de session est refusée (503)            |
| media       | catalog        | `GET /assets/:id/publication`         | ne diffuser que l'audio d'un morceau publié          | la diffusion est refusée (503)                      |
| media       | catalog        | `GET /internal/assets/:id/references` | ne pas supprimer un fichier encore utilisé           | la suppression est refusée (503)                    |

Chaque appel est écrit dans le dossier `clients/` du service appelant, avec un
délai maximal de 2 ou 3 secondes. Principe constant : **en cas de doute, on
refuse**. Un service en panne ne doit jamais faire accepter une opération non
vérifiée.

### L'inscription, cas particulier

Créer un utilisateur touche deux services : le compte (Auth) et le profil
(Users). Comme ils n'ont pas la même base, on ne peut pas tout faire dans une
seule transaction. Voici comment c'est rendu fiable :

1. Auth écrit **en une transaction** le compte (état `pending_profile`) et une
   _demande de création de profil_ dans la table `outbox_messages`.
2. Auth envoie cette demande à Users.
3. Users écrit **en une transaction** la trace de la demande (`inbox_messages`)
   et le profil. Si la même demande revient, il la reconnaît et ne refait rien.
4. Auth marque la demande comme livrée et le compte passe à `active`.

Si Users est injoignable à l'étape 2, la demande reste en base ; une tâche de
fond (`auth-service/src/workers/outbox.worker.ts`) la renvoie toutes les deux
secondes. Tant que le profil n'existe pas, la connexion répond
`202 REGISTRATION_PENDING`.

---

## 9. Les six services

Les chemins sont relatifs à `backend/services/<service>/src/`.

### auth-service — comptes et connexion

| Méthode | Route     | Rôle                          |
| ------- | --------- | ----------------------------- |
| POST    | `/signup` | créer un compte               |
| POST    | `/login`  | obtenir un jeton              |
| POST    | `/verify` | savoir si un jeton est valide |

| Tu cherches…                                       | Regarde dans                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| les règles d'email, de mot de passe, de username   | `domain/credentials.ts`                                            |
| les textes et codes d'erreur                       | `domain/errors.ts`                                                 |
| la création du compte et de sa demande de profil   | `repositories/accounts.repository.ts`                              |
| la livraison de la demande à Users et ses relances | `services/profile-delivery.service.ts`, `workers/outbox.worker.ts` |
| le contenu et la durée du jeton                    | `app.ts` (`signToken`, `tokenLifetime`)                            |
| le hachage du mot de passe (argon2)                | `app.ts` (`hashPassword`, `verifyPassword`)                        |

À savoir : la limite de débit sur `/signup` et `/login` est désactivée par
défaut. Elle s'active avec `AUTH_SIGNUP_RATE_LIMIT` et `AUTH_LOGIN_RATE_LIMIT`
(requêtes par minute).

### user-service — profils, avatars, amis, présence

| Méthode      | Route                                      | Accès         | Rôle                                        |
| ------------ | ------------------------------------------ | ------------- | ------------------------------------------- |
| GET          | `/me`                                      | connecté      | mon profil                                  |
| PUT          | `/me/profile`                              | connecté      | modifier mon profil                         |
| POST         | `/me/avatar`                               | connecté      | envoyer mon avatar                          |
| GET          | `/avatars/:fileName`                       | public        | lire un avatar                              |
| GET          | `/profiles`                                | connecté      | tous les autres comptes, avec leur présence |
| GET          | `/profile/:userId`                         | public        | profil public d'un compte                   |
| GET          | `/friends`                                 | connecté      | mes amis                                    |
| POST, DELETE | `/friends/:friendId`                       | connecté      | ajouter, retirer un ami                     |
| POST         | `/presence/heartbeat`, `/presence/offline` | connecté      | signaler ma présence                        |
| GET          | `/presence/:userId`                        | public        | présence d'un compte                        |
| PUT          | `/internal/profiles/:userId`               | jeton interne | création de profil par Auth                 |

| Tu cherches…                                         | Regarde dans                            |
| ---------------------------------------------------- | --------------------------------------- |
| la validation du profil et ses messages d'erreur     | `domain/profile.ts`, `domain/errors.ts` |
| le format d'un username                              | `domain/identifiers.ts`                 |
| la vérification du contenu d'un avatar               | `domain/avatar.ts`                      |
| la règle « en ligne » (vu depuis moins de 2 minutes) | `domain/presence.ts`                    |
| la création de profil sans doublon                   | `repositories/provision.repository.ts`  |

À savoir : dans ce service, **le texte de chaque erreur fait partie du
contrat** (le frontend l'affiche). C'est pourquoi les corps sont validés dans
`domain/` et non par des schémas.

### catalog-service — morceaux publiés

| Méthode | Route                             | Accès         | Rôle                                                      |
| ------- | --------------------------------- | ------------- | --------------------------------------------------------- |
| GET     | `/tracks`                         | public        | liste paginée : recherche `q`, filtre `genre`, tri `sort` |
| GET     | `/tracks/:id`                     | public        | un morceau                                                |
| GET     | `/assets/:id/publication`         | public        | cet audio est-il publié ?                                 |
| GET     | `/internal/assets/:id/references` | jeton interne | ce fichier est-il encore utilisé ?                        |

| Tu cherches…                         | Regarde dans                                       |
| ------------------------------------ | -------------------------------------------------- |
| la requête SQL de la liste           | `repositories/track-list.sql.ts`                   |
| la forme d'un morceau renvoyé        | `domain/track.ts`, `schemas/tracks.schema.ts`      |
| les paramètres acceptés par la liste | `schemas/tracks.schema.ts`, `domain/track-list.ts` |
| les données de démonstration         | `seed/seed-demo.ts`                                |

À savoir : seuls les morceaux à l'état `published` sont visibles. Il n'existe
aucune route d'écriture : le catalogue est rempli par le seed.

### media-service — fichiers

| Méthode   | Route                         | Accès    | Rôle                                |
| --------- | ----------------------------- | -------- | ----------------------------------- |
| GET, HEAD | `/assets/:id/audio`           | public   | écouter l'audio d'un morceau publié |
| POST      | `/assets`                     | connecté | envoyer un fichier audio ou image   |
| GET       | `/assets`                     | connecté | mes fichiers                        |
| GET, HEAD | `/assets/:id/private-content` | connecté | aperçu de mon fichier               |
| DELETE    | `/assets/:id`                 | connecté | supprimer mon fichier               |

| Tu cherches…                                        | Regarde dans                                              |
| --------------------------------------------------- | --------------------------------------------------------- |
| les tailles maximales                               | `domain/limits.ts`                                        |
| la vérification réelle d'un fichier (ffmpeg, sharp) | `validation/`                                             |
| les étapes d'un envoi et sa reprise après panne     | `services/upload.service.ts`                              |
| la suppression et sa reprise après panne            | `services/file-deletion.service.ts`                       |
| la lecture sûre d'un fichier du disque              | `storage/stored-file.ts`                                  |
| la lecture par morceaux (en-tête `Range`)           | `domain/byte-range.ts`, `controllers/audio.controller.ts` |
| les messages d'erreur affichés à l'utilisateur      | `routes/files.routes.ts`, `routes/refusals.ts`            |

À savoir :

- un fichier n'est accepté que s'il se **décode réellement** ; ni son nom ni le
  type annoncé ne sont crus ;
- le décodage tourne dans un **processus séparé**, limité en temps et en mémoire,
  car un fichier peut être conçu pour saturer le serveur ;
- **un seul envoi à la fois** par instance ; un second reçoit `503 upload_busy` ;
- au démarrage, `server.ts` termine les envois et suppressions interrompus avant
  d'accepter des requêtes.

### library-service — playlists privées

| Méthode | Route                          | Rôle                    |
| ------- | ------------------------------ | ----------------------- |
| GET     | `/playlists`                   | mes playlists, paginées |
| GET     | `/playlists/:id`               | une playlist            |
| POST    | `/playlists`                   | créer                   |
| PATCH   | `/playlists/:id`               | renommer, décrire       |
| DELETE  | `/playlists/:id`               | supprimer               |
| POST    | `/playlists/:id/items`         | ajouter un morceau      |
| DELETE  | `/playlists/:id/items/:itemId` | retirer une occurrence  |

Toutes exigent d'être connecté.

| Tu cherches…                             | Regarde dans                         |
| ---------------------------------------- | ------------------------------------ |
| les bornes du nom et de la description   | `domain/playlist.ts`                 |
| le verrou et le contrôle de version      | `repositories/playlist-lock.ts`      |
| les écritures                            | `repositories/playlist-mutations.ts` |
| l'ordre des refus à l'ajout d'un morceau | `services/playlist-items.service.ts` |

À savoir : toute modification envoie `expectedVersion`, la version que le client
a lue. Si elle ne correspond plus : `409 version_conflict`. Le même morceau peut
figurer plusieurs fois dans une playlist.

### playback-service — écoute et historique

| Méthode | Route                    | Rôle                           |
| ------- | ------------------------ | ------------------------------ |
| POST    | `/sessions`              | commencer à écouter un morceau |
| PUT     | `/sessions/:id/progress` | signaler où en est la lecture  |
| POST    | `/sessions/:id/close`    | terminer l'écoute              |
| GET     | `/sessions`              | mon historique                 |

Toutes exigent d'être connecté.

| Tu cherches…                        | Regarde dans                          |
| ----------------------------------- | ------------------------------------- |
| le calcul du temps d'écoute crédité | `domain/progress.ts`                  |
| la forme d'une session              | `domain/session.ts`                   |
| le verrou de session                | `repositories/sessions.repository.ts` |

À savoir : le lecteur déclare son temps d'écoute, mais le serveur ne le croit
pas sur parole. Il crédite le plus petit de quatre montants (ce qui est déclaré,
le temps réellement écoulé depuis le dernier signal, le temps écoulé depuis
l'ouverture, ce qui reste du morceau). Avancer dans le morceau ne crédite rien.

---

## 10. Validation et erreurs

### La validation est stricte

Par défaut, Fastify est tolérant : il convertit `"5"` en `5` et retire en
silence les champs inconnus. Ici c'est l'inverse, réglé une fois dans
`createApp` :

- une valeur du mauvais type est **refusée**, pas convertie ;
- un champ en trop est **refusé**, à condition que le schéma porte
  `{ additionalProperties: false }` — à mettre sur chaque objet.

Les paramètres d'URL arrivent toujours en texte : on les valide par un motif
(`pattern`) puis on les convertit dans le code (voir `toPagination`).

### Où valider quoi

| Type de règle                | Où          | Exemple                                             |
| ---------------------------- | ----------- | --------------------------------------------------- |
| forme et type                | `schemas/`  | « `trackId` est un UUID »                           |
| règle qui demande un calcul  | `domain/`   | « le nom fait 1 à 100 caractères une fois nettoyé » |
| règle qui dépend des données | `services/` | « la playlist appartient à ce compte »              |

### Le format des réponses d'erreur

Toute erreur a la même forme :

```json
{ "error": "playlist_not_found" }
```

| Situation                | Statut                    | Champ `error`                |
| ------------------------ | ------------------------- | ---------------------------- |
| jeton absent ou invalide | 401                       | `unauthorized`               |
| entrée invalide          | 400                       | `invalid_request`            |
| refus métier             | celui de la `DomainError` | son code                     |
| panne imprévue           | 503 ou 500                | le code générique du service |

Codes génériques : `catalog_unavailable`, `library_unavailable`,
`playback_unavailable`, `media_unavailable` (503) ; `internal server error`
(500) pour Auth et Users.

Trois exceptions à connaître :

- **Auth et Users** renvoient des phrases (`"invalid credentials"`) et parfois
  un champ `code` en plus (`"USERNAME_TAKEN"`) ;
- **Media** ajoute un champ `message` en français pour l'utilisateur, et chaque
  route a son propre code de panne ;
- une requête `HEAD` reçoit le statut sans corps.

### Créer une erreur métier

Dans `domain/errors.ts` du service, une fonction nommée par erreur :

```ts
export const playlistNotFound = () => new DomainError(404, 'playlist_not_found')
```

Puis, là où la règle est vérifiée : `throw playlistNotFound()`. Aucun
`try/catch` n'est nécessaire dans le contrôleur. Un troisième argument ajoute des
champs à la réponse :

```ts
new DomainError(409, 'username already registered', { code: 'USERNAME_TAKEN' })
// → 409 { "error": "username already registered", "code": "USERNAME_TAKEN" }
```

---

## 11. Tests

### Tests unitaires

Dans `test/` de chaque service. Ils lancent le serveur en mémoire avec de
fausses dépendances et n'ont besoin ni de base ni de Docker.

```bash
npm test -w @ft/library-service
```

Chaque service a un `test/helpers.ts` qui fournit `buildTestApp(...)` et de faux
repositories en mémoire. Pour ajouter un test, copie un cas voisin.

Exception : les tests de `media-service` décodent de vrais fichiers avec
`ffmpeg` et ne tournent que sous Linux. Lance-les dans son image :

```bash
docker compose run --rm --no-deps migrate-media npm test
```

### Campagnes de bout en bout

Dans `tests/` à la racine du dépôt. Elles démarrent une vraie pile Docker isolée
et vérifient HTTP, SQL, redémarrages et navigateur. Elles sont la référence :
**si une campagne échoue, c'est le service qu'on corrige, pas le test.**

| Commande (depuis la racine)   | Ce qu'elle prouve                               |
| ----------------------------- | ----------------------------------------------- |
| `tests/per/run.sh`            | migrations, rôles et permissions de la base     |
| `tests/e2e/run.sh`            | inscription, connexion, profil, avatar          |
| `tests/music/run.sh playback` | catalogue, audio, playlists, écoute             |
| `tests/files/run.sh`          | envoi, liste, aperçu et suppression de fichiers |

Chaque dossier a un `README.md` à lire avant le premier lancement.

---

## 12. Je veux… (recettes)

### …ajouter une route à un service existant

1. **Schéma** : dans `schemas/`, décris le corps, les paramètres et la réponse.
2. **Service** : dans `services/`, écris la règle. Lève une `DomainError` pour
   chaque refus.
3. **Repository** : si la route lit ou écrit en base, ajoute la fonction dans
   `repositories/`.
4. **Contrôleur** : dans `controllers/`, ajoute une fonction qui lit la requête
   et appelle le service.
5. **Route** : dans `routes/`, déclare l'URL. Mets `onRequest: app.authenticate`
   si elle est privée.
6. **Test** : ajoute un cas dans `test/`.
7. **Nginx** : rien à faire si l'URL commence par le préfixe du service.

### …ajouter un champ à une réponse

1. Ajoute-le au schéma de réponse dans `schemas/` — sinon il est filtré et
   n'arrive jamais au client.
2. Ajoute-le au type et à la fonction de conversion dans `domain/`.
3. S'il vient d'une nouvelle colonne, voir [PRISMA.md](PRISMA.md).

### …changer une règle de validation

Cherche d'abord dans `schemas/` (forme), puis dans `domain/` (règle calculée).
Pense à mettre à jour le test correspondant.

### …appeler un autre service

1. Ajoute la fonction dans `clients/<autre>.client.ts`, avec `fetchJson`.
2. Ajoute le client au type `Dependencies` de `app.ts` et crée-le dans
   `server.ts`.
3. Décide ce qui se passe si l'autre service ne répond pas. Par défaut : laisser
   l'erreur remonter, ce qui donne un 503.

### …ajouter une variable d'environnement

1. Ajoute-la au schéma et au type `Config` dans `config/env.ts`.
2. Ajoute-la à `.env.example` et à `ENVIRONMENT.md` à la racine.
3. Si elle n'est pas dans le `.env` commun, ajoute-la au bloc du service dans
   `docker-compose.yml` **et** dans les `compose.yml` de `tests/`.

### …modifier la base de données

Voir [PRISMA.md](PRISMA.md), section « Recettes ».

### …ajouter un microservice

1. Copie un service simple, par exemple `backend/services/library-service`,
   sans `node_modules`, `dist` ni `src/generated`. Remplace ses ressources par
   les tiennes.
2. Renomme le paquet dans `package.json`, choisis le port dans
   `src/config/env.ts`, remplace le nom et le port dans le `Dockerfile`.
3. Lance `npm install` depuis `backend/`.
4. S'il a une base : crée son schéma et ses deux rôles (voir
   [PRISMA.md](PRISMA.md)) et un conteneur `migrate-<nom>` dans
   `docker-compose.yml`.
5. Ajoute son bloc dans `docker-compose.yml`, avec `context: ./backend` et
   `dockerfile: services/<nom>-service/Dockerfile`.
6. Ajoute sa route dans `nginx/nginx.conf` et son job dans
   `monitoring/prometheus/prometheus.yml`.

---

## 13. Quand ça ne marche pas

| Symptôme                                                         | Cause probable                                                 | Où regarder                                              |
| ---------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------- |
| le service s'arrête au démarrage avec `Invalid environment: ...` | une variable d'environnement manque                            | le message la nomme ; `config/env.ts`, `.env`            |
| `400 invalid_request` inattendu                                  | champ en trop, mauvais type, ou paramètre d'URL mal formé      | le schéma de la route dans `schemas/`                    |
| `401 unauthorized`                                               | jeton absent, expiré, ou `JWT_SECRET` différent entre services | `.env`, en-tête `Authorization`                          |
| `503 <service>_unavailable`                                      | base ou autre service injoignable, ou erreur imprévue          | les journaux du conteneur : la vraie erreur y est écrite |
| un champ n'apparaît pas dans la réponse                          | il manque dans le schéma de réponse                            | `schemas/`                                               |
| `409 version_conflict`                                           | la playlist a changé depuis sa lecture                         | recharger puis réessayer                                 |
| `Cannot find module '@ft/service-kit'`                           | le paquet partagé n'est pas compilé                            | `npm run build:packages`                                 |
| une modification de `service-kit` est ignorée                    | même cause                                                     | `npm run build:packages`                                 |
| types Prisma introuvables                                        | le code Prisma n'est pas généré                                | `npm run prisma:generate -w @ft/<service>`               |
| Nginx redémarre en boucle                                        | Prometheus ou Grafana ne tournent pas                          | les démarrer aussi : `nginx.conf` les référence          |

Journaux d'un service : `docker compose logs -f library-service`. Ils sont en
JSON, une ligne par événement ; les erreurs imprévues portent le message
`unhandled error`.

---

## 14. Règles d'écriture

- **Un fichier, un rôle.** Viser moins de 100 lignes, 150 au maximum. Nommer
  `<ressource>.<rôle>.ts` : `playlists.routes.ts`, `playlists.service.ts`.
- **Fonctions courtes**, une instruction par ligne, sorties anticipées
  (`if (!x) { throw ... }` en tête) plutôt que des `else` en cascade.
- **Fabriques** : `createPlaylistsService(dépendances)`. Aucune variable globale
  modifiable dans un module.
- **Aucun `catch` qui masque une erreur.** Une erreur imprévue doit remonter
  pour être journalisée.
- **L'identité vient de `request.userId`**, jamais du corps ni de l'URL.
- **Formatage** : `npm run format` avant de commiter.

### Documentation du code (format Doxygen)

Chaque fichier commence par un en-tête, et chaque fonction, type, classe et
constante porte un bloc.

```ts
/**
 * @file playlists.service.ts
 * @brief Règles métier des playlists privées.
 *
 * @details Texte libre : le contexte utile à quelqu'un qui découvre le fichier.
 */

/**
 * @brief Lit une playlist du compte.
 * @param owner UUID du compte.
 * @param id UUID de la playlist.
 * @returns La playlist.
 * @throws {DomainError} 404 `playlist_not_found`.
 */
```

| Commande                      | Usage                                               |
| ----------------------------- | --------------------------------------------------- |
| `@file`, `@brief`, `@details` | en-tête de fichier                                  |
| `@brief`                      | une phrase : ce que fait l'élément                  |
| `@details`                    | le pourquoi, ou ce qui n'est pas évident            |
| `@param`                      | chaque paramètre                                    |
| `@returns`                    | la valeur renvoyée                                  |
| `@throws`                     | chaque erreur possible, avec son statut et son code |

Un élément simple tient sur une ligne : `/** @brief Longueur maximale du nom. */`.
Écris ce que le code ne dit pas déjà : le **pourquoi**, les cas limites, les
erreurs. Un commentaire qui répète le nom de la fonction n'aide personne.

---

## 15. Commandes

Depuis `backend/` :

| Commande                             | Effet                                          |
| ------------------------------------ | ---------------------------------------------- |
| `npm ci`                             | installe toutes les dépendances                |
| `npm run build:packages`             | compile `@ft/service-kit` — à faire en premier |
| `npm run format`                     | met le code au format                          |
| `npm run format:check`               | vérifie le format sans rien modifier           |
| `npm run typecheck -w @ft/<service>` | vérifie les types du service et de ses tests   |
| `npm test -w @ft/<service>`          | lance ses tests unitaires                      |
| `npm run build -w @ft/<service>`     | compile le service dans `dist/`                |

`<service>` vaut `auth-service`, `user-service`, `catalog-service`,
`media-service`, `library-service` ou `playback-service`.

Depuis la racine du dépôt :

| Commande                                 | Effet                              |
| ---------------------------------------- | ---------------------------------- |
| `make setup`                             | construit et démarre toute la pile |
| `make logs`                              | suit les journaux                  |
| `make down`                              | arrête la pile                     |
| `docker compose logs -f <service>`       | journaux d'un seul service         |
| `docker compose up -d --build <service>` | reconstruit et relance un service  |

Avant de démarrer la pile, il faut un fichier `.env` complet : voir
`ENVIRONMENT.md` à la racine.
