# Tests des fichiers sur la pile existante

Ce parcours utilise `docker-compose.yml` à la racine du dépôt. Il ne crée pas
de seconde pile. Les uploads privés ne sont pas encore implémentés : le guide
décrit d’abord les prérequis, puis sera complété avec les scénarios produits.

## Cibles

Configuration observée le 13 octobre 2026 : projet `common_repo`, base
`transcendence`, HTTPS `https://127.0.0.1:1443`.

| Stockage | Volume |
| --- | --- |
| PostgreSQL | common_repo_db_data |
| Audios Media | common_repo_media_data |
| Avatars Users | common_repo_avatar_data |

`common_repo_prometheus_data` et `common_repo_grafana_data` ne font pas partie
des données de test. Ne pas utiliser `down --volumes` pour nettoyer ce parcours.
Avant toute suppression future, vérifier le projet, la base, le montage réel
et la liste des UUID créés par le scénario ; ne pas déduire la cible d'un nom
de dossier. Toute réinitialisation complète reste distincte du nettoyage.

## Démarrer et contrôler

Depuis `/home/ange/common_core/transcendence/common_repo`, avec Docker/Compose
disponibles et `.env` local renseigné :

```bash
docker compose -f docker-compose.yml config --quiet
docker compose -f docker-compose.yml up -d --build db auth-service user-service catalog-service media-service library-service playback-service frontend nginx
docker compose -f docker-compose.yml ps -a
```

Le démarrage applique les six migrations puis les permissions. Les migrations
et `apply-permissions` doivent terminer avec le code 0. Si elles échouent,
diagnostiquer avant de tester les routes ; ne pas supprimer la base pour
masquer l’échec. Une base ancienne peut demander une reprise documentée des
schémas et de l’historique, distincte d’un simple démarrage.

Les variables de connexion runtime et migration doivent utiliser les rôles
dédiés définis dans `.env.example`. Les douze variables de mots de passe
utilisées par le bootstrap doivent être cohérentes avec ces connexions.
Ne jamais publier `.env`, les mots de passe ou la sortie complète de `config`.

Après démarrage réussi, contrôler les réponses réelles :

```bash
curl --fail --silent --show-error --insecure https://127.0.0.1:1443/api/catalog/ready
curl --fail --silent --show-error --insecure https://127.0.0.1:1443/api/media/ready
```

Attendu : 200 et état ready pour les deux services. `--insecure` sert uniquement
au certificat auto-signé de cette pile locale ; ne pas le reprendre pour un
serveur public. Un conteneur running ou une page HTML 200 ne prouve pas la
disponibilité de la route : vérifier également le corps JSON du service.

## Vérifier la session et la propriété

Depuis la racine, construire l’image de test puis lancer les contrôles Media :

```bash
docker compose -f docker-compose.yml build migrate-media
docker compose -f docker-compose.yml run --rm --no-deps migrate-media npm test
```

`authenticate-user.ts` vérifie la signature HS256, l’expiration obligatoire et
le sujet UUID du jeton, puis place l’identité sur la requête. Les futures routes
privées devront utiliser cette fonction dans leur hook `onRequest`.
`read-owned-asset.ts` reçoit cette requête et le client Prisma Media : il cherche
simultanément `id` et `uploaderUserId`. Sans identité valide, il ne consulte pas
la base. Un fichier étranger, sans propriétaire ou absent donne le même `null`.
La route privée devra traduire ce résultat en 404 ; une erreur de base doit
rester une erreur de service. Le formulaire ne fournit jamais le propriétaire.

`file-access.test.ts` utilise de vrais jetons signés et une route présente
uniquement dans le test. Une doublure de Prisma compte les lectures et applique
les deux conditions aux fichiers de A, de B et du catalogue sans propriétaire.
Les tests vérifient les refus avant lecture, les deux sens A/B et la résistance
aux identifiants de propriétaire falsifiés dans le formulaire ou la requête.
`app.test.ts` conserve les contrôles sur de vrais octets audio temporaires,
GET, HEAD, plages et publication ; la lecture publique reste sans connexion.

Ces tests ne créent ni compte ni ligne SQL. Ils prouvent les fonctions et leur
composition Fastify, pas encore le parcours privé HTTPS/PostgreSQL/navigateur.
Aucune route privée de gestion n’est livrée à l’étape 4. `JWT_SECRET` doit être
non vide au démarrage ; Compose le fournit déjà via `.env`, sans exposer sa
valeur dans les rapports.

## Données des prochains scénarios

Créer A et B par l’inscription réelle avec un identifiant de campagne unique,
par exemple le préfixe `files-<campagne>-a` et `files-<campagne>-b`. Conserver
les UUID réellement retournés dans un fichier d’état local privé et ignoré
par Git, plutôt qu’utiliser des UUID supposés. Ne pas inscrire de jetons ou
mots de passe dans les rapports. A et B doivent avoir des fichiers distincts.

Préparer des audios synthétiques et des images générées, valides, invalides,
tronqués et hors limites selon [FILES_CONTRACT.md](../../docs/music/FILES_CONTRACT.md).
Ne pas utiliser les fichiers du catalogue comme uploads personnels : les
assets de démonstration `30000000-0000-4000-8000-000000000001` à `003` restent
hors nettoyage de ce parcours.

Après implémentation, nettoyer les uploads personnels via leur vraie route
DELETE, avec leur propriétaire et les UUID du manifeste ; contrôler leurs
variantes et métadonnées. Une fixture de référence Catalogue ajoutée pour un
test négatif doit être retirée par une opération ciblée avant l’effacement du
fichier. Les éventuelles écritures SQL de fixtures doivent vérifier
`current_database() = 'transcendence'` et viser uniquement les UUID enregistrés.
Les comptes créés pour la campagne sont conservés tant qu’aucun nettoyage
ciblé des références Auth/Users/Library/Playback n’est produit et vérifié.
Ne jamais supprimer globalement des tables, des comptes ou des volumes.

## État du contrôle initial

Le 13 octobre 2026, la configuration Compose est valide et la base démarre.
Les migrations Catalogue, Media, Library et Playback terminent avec succès.
Le premier démarrage a révélé des schémas Auth/Users anciens : Auth P3005
(schéma non vide), Users P3018 (table profiles existante). La reprise a
conservé les données : ajout de bio, friends, presences et de la contrainte
canonique des usernames après vérification de zéro profil incompatible ;
enregistrement des deux baselines dans les schémas auth/users et application
des scripts existants de propriété et permissions. Le .env local utilise
désormais les rôles dédiés et la connexion migration Users cible users, pas
public. Ces opérations ne doivent pas être rejouées aveuglément : comparer
le schéma avant toute reprise. Aucun volume n’a été réinitialisé.

Contrôle final effectué le 13 octobre 2026 : les six migrations et
apply-permissions terminent avec le code 0 ; Auth, Users, Catalogue, Media,
Library et Playback répondent tous 200 avec le JSON ready attendu via HTTPS
1443. Ces réponses confirment les connexions et la passerelle, pas les futurs
uploads, aperçus ou suppressions. Aucun compte ni fichier personnel de test
n’a été créé à cette étape ; leurs identifiants seront enregistrés lors des
scénarios suivants.
