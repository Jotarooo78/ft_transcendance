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
ne publie encore aucun port et ne monte aucun volume externe. Les identifiants
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

Le seed et le runner complet n'existent pas encore à CAT-2. Aucun démarrage
de service ne doit installer automatiquement des données métier.
