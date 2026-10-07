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
Le runner Catalogue est disponible depuis CAT-11. Aucun démarrage
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

`npm ci --prefix tests/music`, `npm run install:browser --prefix tests/music`,
puis `npm test --prefix tests/music -- --grep catalog` exécutent le navigateur.
Le scénario utilise de vraies réponses de succès ; les refus simulés sont
identifiés et suivis d’un retour au vrai serveur. Une réponse réelle retardée
vérifie qu’une ancienne recherche ne remplace pas la plus récente.

## Campagne reproductible

```sh
tests/music/run.sh catalog
```

Pré requis : Node 22, npm, Docker/Compose accessibles, bibliothèques système de
Chromium comme pour PCE. Le script installe la version Playwright verrouillée.
Les noms du projet, des volumes et du réseau, la base et le seul port 3443
sont contrôlés avant tout nettoyage. Seules les ressources transcendence_music
sont supprimées ; les projets PCE et développement ne sont pas ciblés.

Ordre des phases : garde/configuration → nettoyage initial → construction →
tests Catalogue → lint/build frontend → navigateur → migrations/permissions/
readiness → double seed avec SQL → HTTPS → fixtures de tri → redémarrage
Catalogue et vérification → redémarrage PostgreSQL et vérification → Chromium.
Le trap nettoie aussi après échec ; le PASS final exige la campagne et son
nettoyage réussis. La révision et l’état modifié éventuel sont affichés.

En cas d’échec, partir du nom de phase : syntaxe/configuration, premier test
échoué, service non prêt, assertion SQL/HTTP précise ou attente navigateur.
Les logs applicatifs complets ne sont pas déversés pour éviter d’exposer des
tokens. Rejouer une phase isolément si nécessaire, puis la campagne corrigée.

## Campagne Media

`tests/music/run.sh media` inclut les contrôles Catalogue, trois tests Media,
deux seeds audio/SQL, empreintes HTTPS, HEAD/plages/refus, panne Catalogue
et redémarrages Media puis DB sans seed. Le volume supplémentaire isolé est
`transcendence_music_music_media_data`. La garde et le nettoyage couvrent
les trois volumes musicaux, y compris celui des avatars utilisé pour Auth/Users.

`media-edge.sql` crée des assets réservés pending/retiré/fichier absent.
Le runner copie deux WAV sous des noms dédiés, laisse le troisième absent,
vérifie les refus réels puis retire exactement ces fixtures SQL et fichiers.
Le scénario `media-verify` compare les trois empreintes MED-2 sans réinstaller
de données ; `media-unavailable` attend 503 lors de l’arrêt de Catalogue.

Le test navigateur media s’inscrit et se connecte réellement, observe une
réponse audio, la durée décodée, deux positions croissantes, puis un seek
suivi d’une nouvelle progression. Aucun événement audio n’est fabriqué.
Seule la panne 404 est simulée ; changement de piste et nouvelle tentative
retournent ensuite aux octets du serveur. Les contrôles HTTP prouvent le
transport, les empreintes après redémarrage le stockage, Chromium le décodage.

## Campagne Library

`tests/music/run.sh library` inclut Catalogue/Media, huit tests Library,
les contrôles HTTP/SQL des propriétaires, occurrences, versions, concurrence
réelle, cascade et redémarrages sans seed. `library-unavailable` attend 503
pour l’ajout pendant la panne Catalogue et conserve les mutations locales.
`library-verify` se reconnecte avec les comptes de test et relit les mêmes UUID.
`library-cleanup` supprime uniquement leurs playlists et SQL vérifie la cascade.
Le fichier `/tmp/transcendence-music-library-state.json` contient seulement
les identités de test et DTO de preuve, jamais les tokens ni mots de passe.
Pour exécuter SQL seul, passer son contenu à psql via
`-v fixture="$(cat /tmp/transcendence-music-library-state.json)" -v cleanup=false`
puis fournir `assert-library.sql` sur stdin. Utiliser `cleanup=true` après
le mode cleanup.

Le navigateur crée une playlist vide, répète un morceau, retire une occurrence,
édite avec conflit réel puis retrouve les mêmes identités après reconnexion
et dans un contexte neuf. B reste isolé malgré une vraie réponse A retardée.
Une valeur localStorage témoin est conservée sans import. Les pannes réseau
création/édition/retrait/suppression et le 404 Catalogue sont des simulations
explicitement délimitées ; les succès et la persistance utilisent le serveur.
La suppression attend une confirmation puis 204 avant fermeture du lecteur.

Les sessions d’écoute restent à réaliser.
`docs/music/EXECUTION.md` conserve les résultats et les révisions observées.
