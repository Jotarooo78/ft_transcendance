# Contrat Catalogue — CAT-1

Ce contrat décrit la cible à implémenter dans CAT-4 à CAT-8. À sa rédaction,
aucune route métier Catalogue n'existe. Les exemples ci-dessous sont proposés,
pas capturés depuis un serveur.

## Responsabilité et visibilité

Le flux est navigateur → HTTPS/Nginx → Catalogue → schéma PostgreSQL `catalog`.
Catalogue ne lit jamais les tables Media. Il publie uniquement les morceaux
dont `tracks.status = 'published'`. Le détail d'un brouillon, morceau retiré ou
UUID absent est indistinguable : 404. Les lectures sont publiques et sans JWT.

Les routes internes sont `GET /tracks` et `GET /tracks/:id`. La passerelle les
expose sous `/api/catalog`. Les routes techniques existantes restent séparées.

## Objet transporté (DTO)

| Champ | Type JSON | Source et transformation |
| --- | --- | --- |
| id | string UUID | `tracks.id` |
| title | string | `tracks.title` |
| artistName | string | noms des artistes crédités primary/featured uniquement, primary avant featured, puis `credit_order` et UUID ; joindre par `, ` ; vide sans crédit |
| albumTitle | string | titre de la première sortie publiée, ordre par date puis UUID (dates absentes en dernier) ; vide sans sortie publiée |
| genre | string | premier nom de genre par ordre lexical puis UUID ; vide sans genre |
| durationMs | number ou null | `tracks.duration_ms`, conversion BigInt en entier JSON sûr, millisecondes |
| durationSeconds | number ou null | `durationMs / 1000`, sans arrondi ; null si durée inconnue |
| audioAssetId | string UUID ou null | `tracks.audio_asset_id`, référence logique Media |
| audioUrl | string ou null | `/api/media/assets/{audioAssetId}/audio`, null sans référence |

Ne pas exposer createdByUserId, storageKey, chemins locaux, identifiants de
connexion ni modèle Prisma brut. Une durée hors domaine entier sûr est une
incohérence de stockage (503), jamais un entier arrondi silencieusement.
Une URL audio ne prouve ni la présence ni la disponibilité du fichier ; MED
assure sa diffusion. L'interface doit représenter les valeurs null honnêtement.

## Liste et paramètres

`GET /api/catalog/tracks` renvoie `{ items, page, pageSize, total, genres }`.
`items` contient les DTO ; `total` compte exactement l'ensemble publié filtré,
avant pagination. `genres` contient tous les noms distincts, triés, liés à des
morceaux publiés, indépendamment de la recherche et de la page.

| Paramètre | Défaut | Validation et effet |
| --- | --- | --- |
| page | 1 | entier décimal positif ; offset calculé doit rester entier sûr |
| pageSize | 20 | entier de 1 à 100 |
| q | chaîne vide | au plus 200 caractères avant trim ; recherche littérale insensible à la casse dans titre, artistes, sorties publiées et genres |
| genre | chaîne vide | au plus 200 caractères ; nom exact après trim ; vide signifie tous |
| sort | title | `title`, `artist` ou `duration`, croissant |

Les valeurs dupliquées, paramètres inconnus, entiers fractionnaires/négatifs
et valeurs hors bornes sont refusés par 400. Les caractères `%` et `_` de q
sont recherchés littéralement, pas interprétés comme jokers SQL. Toutes les
valeurs sont liées comme paramètres, jamais interpolées dans du SQL.

Le tri s'applique avant offset/limit à l'ensemble filtré, puis utilise l'UUID
croissant comme départage. `artist` trie la valeur artistName du DTO ; `duration`
trie durationMs avec les durées null en dernier. Le tri textuel emploie une
collation PostgreSQL explicite et stable (`C`), documentée comme sensible à la
casse pour le tri, indépendamment de la recherche. Il ne promet pas un ordre
linguistique localisé. Liste et total sont lus sur un instantané cohérent.

Une recherche sans résultat ou une page au-delà du dernier élément retourne
200, items vide et le total correct. Elle ne constitue pas une panne.

Exemple proposé pour `?pageSize=2` :

```json
{
  "items": [
    {"id":"20000000-0000-4000-8000-000000000001","title":"Aube — demo","artistName":"Atelier Demo","albumTitle":"","genre":"Demo","durationMs":6000,"durationSeconds":6,"audioAssetId":"30000000-0000-4000-8000-000000000001","audioUrl":"/api/media/assets/30000000-0000-4000-8000-000000000001/audio"},
    {"id":"20000000-0000-4000-8000-000000000002","title":"Brise — demo","artistName":"Atelier Demo","albumTitle":"","genre":"Demo","durationMs":6000,"durationSeconds":6,"audioAssetId":"30000000-0000-4000-8000-000000000002","audioUrl":"/api/media/assets/30000000-0000-4000-8000-000000000002/audio"}
  ],
  "page":1,"pageSize":2,"total":3,"genres":["Demo"]
}
```

## Détail et erreurs

`GET /api/catalog/tracks/:id` valide une représentation UUID canonique avant
toute lecture. Il renvoie directement un DTO, sans enveloppe supplémentaire.

Exemple proposé de réponse 200 :

```json
{"id":"20000000-0000-4000-8000-000000000001","title":"Aube — demo","artistName":"Atelier Demo","albumTitle":"","genre":"Demo","durationMs":6000,"durationSeconds":6,"audioAssetId":"30000000-0000-4000-8000-000000000001","audioUrl":"/api/media/assets/30000000-0000-4000-8000-000000000001/audio"}
```

| Statut | Situation | Corps |
| --- | --- | --- |
| 400 | UUID ou paramètres invalides | `{"error":"invalid_request"}` |
| 404 | morceau absent, draft ou withdrawn | `{"error":"track_not_found"}` |
| 503 | lecture SQL indisponible ou données non représentables | `{"error":"catalog_unavailable"}` |

Les erreurs ne contiennent ni SQL ni détail de connexion. Le client distingue
chargement, erreur avec réessai et liste vide ; une ancienne réponse ne remplace
pas la recherche courante. La panne du détail ne doit pas effacer la liste.

## Contrôle de cette sous-action

Relu contre `backend/services/catalog-service/prisma/schema.prisma`,
`frontend/src/types/music.ts` et `frontend/src/pages/CatalogPage.tsx` à partir
de la révision 182c75e. Chaque champ a une source ou une dérivation explicite.
Les exemples JSON sont vérifiés syntaxiquement ; aucune API n'a été testée à
ce stade. Les preuves réelles sont prévues dans CAT-9 à CAT-11.

Ce fichier est la référence du format des requêtes/réponses pour le service,
le client et leurs tests ; il n'exécute aucune migration ni installation.
# Projets musicaux — contrat de l’évolution

Le parcours ordinateur conserve l’ajout d’un titre seul et ajoute album, mixtape
et EP. Un projet appartient au compte connecté ; les noms d’artistes viennent de
Users. Aucun crédit éditable, genre obligatoire ou programmation n’est ajouté.
Les titres sont préremplis, la pochette est facultative et la date de sortie est
fixée à la première publication, puis conservée lors des modifications.

Les projets réutilisent `Release` et `ReleaseTrack`. Les modifications privées
portent une version attendue pour refuser l’écrasement d’un autre onglet. Le
brouillon garde ses fichiers prêts après reconnexion ; un transfert interrompu
peut nécessiter une nouvelle sélection. La publication est une transition
atomique du catalogue : les morceaux doivent tous être prêts et appartenir au
compte. Réessayer une publication ne crée pas de nouvelle identité.

Routes prévues, relatives à `/api/catalog` : `GET /projects` (public),
`GET /projects/:id` (public), `GET /me/projects` (privé),
`PUT /me/projects/:id` (création ou sauvegarde versionnée),
`POST /me/projects/:id/publish` et `DELETE /me/projects/:id` (abandon d’un brouillon).
Le client choisit un UUID stable avant la création pour retrouver un résultat
incertain. Les détails publiés contiennent les morceaux dans leur ordre.
Les brouillons ne paraissent ni dans la recherche ni dans les lectures publiques.

La recherche distingue comptes artistes, projets et titres. Les modifications
de titre, description, pochette et ordre conservent les identifiants des objets.
Le remplacement des octets d’un audio publié n’est pas inclus dans cette étape.
Ces paragraphes définissent la cible ; ils ne constituent pas une preuve
d’implémentation ou de tests réussis.

## Responsabilités des projets réalisés

`domain/project.ts` nettoie les textes et contrôle les références de pochette et
les doublons. `schemas/projects.schema.ts` borne les requêtes à cent pistes.
`repositories/projects.repository.ts` conserve l’ordre, prend les verrous de
projet et d’audio, vérifie les versions et écrit les transitions atomiquement.
`services/projects.service.ts` authentifie auprès de Users, réserve dans Media
puis transforme les données privées ou publiques. Le contrôleur adapte HTTP ;
les routes appliquent les schémas et interdisent le cache. `server.ts` injecte
le stockage réel ; les tests injectent seulement les dépendances nécessaires.

Le nettoyage des pistes retirées est une liste `pending_cleanup` durable sur le
projet. Une piste abandonnée garde un identifiant retiré, sans référence audio,
pour interdire sa republication par l’ancien endpoint. Media vérifie encore
l’absence de référence avant libération et suppression. Un échec de nettoyage
renvoie une erreur ; reprendre la même sauvegarde ou suppression traite la file
restante sans perdre le projet déjà enregistré. Un fichier réservé avant une
écriture au résultat incertain reste protégé plutôt que supprimé prématurément.

`test/projects.integration.ts` exerce de vraies transactions PostgreSQL avec
Users/Media simulés : ces preuves couvrent le stockage, pas le transport audio.
Sa variable PROJECT_TEST_DATABASE_URL exige une cible jetable explicite ; la
campagne HTTP complète reste nécessaire pour vérifier le parcours interservices.

Le tri récent des projets utilise `publishedAt`, instant immuable de première
publication, distinct de `releaseDate` (date affichée) et `createdAt` (création du
brouillon). Une édition ne remonte donc pas artificiellement le projet dans les
ajouts récents. Les anciennes sorties sont reprises avec leur meilleure date
historique disponible lors de la migration.
