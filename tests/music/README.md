# Tests des parcours musicaux

Depuis la racine du worktree `music-journeys`, utiliser exclusivement :

```sh
docker compose -p transcendence_music --env-file /dev/null -f tests/music/compose.yml config --quiet
docker compose -p transcendence_music --env-file /dev/null -f tests/music/compose.yml up -d --build --wait catalog-service
docker compose -p transcendence_music --env-file /dev/null -f tests/music/compose.yml exec -T catalog-service node -e "fetch('http://127.0.0.1:4002/ready').then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)})"
```

Cette configuration crée le projet `transcendence_music`, la base
`transcendence_music`, le réseau `transcendence_music_default` et le volume
`transcendence_music_music_db_data`. Elle ne lit aucun .env de développement,
ne monte aucun volume externe. Depuis CAT-6, Nginx publie uniquement
`127.0.0.1:3443` et Users utilise `transcendence_music_music_avatar_data`.
Auth/Users/frontend sont également isolés. Les identifiants
en clair sont exclusivement des identifiants de test dans une pile isolée.
Le préfixe historique e2e des mots de passe est conservé pour reprendre les
mêmes rôles de test ; il ne relie pas les stockages des deux projets.

Les six migrations existantes construisent leurs schémas, puis
apply-permissions attribue propriétaires et permissions. Son tmpfs évite le
volume de données anonyme hérité de l'image PostgreSQL. Catalogue reçoit
seulement la connexion catalog_runtime, jamais celle du rôle de migration.

Un `/ready` 200 prouve SELECT 1 par le rôle runtime, pas une route musicale.
En cas d'échec, consulter `compose ps --all` puis les logs du composant précis
sans diffuser de credentials. Une erreur de migration précède toute correction
de route ; une erreur de connexion appelle un contrôle des permissions/URL.

Le seed est disponible depuis CAT-3 : `run --rm --no-deps catalog-service npm run seed:demo`.
Le runner complet reste à produire en CAT-11. Aucun démarrage
de service ne doit installer automatiquement des données métier.

Depuis CAT-6 : `up -d --build --wait nginx`, puis
`curl --fail --insecure https://127.0.0.1:3443/api/catalog/tracks`.
Le certificat autosigné justifie --insecure uniquement dans cette pile locale.
Le détail utilise /api/catalog/tracks/{UUID} ; /api/catalog/metrics est refusé
par 403. `exec -T nginx nginx -t` vérifie la configuration de cette passerelle.

## Contrôles Catalogue

`node tests/music/http-scenario.mjs catalog` vérifie les réponses réelles.
`catalog-verify` rejoue les mêmes assertions sans réinstallation après arrêt/
relance de Catalogue ou `restart db`. La disponibilité est attendue de façon
bornée. `assert-catalog.sql` confirme en SQL le draft réellement présent.

Pour les cas de tri : passer catalog-edge.sql à psql dans cette pile avec
`-v cleanup=false`, exécuter `node tests/music/http-scenario.mjs catalog-edge`,
puis le même SQL avec `-v cleanup=true`. La garde du script refuse les autres
bases ; le nettoyage vise seulement les UUID des deux fixtures supplémentaires.
