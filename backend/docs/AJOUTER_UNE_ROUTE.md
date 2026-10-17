# Ajouter une route ou une fonctionnalité au backend

Ce document s'adresse à quelqu'un qui n'a jamais ouvert le backend et qui veut
ajouter quelque chose : une nouvelle URL, une action, une donnée en plus. Il dit
**dans quel service** travailler, puis **quels fichiers toucher, dans quel ordre,
à quoi sert chacun et quoi y écrire**.

Pour comprendre le backend en général (services, Docker, Nginx, jetons), lis
d'abord [CONVENTIONS.md](CONVENTIONS.md). Pour tout ce qui touche aux tables de
la base, lis [PRISMA.md](PRISMA.md). Ici, on se concentre sur le geste concret.

## Sommaire

1. [Choisir le service](#1-choisir-le-service)
2. [La carte : un fichier par rôle](#2-la-carte--un-fichier-par-rôle)
3. [Les étapes, dans l'ordre](#3-les-étapes-dans-lordre)
4. [Exemple complet : `DELETE /me/avatar`](#4-exemple-complet--delete-meavatar)
5. [Exemple avec un corps de requête : `POST /playlists`](#5-exemple-avec-un-corps-de-requête--post-playlists)
6. [Cas particuliers](#6-cas-particuliers)
7. [Vérifier son travail](#7-vérifier-son-travail)
8. [Pièges fréquents](#8-pièges-fréquents)
9. [Liste de contrôle](#9-liste-de-contrôle)

---

## 1. Choisir le service

Chaque service a **une seule responsabilité**. Ta fonctionnalité va dans celui qui
possède la donnée concernée.

| Si ta fonctionnalité concerne…                                 | Service            | Préfixe d'URL côté navigateur |
| -------------------------------------------------------------- | ------------------ | ----------------------------- |
| un compte, un mot de passe, une connexion                      | `auth-service`     | `/api/auth/`                  |
| un profil, un avatar, des amis, la présence en ligne           | `user-service`     | `/api/users/`                 |
| des morceaux, artistes, albums publiés (lecture du catalogue)  | `catalog-service`  | `/api/catalog/`               |
| un fichier envoyé, sa vérification, son stockage, sa diffusion | `media-service`    | `/api/media/`                 |
| des playlists privées                                          | `library-service`  | `/api/library/`               |
| une session d'écoute, l'historique, le suivi de lecture        | `playback-service` | `/api/playback/`              |
| une conversation, un message, le chat entre amis               | `chat-service`     | `/api/chat/`                  |

Règles de décision :

- **Une donnée = un propriétaire.** Un service ne lit jamais directement les
  tables d'un autre. S'il a besoin d'une information d'un autre service, il la
  lui demande par HTTP (voir [§6](#6-cas-particuliers)).
- Si aucun service ne convient, c'est probablement un nouveau microservice. Voir
  la recette « ajouter un microservice » de [CONVENTIONS.md](CONVENTIONS.md#12-je-veux-recettes).
- Tu ne touches **pas** au navigateur ni à Nginx pour une route ordinaire : le
  préfixe du service est déjà aiguillé. Nginx retire ce préfixe avant de
  transmettre : le navigateur appelle `/api/users/me/avatar`, le service reçoit
  `/me/avatar`. **Dans le code du service, n'écris jamais `/api/users`.**

Tout se passe ensuite dans `backend/services/<service>/src/`.

---

## 2. La carte : un fichier par rôle

Les sept services ont la même arborescence. Une requête traverse les dossiers dans
cet ordre, et tu y ajoutes un morceau de code à chaque étape qui te concerne :

```
Navigateur ─► Nginx ─► routes/ ─► controllers/ ─► services/ ─► repositories/ ─► base
                         │            │               │
                         │            │               └─► clients/ ─► un autre service
                         │            │               └─► storage/ ─► le disque (user, media)
                         ▼            ▼
                      schemas/     domain/   (erreurs, types, règles pures)
```

| Dossier         | Rôle                                                       | Tu y ajoutes…                                             |
| --------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| `routes/`       | La table des matières : quelle URL appelle quelle fonction | une ligne `app.get/post/put/patch/delete(...)`            |
| `schemas/`      | La forme valide d'une entrée et d'une réponse (TypeBox)    | le schéma du corps, des paramètres d'URL et de la réponse |
| `controllers/`  | La couche HTTP : lit la requête, appelle le service        | une petite fonction par route                             |
| `services/`     | Les règles métier : ce qui doit se passer, dans l'ordre    | une fonction qui applique les règles et lève les refus    |
| `domain/`       | Types métier, fonctions pures, **liste des erreurs**       | une erreur, un type, une conversion, une règle calculée   |
| `repositories/` | **Seul** endroit qui parle à la base (Prisma)              | une fonction de lecture ou d'écriture                     |
| `clients/`      | Appels HTTP vers un autre service                          | une fonction par appel sortant                            |
| `storage/`      | Fichiers sur le disque (`user-service`, `media-service`)   | une opération de lecture, d'écriture ou de suppression    |
| `test/`         | Tests sans base ni réseau                                  | un cas par comportement                                   |

Chaque couche ne connaît que la suivante. Cette séparation a un but pratique :
**une règle métier se trouve dans `services/` ou `domain/`, jamais ailleurs**.

| Dossier         | Connaît Fastify (HTTP) ? | Connaît Prisma (base) ? |
| --------------- | ------------------------ | ----------------------- |
| `routes/`       | oui                      | non                     |
| `controllers/`  | oui                      | non                     |
| `services/`     | non                      | non                     |
| `repositories/` | non                      | oui                     |

Si tu écris du SQL ou du Prisma dans un service, ou une règle métier dans un
contrôleur, tu es au mauvais endroit.

---

## 3. Les étapes, dans l'ordre

On travaille **de l'intérieur vers l'extérieur** : d'abord la donnée, puis les
règles, puis la porte d'entrée. Tu peux ainsi compiler et tester à chaque étape.
Saute celles dont tu n'as pas besoin (une route qui ne touche pas la base n'a pas
d'étape 2).

### Étape 0 — Décrire la route avant de coder

Écris sur une ligne : **méthode, chemin, qui peut l'appeler, ce qu'elle reçoit,
ce qu'elle renvoie, quels refus**. Exemple :

```
DELETE /me/avatar — utilisateur connecté — pas de corps — renvoie le profil à jour
refus : 401 sans jeton, 404 si le compte n'a pas de profil
```

Choisis la méthode HTTP selon l'intention : `GET` lire, `POST` créer, `PUT`
remplacer, `PATCH` modifier une partie, `DELETE` supprimer. Choisis le statut de
succès : `200` par défaut, `201` pour une création.

### Étape 1 — Les erreurs : `domain/errors.ts`

**À quoi il sert.** C'est la liste de tous les refus que le service peut opposer.
Chaque refus est une petite fonction : le statut HTTP et le message sont écrits
**à un seul endroit**.

**Quoi y ajouter.** Une fonction par nouveau cas de refus. Si une erreur
existante convient (`profileNotFound`, par exemple), réutilise-la.

Dans `library-service` (le format moderne, avec des codes) :

```ts
/** @brief Crée l'erreur « playlist introuvable » : réponse `404 playlist_not_found`. */
export const playlistNotFound = () => new DomainError(404, 'playlist_not_found')
```

Dans `user-service` et `auth-service`, les messages sont des phrases en anglais.
`user-service` fournit en plus un petit utilitaire `refusal` pour les écrire :

```ts
export const profileNotFound = refusal(404, 'profile not found') // user-service
```

`auth-service` écrit `new DomainError(400, '...')` directement, comme `library-service`.

> **Attention, `user-service` et `auth-service`.** Le texte de chaque erreur est
> affiché tel quel par le frontend et comparé tel quel par les tests. **Ne
> modifie jamais un message existant.** Pour une nouvelle erreur, choisis un
> message clair en anglais et préviens l'équipe frontend.

Plus tard, dans le service, tu écriras simplement `throw profileNotFound()`. Aucun
`try/catch` n'est nécessaire dans le contrôleur : le plugin d'erreurs commun
transforme l'erreur en réponse `{ "error": "<message>" }`.

### Étape 2 — La base : `repositories/` (seulement si tu lis ou écris en base)

**À quoi il sert.** Le repository sait **comment** lire et écrire. Il ne décide de
rien. C'est le seul fichier qui importe Prisma.

**Quoi y ajouter.** Une fonction dans l'objet renvoyé par `createXxxRepository`.
Elle prend des valeurs **déjà vérifiées** et renvoie des données brutes.

```ts
/**
 * @brief Retire l'adresse d'avatar d'un compte : son profil n'a plus d'image.
 * @param userId Identifiant du compte.
 * @returns Le profil à jour, avec `avatarUrl` à null.
 */
clearAvatar(userId: string): Promise<Profile> {
  return prisma.profile.update({
    where: { userId },
    data: { avatarUrl: null },
    select: profileFields,
  })
},
```

Deux points d'attention :

- **Les colonnes lues.** Beaucoup de repositories définissent une liste
  (`profileFields`) : réutilise-la pour que tous les profils aient la même forme.
- **Si ta fonctionnalité demande une nouvelle table ou colonne**, il faut d'abord
  modifier le schéma Prisma et créer une migration. Suis [PRISMA.md](PRISMA.md),
  section « Recettes », puis reviens ici.

### Étape 3 — Le disque ou un autre service : `storage/` ou `clients/` (si besoin)

- **`storage/`** (dans `user-service` et `media-service`) : tout accès aux
  fichiers du disque. Ajoute une opération (`write`, `read`, `remove`…). Les noms
  de fichier reçus ici doivent **déjà** avoir été vérifiés par le service : ne
  refais pas le contrôle ici, et ne construis jamais un chemin avec une valeur du
  client.
- **`clients/`** : appel HTTP vers un autre service. Voir [§6](#6-cas-particuliers).

### Étape 4 — Les règles : `domain/` puis `services/`

**`domain/`.** Ce sont les types du métier et les fonctions **pures** (sans base,
sans HTTP, sans effet de bord) : « ce nom d'utilisateur est-il valide ? »,
« comment fabriquer le nom d'un fichier ? », « convertir une ligne de base en
objet public ». Ajoute ici tout ce qui se calcule sans rien consulter.

**`services/`.** C'est là que **les règles du métier vivent**. Un service reçoit
une demande déjà vérifiée dans sa forme, enchaîne les étapes dans le bon ordre,
lève les refus, et renvoie le résultat. Il ne connaît ni HTTP ni SQL.

Une fonction de service suit presque toujours ce schéma :

1. lire ce dont on a besoin (via le repository) ;
2. **vérifier les règles** : si une règle est enfreinte, `throw monErreur()` ;
3. écrire (via le repository, le stockage, un client) ;
4. renvoyer le résultat.

```ts
async remove(userId: string): Promise<Profile> {
  const current = await profiles.find(userId)
  if (current === null) {
    throw profileNotFound()          // règle : le profil doit exister
  }
  const updated = await profiles.clearAvatar(userId)   // d'abord la base…
  const fileName = avatarFileNameOf(current.avatarUrl, userId)
  if (fileName !== null) {
    await storage.remove(fileName)   // …puis le disque
  }
  return toProfile(updated)
},
```

Pense à **l'ordre des effets** : si une étape échoue au milieu, que reste-t-il
d'incohérent ? Ici on modifie la base avant le disque : au pire il reste un fichier
orphelin, jamais un profil qui pointe vers un fichier disparu.

Si le service a besoin d'un nouvel objet (un autre repository, un client), ajoute-le
en paramètre de `createXxxService(...)`. Voir [Étape 8](#étape-8--assembler--appts-et-servertss).

### Étape 5 — Les schémas : `schemas/`

**À quoi il sert.** Un schéma décrit à quoi ressemble une entrée valide (corps,
paramètres d'URL, paramètres de recherche) et ce qu'une réponse a le droit de
contenir. Fastify le compare à chaque requête **avant** d'exécuter ton code : une
requête non conforme reçoit `400 invalid_request` sans atteindre le contrôleur.

**Quoi y ajouter.**

```ts
import { UuidSchema } from '@ft/service-kit'
import { Type } from 'typebox'

/** @brief Partie variable de l'URL `/playlists/:id`. */
export const PlaylistParamsSchema = Type.Object({ id: UuidSchema })

/** @brief Corps accepté par `POST /playlists`. */
export const CreatePlaylistBodySchema = Type.Object(
  { name: Type.String(), description: Type.Optional(Type.String()) },
  { additionalProperties: false } // ← à mettre sur CHAQUE objet d'entrée
)
```

Règles à retenir :

- **`{ additionalProperties: false }` sur chaque objet d'entrée.** Sans lui, un
  champ en trop est accepté en silence.
- La validation est **stricte** : `"5"` n'est pas converti en `5`.
- Les paramètres d'URL arrivent toujours en texte : valide-les par un motif
  (`UuidSchema`) ou convertis-les dans le code.
- Pagination : `PageQuerySchema` et `toPagination` existent dans `@ft/service-kit`.
- **Le schéma de réponse est un filtre.** Seuls les champs qu'il liste sont envoyés
  au client, même si l'objet renvoyé en contient d'autres. Si un nouveau champ
  n'arrive pas dans la réponse, c'est presque toujours qu'il manque ici.
- Pour déduire le type TypeScript d'un schéma : `export type X = Static<typeof XSchema>`.
- Une règle qui demande un calcul (une longueur mesurée après avoir retiré les
  espaces, par exemple) ne s'écrit pas dans un schéma mais dans `domain/`.

> `user-service` et `auth-service` vérifient les **corps** à la main dans
> `domain/`, pour renvoyer un message précis par champ. Dans ces deux services,
> n'ajoute pas de schéma de corps : suis l'exemple de la route voisine.

### Étape 6 — Le contrôleur : `controllers/`

**À quoi il sert.** C'est la couche HTTP. Quand il est appelé, le jeton est déjà
vérifié (l'identifiant du compte est dans `request.userId`) et la forme de la
requête est déjà validée. Il **extrait** ce dont le service a besoin, **appelle** le
service, et **renvoie** le résultat (Fastify l'écrit en JSON).

**Quoi y ajouter.** Une fonction dans l'objet renvoyé par `createXxxController`.
**Aucune règle métier ici.**

```ts
/**
 * @brief Répond à `DELETE /me/avatar` : supprime l'image de profil de l'utilisateur connecté.
 * @param request Requête reçue ; l'identité vient du jeton, jamais du client.
 * @returns Le profil à jour, sans adresse d'avatar.
 */
async remove(request: FastifyRequest) {
  return avatars.remove(request.userId)
},
```

À savoir :

- **L'identité vient toujours de `request.userId`**, lu dans le jeton. Ne la prends
  **jamais** dans le corps ou l'URL : un client pourrait mentir.
- Pour typer ce que contient la requête :
  `FastifyRequest<{ Params: PlaylistParams; Body: CreatePlaylistBody }>`.
- Pour un statut autre que 200 : `return reply.code(201).send(resultat)`.
- Pour un paramètre invalide qui échappe au schéma : `throw invalidRequest()`
  (importé de `@ft/service-kit`).

### Étape 7 — La route : `routes/`

**À quoi il sert.** C'est la table des matières du service : pour chaque URL, la
méthode, le chemin, la protection, les schémas et la fonction à appeler. **Pour
comprendre ce que fait une URL, on part de ce fichier.**

**Quoi y ajouter.** Une ligne, dans le fichier du thème concerné (ou un nouveau
fichier `xxx.routes.ts` si c'est un thème nouveau, voir [§6](#6-cas-particuliers)).

```ts
app.delete(
  '/me/avatar',
  { onRequest: app.authenticate, schema: { response: { 200: ProfileSchema } } },
  avatars.remove
)
```

Les options à connaître :

| Option                                | Effet                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| `onRequest: app.authenticate`         | Route **privée** : exige un jeton valide, sinon 401. Renseigne `request.userId`. |
| _(pas d'`onRequest`)_                 | Route **publique**. À faire exprès.                                              |
| `onRequest: app.requireInternalToken` | Route réservée à un autre service (secret partagé). Chemin sous `/internal/...`. |
| `schema.params / body / querystring`  | Schémas d'entrée (étape 5).                                                      |
| `schema.response: { 200: XxxSchema }` | Schéma de réponse, qui filtre les champs envoyés (étape 5).                      |

**Par défaut, mets `onRequest: app.authenticate`.** Une route sans protection est
visible de tout Internet.

### Étape 8 — Assembler : `app.ts` et `server.ts`

La plupart du temps, **tu n'as rien à faire ici** : si tu ajoutes une route à un
thème existant, son contrôleur, son service et son repository sont déjà branchés.

Tu dois y toucher dans deux cas :

- **Nouveau fichier de routes** : dans `app.ts`, importe `registerXxxRoutes`,
  `createXxxController` et `createXxxService`, puis ajoute la ligne :

  ```ts
  registerXxxRoutes(app, createXxxController(createXxxService(profiles, social)))
  ```

- **Nouvelle dépendance** (un nouveau repository, un nouveau client, un nouveau
  stockage) : ajoute-la au type `Dependencies` de `app.ts`, récupère-la dans
  `buildApp`, passe-la au service, **puis crée la vraie instance dans
  `server.ts`**. Enfin, fournis une fausse version dans `test/helpers.ts`
  (étape 9), sinon les tests ne compilent plus.

`app.ts` n'ouvre pas de port et ne crée aucune connexion : tout lui est passé en
paramètre (c'est ce qui permet de tester sans base). `server.ts` est le seul
fichier qui lit l'environnement et crée les vrais objets.

### Étape 9 — Les tests : `test/`

**À quoi ils servent.** Ils lancent le serveur **en mémoire**, avec de fausses
dépendances : ni base, ni Docker, ni réseau. Chaque service a un `test/helpers.ts`
qui fournit `buildTestApp(...)` et de faux repositories.

**Quoi y ajouter.**

1. **Si tu as ajouté une opération à un repository ou à un stockage**, ajoute-la
   aussi à sa fausse version dans `test/helpers.ts` (sinon le typage échoue).
2. **Un test par comportement**, en copiant un test voisin :
   - le cas qui marche (statut et corps de la réponse) ;
   - chaque refus (401 sans jeton, 404, 409, 400 pour une entrée invalide…) ;
   - les effets de bord (le fichier a bien disparu, la base a bien été appelée).

```ts
test('DELETE /me/avatar refuses anonymous callers and unknown profiles', async (t) => {
  const { app, bearer } = await setup()
  t.after(() => app.close())
  const stranger = await app.inject({
    method: 'DELETE',
    url: '/me/avatar',
    headers: bearer(newUserId()),
  })
  assert.equal(stranger.statusCode, 404)
  assert.deepEqual(stranger.json(), { error: 'profile not found' })
})
```

`app.inject(...)` simule une requête HTTP sans réseau. `bearer(userId)` fabrique
l'en-tête de connexion d'un compte de test.

---

## 4. Exemple complet : `DELETE /me/avatar`

Cette route existe dans `user-service`. Elle permet à un utilisateur de retirer son
image de profil. Voici **tous les fichiers touchés**, dans l'ordre où on les écrit.
Chemins relatifs à `backend/services/user-service/`.

| #   | Fichier                                   | Ce qu'on y a ajouté                                                                     |
| --- | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | `src/domain/avatar.ts`                    | `avatarFileNameOf` : retrouve le nom du fichier à effacer à partir de l'adresse en base |
| 2   | `src/repositories/profiles.repository.ts` | `clearAvatar` : met `avatarUrl` à `null`                                                |
| 3   | `src/storage/avatar-storage.ts`           | `remove` : efface le fichier du disque, sans erreur s'il n'existe déjà plus             |
| 4   | `src/services/avatars.service.ts`         | `remove` : vérifie que le profil existe, met à jour la base, puis efface le fichier     |
| 5   | `src/controllers/avatars.controller.ts`   | `remove` : appelle le service avec `request.userId`                                     |
| 6   | `src/routes/avatars.routes.ts`            | `app.delete('/me/avatar', ...)`, protégée par `app.authenticate`                        |
| 7   | `test/helpers.ts`                         | `clearAvatar` et `remove` dans les fausses versions                                     |
| 8   | `test/avatars.test.ts`                    | Deux tests : le cas nominal et les refus                                                |

Il n'y a eu besoin ni de nouvelle erreur (`profileNotFound` existait), ni de
nouveau schéma (la réponse est un `ProfileSchema` existant, la route n'a pas de
corps), ni de modification de `app.ts` (le contrôleur était déjà branché), ni de
Nginx.

Remarque sur la sécurité : `avatarFileNameOf` n'accepte l'adresse que si elle a le
préfixe attendu, si le nom a exactement le format des avatars (donc aucun `/` ni
`..`) **et** s'il commence par l'identifiant du compte. Une adresse trafiquée en
base ne peut donc jamais faire effacer le fichier d'un autre utilisateur. Tout
fichier dont le nom vient d'une source extérieure doit être contrôlé ainsi.

---

## 5. Exemple avec un corps de requête : `POST /playlists`

Pour voir comment un **corps** et un **statut 201** s'écrivent, regarde
`library-service`. Le trajet est le même :

| Couche     | Fichier                               | Extrait                                                                                                                                  |
| ---------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Schéma     | `schemas/playlists.schema.ts`         | `CreatePlaylistBodySchema = Type.Object({ name, description? }, { additionalProperties: false })`                                        |
| Règle pure | `domain/playlist.ts`                  | `toPlaylistInput` nettoie et mesure le nom (1 à 100 caractères une fois les espaces retirés)                                             |
| Contrôleur | `controllers/playlists.controller.ts` | `const playlist = await playlists.create(request.userId, toPlaylistInput(request.body))` puis `reply.code(201).send(playlist)`           |
| Route      | `routes/playlists.routes.ts`          | `app.post('/playlists', { onRequest, schema: { body: CreatePlaylistBodySchema, response: { 201: PlaylistSchema } } }, playlists.create)` |
| Test       | `test/playlists.test.ts`              | un test qui envoie un corps valide, puis des corps invalides (champ en trop, mauvais type)                                               |

Lis ces cinq fichiers dans cet ordre : c'est le modèle à copier pour toute route
qui reçoit des données.

---

## 6. Cas particuliers

### Ajouter un thème entier (un nouveau fichier de routes)

Crée quatre fichiers de même nom : `xxx.routes.ts`, `xxx.controller.ts`,
`xxx.service.ts`, `xxx.schema.ts` (et `xxx.repository.ts` si besoin). Copie ceux
d'un thème voisin, renomme, puis branche-les dans `app.ts` (étape 8).

### Appeler un autre service

Deux exemples réels existent. `library-service` demande à `catalog-service` si un
morceau est publié (appel à une route publique, `GET /tracks/<id>`). `auth-service`
demande à `user-service` de créer le profil d'un nouveau compte (route interne,
`PUT /internal/profiles/<id>`, avec le secret partagé).

1. Si l'information n'existe pas déjà derrière une route, crée-la dans le service
   **appelé**. Si elle ne doit être accessible qu'aux autres services, place-la sous
   `/internal/...` avec `onRequest: app.requireInternalToken`. Nginx bloque déjà
   `/api/<service>/internal/` côté public (réponse 404) : ne change pas cela.
2. Dans le service **appelant**, ajoute une fonction dans `clients/<autre>.client.ts`
   avec `fetchJson` (de `@ft/service-kit`). Pour une route interne, envoie l'en-tête
   `authorization: Bearer <jeton interne>`.
3. Ajoute le client au type `Dependencies` de `app.ts` et crée-le dans `server.ts`.
   L'adresse de l'autre service vient d'une variable d'environnement (voir plus bas).
4. Décide ce qui se passe quand l'autre service ne répond pas. Par défaut, laisse
   l'erreur remonter : le client reçoit un 503.

### Une route réservée aux autres services

Chemin sous `/internal/...`, `onRequest: app.requireInternalToken` au lieu de
`app.authenticate`. Jamais d'identité d'utilisateur dans ce cas : le service appelant
passe les identifiants dans le corps.

### Une route publique

Pas d'`onRequest`. À réserver aux données réellement publiques (le catalogue, la
lecture d'une image d'avatar). Dans le doute, protège.

### Une nouvelle variable d'environnement

1. Ajoute-la au schéma et au type `Config` dans `config/env.ts`.
2. Ajoute-la à `.env.example` et à `ENVIRONMENT.md` à la racine du dépôt.
3. Si elle n'est pas dans le `.env` commun, ajoute-la au bloc du service dans
   `docker-compose.yml` **et** dans les `compose.yml` de `tests/`.

### Un nouveau champ dans une réponse

1. Ajoute-le au **schéma de réponse** (`schemas/`), sinon il est filtré.
2. Ajoute-le au type et à la fonction de conversion dans `domain/`.
3. S'il vient d'une nouvelle colonne, voir [PRISMA.md](PRISMA.md).

---

## 7. Vérifier son travail

Depuis `backend/` (les commandes utilisent le nom du service dans `package.json`) :

```sh
# 1. Le typage (le plus rapide pour repérer un oubli, par exemple une fausse
#    dépendance manquante dans test/helpers.ts)
npm run typecheck -w @ft/user-service

# 2. Les tests du service
npm test -w @ft/user-service

# 3. Le formatage (obligatoire avant de pousser)
npm run format:check
npm run format            # corrige automatiquement
```

Remplace `user-service` par le service que tu as modifié. Les tests de
`media-service` décodent de vrais fichiers avec `ffmpeg` et ne tournent que sous
Linux : lance-les dans son image avec
`docker compose run --rm --no-deps migrate-media npm test`.

Puis essaie la route pour de vrai, depuis la racine du dépôt :

```sh
make setup        # reconstruit les images et relance la pile
```

Ouvre https://localhost:1443 (accepte l'avertissement du certificat auto-signé) ou
appelle l'API avec `curl`. Une route privée demande un jeton : connecte-toi
d'abord via `/api/auth/...` et envoie-le dans l'en-tête `Authorization: Bearer ...`.

Quand tu modifies un service, **reconstruis son image** (`make setup` le fait) : le
conteneur n'utilise pas ton code local tant que l'image n'est pas reconstruite.

Les campagnes de bout en bout (`tests/e2e/run.sh`, `tests/music/run.sh`) sont décrites
dans [CONVENTIONS.md](CONVENTIONS.md#11-tests) ; lance-les avant un gros changement.

---

## 8. Pièges fréquents

| Symptôme                                                                  | Cause probable                                                                                                                   |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `404` alors que la route existe                                           | Tu as écrit `/api/users/...` dans le service (le préfixe est retiré par Nginx), ou la route n'est pas enregistrée dans `app.ts`. |
| `401` sur une route que tu pensais publique                               | Tu as laissé `onRequest: app.authenticate`.                                                                                      |
| `400 invalid_request` alors que le corps semble correct                   | Champ en trop (`additionalProperties: false`), mauvais type (`"5"` au lieu de `5`) ou champ manquant.                            |
| Un champ de la réponse n'arrive jamais au client                          | Il manque dans le **schéma de réponse** : Fastify filtre tout ce qui n'y est pas.                                                |
| Le typage échoue dans les tests après avoir ajouté une opération          | La fausse version dans `test/helpers.ts` n'a pas la nouvelle fonction.                                                           |
| `503` partout après ton changement                                        | Une erreur imprévue (base en panne, exception non rattrapée). Regarde les logs : `make logs`.                                    |
| Ça marche en test mais pas dans le navigateur                             | L'image Docker n'a pas été reconstruite, ou Nginx ne route pas ce préfixe.                                                       |
| Un message d'erreur de `user-service` ou `auth-service` casse le frontend | Tu as modifié un message existant : ces textes sont un contrat.                                                                  |

---

## 9. Liste de contrôle

Avant de pousser :

- [ ] Le service choisi est bien celui qui **possède** la donnée.
- [ ] La route n'écrit pas le préfixe `/api/<service>`.
- [ ] Elle est **protégée** (`app.authenticate`, ou `app.requireInternalToken` pour
      un appel entre services), sauf choix public assumé.
- [ ] L'identité vient de `request.userId`, jamais du corps ni de l'URL.
- [ ] Chaque objet d'entrée porte `{ additionalProperties: false }`.
- [ ] Le **schéma de réponse** liste tous les champs à renvoyer.
- [ ] Aucune règle métier dans le contrôleur ; aucun Prisma hors de `repositories/`.
- [ ] Chaque refus est une erreur nommée dans `domain/errors.ts`.
- [ ] Les fausses dépendances de `test/helpers.ts` sont à jour.
- [ ] Un test couvre le cas nominal **et** chaque refus.
- [ ] Les commentaires Doxygen (`@brief`, `@param`, `@returns`, `@throws`) sont
      écrits et expliquent le « pourquoi » : voir
      [CONVENTIONS.md](CONVENTIONS.md#14-règles-décriture).
- [ ] `npm run typecheck`, `npm test` et `npm run format:check` passent.
