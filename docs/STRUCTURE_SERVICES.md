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
3. `apply-permissions` fixe les propriétaires et les droits runtime.
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

Les six services possèdent désormais leurs routes métier. `/health` vérifie
que le serveur répond ; `/ready` exprime la disponibilité déclarée par chaque
application. Pour comprendre une route, partir de `src/app.ts`, puis suivre
les lecteurs et écrivains branchés par `src/index.ts`.

## Isolation

Chaque service reçoit une URL runtime limitée à son schéma. Les rôles de
migration possèdent les objets ; les rôles runtime ne peuvent ni créer ni
modifier la structure. Les références interservices sont des UUID logiques :
aucune clé étrangère ne traverse une frontière de propriété.

Le scénario [`tests/per/run.sh`](../tests/per/run.sh) reconstruit et contrôle
cette structure sur une database jetable.

## Relire les contributions d’Ange

La passe de documentation du 13 octobre 2026 suit les contributions Git
`Azard444` et les missions techniques Done du projet dans Notion : PostgreSQL,
Prisma et permissions, username, bio et profil, preuves de persistance,
Catalogue, Media, Library, Playback et gestion privée des fichiers.
Dans les fichiers partagés, les commentaires portent sur les déclarations
et les blocs attribués à cet auteur. Les fonctions d’autres membres, les
fichiers générés, les dépendances et les modifications locales déjà présentes
restent hors de cette passe.

Dans VS Code, survoler le nom d’une fonction, d’un type, d’un champ ou d’une
constante affiche son commentaire JSDoc, le bloc `/** … */` placé au-dessus.
Les paramètres et résultats sont expliqués lorsque leur sens ne découle pas
de leur type. « Aller à la définition » permet ensuite de lire le traitement.
Un callback anonyme n’a pas toujours un nom survolable : son rôle est expliqué
près du bloc concerné ou dans la fonction qui l’utilise.

Les commentaires décrivent le fonctionnement actuel, y compris les limites.
Par exemple, l’enregistrement d’un avatar et l’écriture du profil ne forment
pas une transaction commune : une panne SQL peut laisser un fichier orphelin.
La documentation ne transforme pas cette limite en garantie de nettoyage.

## Suivre les parcours

Un DTO est la forme de données renvoyée par l’API. Une dépendance injectée est
une fonction fournie à l’application : `index.ts` fournit le vrai stockage,
tandis qu’un test peut fournir une réponse ou une panne contrôlée.

| Parcours | Commencer ici | Traitement et stockage | Ce qu’il faut distinguer |
| --- | --- | --- | --- |
| Inscription | [Auth app](../services/auth-service/src/app.ts) | [Stockage d’inscription](../services/auth-service/src/database/registration-store.ts), [envoi à Users](../services/auth-service/src/request-profile-creation.ts), [résultat](../services/auth-service/src/handle-profile-creation-result.ts) | Un compte créé attend son profil avant de devenir `active`. Une outbox est une boîte d’envoi durable ; la même demande peut être retentée après une panne. |
| Profil, username et bio | [Users app](../services/user-service/src/app.ts), [contrat username](../frontend/src/username.ts) | [Adaptateurs Users](../services/user-service/src/index.ts), [commande de profil](../services/user-service/src/profile-creation-definitions.ts) | Username unique et canonique ; nom affiché distinct ; bio absente représentée par `null`. Les blocs amis et présence écrits par les autres membres sont conservés. |
| Catalogue | [Client Catalogue](../frontend/src/services/catalog.ts), [page Catalogue](../frontend/src/pages/CatalogPage.tsx) | [Contrat](../services/catalog-service/src/catalog.ts), [liste SQL](../services/catalog-service/src/database/catalog-list.ts) | Tri global avant pagination ; filtre commun au total et aux lignes ; seuls les morceaux `published` sont visibles. |
| Audio public | [Lecteur](../frontend/src/components/AudioPlayer.tsx) | [Routes Media](../services/media-service/src/app.ts), [contrôle de publication](../services/media-service/src/publication.ts) | GET peut renvoyer une plage d’octets pour le déplacement audio ; HEAD renvoie les métadonnées sans corps. La publication Catalogue autorise cet accès public. |
| Playlists | [Hook Library](../frontend/src/hooks/useLibrary.ts), [client](../frontend/src/services/library.ts) | [Contrat](../services/library-service/src/playlist.ts), [mutations SQL](../services/library-service/src/database/mutations.ts) | `itemId` identifie une occurrence, `trackId` le morceau. Une playlist peut contenir plusieurs fois le même morceau. `expectedVersion` évite d’écraser une modification concurrente. |
| Écoute et historique | [Horloge](../frontend/src/services/listening-clock.ts), [file d’envoi](../frontend/src/services/playback-queue.ts) | [Règles de progression](../services/playback-service/src/progress.ts), [transaction](../services/playback-service/src/database/mutations.ts), [contrat](../services/playback-service/src/session.ts) | Position, cumul déclaré et temps crédité sont trois valeurs distinctes. Les répétitions gardent la même séquence et le même contenu ; elles ne comptent pas deux fois. |
| Fichiers privés | [Formulaire](../frontend/src/components/FileUploadForm.tsx), [envoi](../frontend/src/services/send-file.ts), [page](../frontend/src/pages/FilesPage.tsx) | [Réception](../services/media-service/src/register-file-upload.ts), [validation](../services/media-service/src/validate-file.ts), [stockage](../services/media-service/src/save-file.ts), [lecture](../services/media-service/src/register-file-reads.ts), [suppression](../services/media-service/src/delete-file.ts) | Octets transférés et validation serveur ont des états distincts. Chaque upload conserve son propre UUID, propriétaire et copie ; le checksum ne dédoublonne pas le stockage. |

Les contrats détaillés restent dans [Catalogue](music/CATALOG_CONTRACT.md),
[Media](music/MEDIA_CONTRACT.md), [Library](music/LIBRARY_CONTRACT.md),
[Playback](music/PLAYBACK_CONTRACT.md) et [fichiers](music/FILES_CONTRACT.md).
Les temps sont en millisecondes dans les contrats d’écoute et de stockage ;
les tailles sont en octets. Les interfaces convertissent les valeurs pour
l’affichage. Un verrou SQL réserve une ligne pendant une transaction afin
que deux mutations ne valident pas simultanément le même état.

## Lire les fichiers sans JSDoc

| Format | Où lire les explications |
| --- | --- |
| Shell | Commentaires `#` du runner : paramètres, phases, assertions et traitement de sortie. Conserver la ligne `#!/…` en premier. |
| SQL de permissions et de tests | Commentaires `--` sur les rôles, transactions et assertions. Les valeurs psql restent séparées du texte SQL. |
| Prisma | Commentaires `///` près des modèles et des champs possédés par Ange. Les références vers les autres services sont des UUID logiques, sans clé étrangère traversant un schéma propriétaire. |
| Dockerfile, Compose et Nginx | Commentaires `#` près des ajouts : compilation, dépendances, volumes durables, autorisations et limites d’upload. |
| CSS | Commentaires `/* … */` près des styles ajoutés pour Mes fichiers. |
| JSON et lockfiles | Explications dans les guides : le JSON standard n’accepte pas de commentaires et les lockfiles sont générés. |

Le survol dépend du support du langage par l’éditeur : la présence d’un
commentaire dans un script ou une configuration ne garantit pas son affichage
au survol. Il reste directement lisible dans le fichier.

## Comprendre les configurations JSON

Dans les `package.json` des services, `build` génère Prisma puis compile
TypeScript ; `test` exécute les scénarios du service. `prisma:generate`
recrée le client, `prisma:validate` contrôle les modèles,
`prisma:migrate:deploy` applique les migrations existantes et `prisma:smoke`
vérifie une connexion runtime. Les commandes de seed Catalogue et Media sont
explicites : elles ne s’exécutent pas automatiquement au démarrage.
Voir [Prisma](../services/PRISMA.md) pour les URLs runtime et migration.

Les `tsconfig.json` possédés par Ange définissent la compilation stricte,
les modules compatibles Node et la destination `dist`. Le client Prisma
reste généré depuis le schéma, jamais corrigé à la main. `package-lock.json`
verrouille les versions exactes ; les fichiers des tests navigateur voisins
déclarent leur version de Playwright et les commandes du runner.

Les variables de connexion et les secrets sont décrits dans
[ENVIRONMENT.md](../ENVIRONMENT.md). Les commentaires n’en reproduisent
aucune valeur réelle. Le monitoring partagé et les commandes générales des
autres membres ne sont pas réécrits par cette passe.

## Retrouver les migrations

Une migration déjà appliquée possède une empreinte conservée par Prisma.
Même ajouter un commentaire dans son SQL changerait cette empreinte : les
six baselines et leurs fichiers de verrouillage restent donc intacts.
Leurs explications sont ici et dans [le schéma des données](SCHEMA_DONNEES.md),
[la conception](CONCEPTION_DONNEES.md) et [les permissions](../database/permissions/README.md).

| Baseline | Objets créés |
| --- | --- |
| [Auth](../services/auth-service/prisma/migrations/20260930090000_baseline_auth/migration.sql) | Comptes et demandes de profil durables, avec états, unicité de l’email et lien local compte–outbox. |
| [Users](../services/user-service/prisma/migrations/20260930090100_baseline_users/migration.sql) | Profils, inbox, amis et présences ; format canonique et unicité du username, bio nullable et relations locales. |
| [Catalogue](../services/catalog-service/prisma/migrations/20260930090200_baseline_catalog/migration.sql) | Artistes, morceaux, sorties, crédits et genres ; ordres et associations uniques, contraintes de publication. |
| [Media](../services/media-service/prisma/migrations/20260930090300_baseline_media/migration.sql) | Originaux et variantes ; clés de stockage uniques, tailles et durées cohérentes, états du fichier. |
| [Library](../services/library-service/prisma/migrations/20260930090400_baseline_library/migration.sql) | Playlists privées, occurrences et favoris ; version, positions uniques par playlist et suppression locale en cascade. |
| [Playback](../services/playback-service/prisma/migrations/20260930090500_baseline_playback/migration.sql) | Sessions et événements ; progression par séquence unique, temps bornés et historique du compte. |

## Relire les preuves

Les tests unitaires emploient des doublures lorsqu’il faut provoquer une
panne ou contrôler une horloge. Ils vérifient les règles et les refus,
mais une Map en mémoire ne prouve pas la persistance PostgreSQL.
Les campagnes suivantes complètent cette preuve :

- [Permissions](../tests/per/README.md) : six schémas, propriétaires, droits
  autorisés et refus entre services sur une base isolée.
- [Profil](../tests/e2e/README.md) : formulaire, HTTPS, SQL, avatar et
  relecture après redémarrage sur une pile isolée.
- [Musique](../tests/music/README.md) : Catalogue, audio, playlists et écoute
  avec témoins SQL et parcours Chromium.
- [Fichiers](../tests/files/README.md) : originaux, aperçus, progression,
  comptes distincts, suppression protégée et reprise. Ce runner substitue
  temporairement trois volumes de la pile existante puis restaure les
  volumes d’origine ; il ne crée pas une seconde pile.

Chaque README décrit les commandes et les effets de son runner. Lire le
traitement `cleanup` avant de lancer une campagne permet de comprendre
exactement quelles ressources seront nettoyées.
