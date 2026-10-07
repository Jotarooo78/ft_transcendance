# Configuration locale avec `.env`

## Préparer les variables

Depuis la racine du dépôt :

```sh
cp .env.example .env
```

Remplacer chaque valeur `change_me` dans `.env`. Ce fichier reste local et
ignoré par Git ; `.env.example` ne contient que des valeurs fictives.

## Comptes PostgreSQL

`DB_USER` et `DB_PASSWORD` configurent uniquement l'administrateur local chargé
de créer la database, les schémas et les rôles. Les services ne reçoivent pas
ses identifiants.

Chaque domaine utilise deux comptes techniques distincts :

| Compte | Utilisation |
| --- | --- |
| `<service>_migration` | migrations Prisma et propriété des objets |
| `<service>_runtime` | serveur HTTP et opérations DML autorisées |

Les douze mots de passe sont déclarés avec les variables
`AUTH_MIGRATION_PASSWORD`, `AUTH_RUNTIME_PASSWORD`, puis le même couple pour
`USERS`, `CATALOG`, `MEDIA`, `LIBRARY` et `PLAYBACK`.

Les URLs `<SERVICE>_MIGRATION_DATABASE_URL` et `<SERVICE>_DATABASE_URL`
utilisent ces comptes et indiquent le schéma concerné. Il n'existe plus d'URL
`DATABASE_URL` commune aux six services.

## Démarrage depuis une base neuve

Le script `database/init/10-bootstrap-roles.sh` est exécuté par PostgreSQL
uniquement lors de la création initiale du volume. Il crée les 12 rôles et les
six schémas. Compose applique ensuite les six baselines et les permissions.

```sh
docker compose up --build
```

Un ancien volume ne rejoue pas les scripts d'initialisation. La reconstruction
décrite ici suppose donc une nouvelle database ou un volume neuf, créé après
l'archivage ou la sauvegarde voulue par l'équipe.

## Secrets applicatifs

`INTERNAL_SERVICE_TOKEN` protège le contrat HTTP privé entre Auth et Users. Il
doit être long, aléatoire, identique dans les deux conteneurs et différent de
`JWT_SECRET`. `USER_SERVICE_URL` est fourni par Compose à Auth sous la forme
`http://user-service:4001`.

La liste des tables, des propriétaires et des cardinalités est documentée dans
[`docs/SCHEMA_DONNEES.md`](docs/SCHEMA_DONNEES.md). Les commandes Prisma sont
documentées dans [`services/PRISMA.md`](services/PRISMA.md).

## Catalogue et audio de démonstration

Media utilise `MEDIA_STORAGE_DIR=/data/audio`, conservé dans le volume
`media_data`, et `CATALOG_SERVICE_URL=http://catalog-service:4002` pour vérifier
par HTTP qu’un asset appartient à une piste publiée. Il n’accède pas au schéma
SQL Catalogue. Ces variables sont fournies par Compose, pas au navigateur.

Après migrations et permissions, une installation volontaire des trois sons
de démonstration se fait par `docker compose exec catalog-service npm run
seed:demo`, puis `docker compose exec media-service npm run seed:demo`.
Les seeds sont explicites et réutilisent seulement des données cohérentes.
Aucun fichier audio n’est créé automatiquement au démarrage des serveurs.

Le navigateur utilise `/api/media/assets/:id/audio` via HTTPS. Nginx transmet
GET, HEAD et Range ; `/api/media/metrics` est refusé publiquement. Les fichiers
WAV de six secondes ont leur contrat dans `docs/music/MEDIA_CONTRACT.md`.

La pile `tests/music/compose.yml` utilise sa propre base et le volume
`music_media_data`, avec le seul port local 3443 et sans `.env` de développement.
Les preuves de cette branche sont exécutées dans cette pile isolée.
